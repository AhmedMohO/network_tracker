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

-- 90-day retention, matching what the on-device archive is for.
create or replace function family_prune() returns void
language sql security definer set search_path = public as $$
  delete from family_snapshots where updated_at < now() - interval '90 days';
$$;

-- Postgres grants EXECUTE on every new function to PUBLIC by default, so an
-- explicit `grant ... to anon` would widen nothing and would leave
-- `family_prune` exposed on /rest/v1/rpc/family_prune to anyone holding the
-- anon key. Revoke PUBLIC on all four, then re-grant only the three that
-- are the API.
revoke all on function family_push(text, text, text, text, bigint, jsonb) from public, anon, authenticated;
revoke all on function family_pull(text, timestamptz) from public, anon, authenticated;
revoke all on function family_forget(text) from public, anon, authenticated;

-- Never reachable from the client. Only the pg_cron job, which runs as the
-- function owner, needs to call this.
revoke all on function family_prune() from public, anon, authenticated;

grant execute on function family_push(text, text, text, text, bigint, jsonb) to anon;
grant execute on function family_pull(text, timestamptz) to anon;
grant execute on function family_forget(text) to anon;


-- ---------------------------------------------------------------------------
-- Push-to-sync.
--
-- Everything above assumes the child's phone decides when to talk. Android
-- disagrees: `expo-background-task` is a WorkManager request, and WorkManager
-- obeys the App Standby bucket, so an idle phone's "every 15 minutes" becomes
-- roughly once a day. This section is the other direction — the server pokes
-- the device — which is the only mechanism on Android that reaches a Dozing,
-- backgrounded app on a schedule the server chooses.
--
-- Delivery goes through Expo's push service rather than FCM directly: it takes
-- a plain POST with no OAuth dance, so the whole server side is the two
-- functions below plus a cron entry, instead of a deployed function that has
-- to mint and refresh Google service-account JWTs. See docs/push-setup.md.
-- ---------------------------------------------------------------------------

-- Deliberately not a column on family_snapshots: a token belongs to a device,
-- not to any one of its four row kinds, and `family_forget` must be able to
-- drop it without reasoning about which snapshot rows exist.
create table if not exists family_push_tokens (
  pair_token text        not null,
  device_id  text        not null,
  push_token text        not null,
  updated_at timestamptz not null default now(),
  primary key (pair_token, device_id)
);

alter table family_push_tokens enable row level security;
revoke all on family_push_tokens from anon, authenticated;

create or replace function family_register_token(p_token text, p_device text, p_push text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_token !~ '^[0-9a-f]{32}$' then
    raise exception 'bad token';
  end if;
  -- Anything else is not an Expo token, and letting an arbitrary string
  -- through would make this table an open relay for whatever exp.host would
  -- accept. The app never sends any other shape.
  if p_push !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'bad push token';
  end if;
  insert into family_push_tokens (pair_token, device_id, push_token, updated_at)
  values (p_token, p_device, p_push, now())
  on conflict (pair_token, device_id)
  do update set push_token = excluded.push_token, updated_at = now();
end $$;

-- Both of these replace definitions from earlier in this file, and have to sit
-- *after* `family_push_tokens` exists: Postgres parses a function body at
-- creation time, so naming the table before the `create table` above would
-- fail the whole script on a fresh database.

-- Push tokens age out with the snapshots they belong to. A device with no
-- snapshot left inside the window is one `family_ping_stale` would never
-- select anyway, so its token is nothing but a stale identifier.
create or replace function family_prune() returns void
language sql security definer set search_path = public as $$
  delete from family_snapshots   where updated_at < now() - interval '90 days';
  delete from family_push_tokens where updated_at < now() - interval '90 days';
$$;

-- "Delete my data" has to mean this table too, or an unpaired device keeps
-- being woken by a family it has left.
create or replace function family_forget(p_token text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from family_snapshots  where pair_token = p_token;
  delete from family_push_tokens where pair_token = p_token;
end $$;

-- Wakes every device whose `recent` row has gone stale. Returns how many were
-- pinged, so the cron job's history is readable in `cron.job_run_details`.
--
-- The two bounds in the WHERE clause are the whole design:
--
--   stale  -- older than 20 minutes. A device that is syncing on its own is
--            never pinged, so a healthy family costs nothing.
--   alive  -- but newer than 7 days. Without this, an uninstalled app's token
--            would be pushed to every 15 minutes forever; a device silent for
--            a week is not coming back because of a notification.
--
-- Data-only (no title, no body) so nothing is shown to the user: this is a
-- knock on the door, and the app reads none of the payload — see
-- PUSH_SYNC_TASK in features/limits/backgroundCheck.ts.
create or replace function family_ping_stale() returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  messages jsonb;
  n integer;
begin
  -- The LIMIT has to be inside the subquery: applied outside, it would cap
  -- the single aggregate row at one and cap nothing at all.
  select jsonb_agg(jsonb_build_object(
           'to', d.push_token,
           'data', jsonb_build_object('kind', 'sync'),
           'priority', 'high',
           '_contentAvailable', true
         )),
         count(*)
    into messages, n
    from (
      select t.push_token
        from family_push_tokens t
        join family_snapshots s
          on  s.pair_token = t.pair_token
          and s.device_id  = t.device_id
          and s.kind = 'recent'
          and s.day  = 0
       where s.updated_at < now() - interval '20 minutes'
         and s.updated_at > now() - interval '7 days'
       -- Expo accepts 100 messages per request; a larger family waits for the
       -- next tick rather than this function learning to paginate.
       order by s.updated_at
       limit 100
    ) d;

  if messages is null then
    return 0;
  end if;

  perform net.http_post(
    url     := 'https://exp.host/--/api/v2/push/send',
    body    := messages,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Accept', 'application/json'
               )
  );
  return n;
end $$;

revoke all on function family_register_token(text, text, text) from public, anon, authenticated;
grant execute on function family_register_token(text, text, text) to anon;

-- Never reachable from the client: only the cron job calls it.
revoke all on function family_ping_stale() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One-time setup (run as owner, e.g. from the Supabase SQL editor):
--
--   create extension if not exists pg_net  with schema extensions;
--   create extension if not exists pg_cron with schema extensions;
--
--   select cron.schedule('family-ping', '*/15 * * * *',
--                        $ping$ select family_ping_stale() $ping$);
--
-- To stop it:  select cron.unschedule('family-ping');
-- To inspect:  select * from cron.job_run_details order by start_time desc limit 20;
--              select * from net._http_response order by created desc limit 20;
-- ---------------------------------------------------------------------------
