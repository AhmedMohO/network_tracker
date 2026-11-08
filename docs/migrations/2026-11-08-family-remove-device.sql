-- Apply in the Supabase SQL editor before distributing the Kotlin fixes.
-- A child's departure is a delta-visible tombstone, never a family-wide delete.
create or replace function family_remove_device(p_token text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' or p_device is null or length(p_device) = 0 then
    raise exception 'Invalid family or device';
  end if;
  delete from family_snapshots where pair_token = p_token and device_id = p_device;
  delete from family_push_tokens where pair_token = p_token and device_id = p_device;
  insert into family_snapshots (pair_token, device_id, device_label, kind, day, payload)
  values (p_token, p_device, '', 'recent', 0, '{"unpaired":true}'::jsonb)
  on conflict (pair_token, device_id, kind, day) do update
    set payload = excluded.payload, updated_at = now();
end $$;

revoke all on function family_remove_device(text, text) from public, anon, authenticated;
grant execute on function family_remove_device(text, text) to anon;
