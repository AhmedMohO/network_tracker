# Making background sync actually happen

Three independent mechanisms, weakest first. They all trigger the same
`runUsageCheck`, and every one of them is idempotent, so having all three
costs nothing but makes it very unlikely that none fires.

| # | Mechanism | Needs | Reliability |
|---|-----------|-------|-------------|
| 1 | WorkManager (`expo-background-task`) | nothing, already shipped | poor — App Standby can defer it a day |
| 2 | `AlarmManager` + foreground service (`SyncKeepAlive`) | user turns on one switch | good — fires in Doze |
| 3 | Server push (`family_ping_stale` → Expo → device) | the setup below | best — independent of the device's own scheduling |

## Why WorkManager alone is not enough

`registerBackgroundCheck` asks for `minimumInterval: 15`. That is a request.
The actual cadence is set by the App Standby bucket the device puts the app in:

| Bucket | Roughly |
|--------|---------|
| active | as requested |
| working set | ~2 h |
| frequent | ~8 h |
| rare | ~24 h |
| restricted | ~24 h+, often never |

A phone that is not opened daily falls to `rare` within days. This is the whole
explanation for "the child paired, pushed 30 days of backfill plus one `recent`
row, and then never pushed again" — 31 rows, frozen.

The two device-side fixes are exposed in Settings › Background updates:
"Allow background activity" (the battery-optimisation exemption, the single
highest-value one) and "Keep updates on time" (mechanism 2).

## Setting up mechanism 3

Two manual steps. Until both are done the app is unaffected — `registerPushToken`
gives up quietly when no token can be issued, and the other two mechanisms carry
the load.

### 1. FCM credentials on the EAS project

Expo's push service delivers through FCM, so Android needs an FCM v1 key even
though the app never talks to Firebase directly.

1. Create a Firebase project and add an Android app with package
   `com.anonymous.network_tracker` (must match `android.package` in `app.json`).
2. Download `google-services.json`, put it at the repo root, and point
   `app.json` at it:
   ```json
   "android": { "googleServicesFile": "./google-services.json" }
   ```
3. In Firebase console → Project settings → Service accounts → Generate new
   private key. Upload it to EAS:
   ```
   eas credentials
   # Android → production → Google Service Account → FCM V1
   ```
4. Rebuild. This is a native change; an OTA will not pick it up.

Verify a token is issued: pair the device, then check that
`family_push_tokens` has a row for it.

### 2. Database side

`docs/family-schema.sql` already contains `family_push_tokens`,
`family_register_token` and `family_ping_stale`. Run the file, then, as the
project owner in the Supabase SQL editor:

```sql
create extension if not exists pg_net  with schema extensions;
create extension if not exists pg_cron with schema extensions;

select cron.schedule('family-ping', '*/15 * * * *',
                     $ping$ select family_ping_stale() $ping$);
```

Checking on it:

```sql
-- did the job run, and what did it return
select * from cron.job_run_details order by start_time desc limit 20;

-- what Expo said back (pg_net is async; responses land here)
select * from net._http_response order by created desc limit 20;

-- who is currently considered stale
select t.device_id, s.updated_at
  from family_push_tokens t
  join family_snapshots s
    on s.pair_token = t.pair_token and s.device_id = t.device_id
   and s.kind = 'recent' and s.day = 0
 order by s.updated_at;
```

To stop it: `select cron.unschedule('family-ping');`

### What gets sent

A data-only message with no title and no body, so nothing is shown to the user.
The app ignores the payload entirely — it is a knock on the door, not an
instruction — which is what stops a spoofed push from being able to steer the
device. See `PUSH_SYNC_TASK` in `src/features/limits/backgroundCheck.ts`.

`family_ping_stale` only wakes devices whose `recent` row is between 20 minutes
and 7 days old: a device syncing on its own is never pinged, and a device that
has been silent for a week is not coming back because of a notification, so its
token stops being pushed to rather than being retried forever.

## Checking whether any of it is working

Settings › Background updates now shows the last successful sync. Before this,
`lastSyncOkAt` was written on every run and read by nothing, and the only sign
that sync had died was a notification two days later.

Server-side, the row count is the giveaway. A healthy child gains one `daily`
row per day:

```sql
select device_id, kind, count(*)
  from family_snapshots
 where pair_token = '...'
 group by 1, 2;
```

Frozen at 30 `daily` + 1 `recent` means the pairing backfill ran and nothing
since.
