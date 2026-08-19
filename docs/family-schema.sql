-- One table for the whole feature. `kind` distinguishes what a row is:
--   'daily'   -- one complete day's rollup, day = that day's local start
--   'recent'  -- today so far plus device context, day = 0, upserted each check
--   'request' -- the child asking for a higher limit, day = 0
--   'grant'   -- the parent's answer, day = 0
-- Four kinds in one table rather than four tables: they share a primary key,
-- a retention rule and a delete path, and none of them is ever joined.
create table if not exists family_snapshots (
  pair_token   text        not null,
  device_id    text        not null,
  device_label text        not null default '',
  kind         text        not null check (kind in ('daily','recent','request','grant')),
  day          bigint      not null default 0,
  payload      jsonb       not null,
  updated_at   timestamptz not null default now(),
  primary key (pair_token, device_id, kind, day)
);

create index if not exists idx_family_token_updated
  on family_snapshots (pair_token, updated_at desc);

-- Deny everything by default. The three functions below are the only way in.
alter table family_snapshots enable row level security;
revoke all on family_snapshots from anon, authenticated;

create or replace function family_push(
  p_token text, p_device text, p_label text,
  p_kind text, p_day bigint, p_payload jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  -- Cheapest possible abuse brake: a token is 32 hex chars or it is not a token.
  if p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bad token';
  end if;
  insert into family_snapshots
    (pair_token, device_id, device_label, kind, day, payload, updated_at)
  values (p_token, p_device, p_label, p_kind, p_day, p_payload, now())
  on conflict (pair_token, device_id, kind, day)
  do update set payload      = excluded.payload,
                device_label = excluded.device_label,
                updated_at   = now();
end $$;

-- `p_since` lets the parent pull only what changed, so a daily poll does not
-- re-download 90 days of history every time.
create or replace function family_pull(p_token text, p_since timestamptz default '-infinity')
returns table (device_id text, device_label text, kind text, day bigint,
               payload jsonb, updated_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bad token';
  end if;
  return query
    select s.device_id, s.device_label, s.kind, s.day, s.payload, s.updated_at
      from family_snapshots s
     where s.pair_token = p_token and s.updated_at > p_since
     order by s.updated_at;
end $$;

-- Unpair. Callable from either device, deletes the whole pair. There is no
-- soft delete: "delete my data" that keeps the data is a lie.
create or replace function family_forget(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from family_snapshots where pair_token = p_token;
end $$;

grant execute on function family_push, family_pull, family_forget to anon;

-- 90-day retention, matching what the on-device archive is for.
create or replace function family_prune() returns void
language sql security definer set search_path = public as $$
  delete from family_snapshots where updated_at < now() - interval '90 days';
$$;
