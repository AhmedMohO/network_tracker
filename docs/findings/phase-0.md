# Phase 0 findings

Device: physical Android device (Samsung; per-app list contains Samsung system packages, Egyptian carrier apps "My WE" / "Ana Vodafone")
Date: 2026-08-18
Evidence: `docs/WhatsApp Image 2026-08-18 at 4.28.38 AM.jpeg`, `docs/WhatsApp Image 2026-08-18 at 4.29.04 AM.jpeg`

## Q1 — Usage access permission

- `AppOpsManager` check reflects the grant: **YES** — probe header renders `Usage access: GRANTED` after the grant.
- Value returned before grant: `MODE_DEFAULT` / not granted (probe rendered the un-granted state and the "Open usage access settings" button).
- Value returned after grant: `MODE_ALLOWED` — `hasUsageAccess()` returns `true`.
- Round-trip from app → Settings → back detects the change: **YES** — the `useFocusEffect` + `AppState` "active" re-check flips the header without an app restart.

## Q2 — Per-app totals accuracy

**Result: PASS.** `getAppUsage()` returns a full, labelled, per-UID breakdown.

- Query: last 7 days aligned to local midnight (`Aug 12 00:00 local` → now), `ALL`.
- Requested: `2026-08-11T21:00:00.000Z` → `2026-08-18T01:23:12.729Z` (device is UTC+3).
- Covered: `2026-08-11T21:00:00.000Z` → `2026-08-18T01:23:12.729Z` — **exact match**. `querySummary()` clamps its buckets to the query window, so `coveredStart`/`coveredEnd` equal the request for summary queries; the coverage note is therefore silent on the dashboard and only becomes meaningful for `getSeries()`.
- Totals: `rx 226,778,036` · `tx 40,513,250` (≈ 216 MiB down / 39 MiB up).
- ~70 UIDs returned, labels resolved for effectively all of them: Facebook (10312), Google Play Store (10238), BLFFD (10300), WhatsApp (10369), Google Services Framework (10236), Zoom, Google, Gmail, Messenger, Discord, ChatGPT, LinkedIn, YouTube, Truecaller, Telegram …
- UID→label resolution works for shared-UID and platform UIDs too: `5009 Samsung Cloud`, `1021 (unknown)`, `1073 Tethering`, `1000 Android System`, `0 Root`.
- `1021 · (unknown)` confirms `AppResolver`'s fallback path fires for UIDs with no resolvable package, and `displayName()` handles it.
- Rows sort cleanly by total; ordering is plausible for the device's actual use.

**Not separately validated against the Settings "Data usage" screen**, because Settings aggregates over a different (cycle-based) window and cannot be made to match the probe's midnight-aligned 7-day window exactly. The absolute totals, app ranking, and label resolution are all plausible and internally consistent, which is the bar Phase 1/2 actually need. Treat a large future discrepancy against Settings as a bug to investigate, not as a settled question.

## Q3 — Time bucket granularity

**Result: INCONCLUSIVE — the probe window contained no MOBILE traffic.**

- Requested: deliberately unaligned `14:37:00` → `16:12:00` local, `MOBILE`, 15-minute bins.
- Covered reported: `2026-08-18T11:37:00.000Z` → `2026-08-18T13:12:00.000Z` — i.e. exactly the requested window.
- Zero non-empty bins rendered.

`StatsReader.series()` falls back to `coveredStart = q.start` / `coveredEnd = q.end` when `queryDetails()` yields no buckets (`StatsReader.kt:134-137`). The covered range echoing the request is therefore the **empty-result fallback**, not evidence that Android honoured a sub-hour window. The device was almost certainly on Wi-Fi during 14:37–16:12, so there was no mobile traffic to bucket.

**Consequence — this is a live risk, not a closed question:**
- Android's documented behaviour is that `queryDetails()` buckets are ~2 hours wide and the returned range is snapped outward to bucket boundaries. `series()` already handles this honestly: it attributes each system bucket whole to the bin containing its start (`StatsReader.kt:120-123`) and reports the real `coveredStart`/`coveredEnd`.
- **The chart in Task 11 must render `coveredStart`/`coveredEnd` and the bin width it actually got, not the width it asked for.** Do not ship a 15-minute-labelled chart until a re-probe on a window with real mobile traffic proves sub-hour bins exist.
- Re-probe cheaply: switch the device to mobile data, stream something for a few minutes, then run the granularity probe over that window.

## Q4 — Live per-app feasibility

**Result: GO** — per-app live monitoring is feasible.

- Probe: every 2 s for 60 s, `getAppUsage()` over the trailing 10 s window, `MOBILE`.
- Every sample returned rows (5–7 rows per sample) — a 10-second-wide query is **not** rejected and **not** empty.
- The changed-set moved between consecutive samples with real, plausible apps: `10312 Facebook`, `10369 WhatsApp`, `10324 Messenger`, `1073 Tethering`, `10072 Meta Services`, `10312 Google Services Framework`, `1021 (unknown)`.

So a per-app live view is possible at roughly **2-second resolution over a 10-second trailing window**. It is *not* "MB/s per app" — it is "bytes attributed to this app in the last 10 seconds", and Phase 5 must label it exactly that way.

## Q5 (unplanned) — device-level `TrafficStats` counters are unreliable on this device

The 1 Hz device-counter probe produced two impossible samples inside a 30-second run:

```
01:22:50.804Z  mobile rx +1101.52 MB/s · tx +115.72 MB/s · total rx 0.00 · tx 0.00
01:23:01.893Z  mobile rx -1101.55 MB/s · tx -115.73 MB/s · total rx 0.00 · tx 0.00
```

The **mobile** counters jumped ~1.1 GB up and back down within 11 s while the **total** counters correctly stayed at 0.00 MB/s throughout. Mobile is a subset of total, so this is definitively a bad reading from `TrafficStats.getMobile*Bytes()`, not real traffic. Every other sample in the run was a clean 0.00.

The probe's `unsupported` flag did not catch it: that flag only fires when a raw counter is negative (the documented `UNSUPPORTED = -1` case). Here the raw counters were non-negative but internally inconsistent.

**Consequences for Phase 5 (live monitor):**
- Do **not** derive the live mobile rate from `TrafficStats.getMobileRxBytes()/getMobileTxBytes()`. Prefer `getTotalRxBytes()/getTotalTxBytes()` (stable in this run), or sum the per-app `NetworkStats` rows (Q4, proven working).
- Whatever the source, **clamp negative deltas to zero and reject implausible spikes** — a per-sample rate above the physical link ceiling is a bad reading, not a burst. A raw delta must never reach the UI unfiltered.

## Decisions

- Data source validated against Settings: **NO (not directly comparable)** — but `getAppUsage` output is complete, labelled, plausible and internally consistent. Proceeding.
- Minimum honest time granularity: **UNKNOWN — assume Android's ~2-hour `queryDetails` buckets.** The UI must render the coverage and bin width it actually received. Re-probe over a window with real mobile traffic before claiming anything finer.
- Foreground/background split available from bulk query: **YES** — `AppUsageRow.rxForegroundBytes`/`txForegroundBytes` are populated by the bulk query, so Task 11's detail screen does **not** need a separate `appStateUsage(uid, …)` per-UID call.
- Per-app live monitoring: **GO** — ~2 s cadence over a 10 s trailing window, labelled as "bytes in the last 10 s", never as "MB/s".
- Device-level live counters: use **total** counters or summed per-app rows; `TrafficStats` mobile counters are untrustworthy on this device and every delta needs clamping + spike rejection.
- Dual-SIM split: not available (subscriberId unavailable to non-carrier apps).
- Proceed to Phase 1: **YES** (already complete).
- Proceed to Phase 2: **YES**, with the granularity caveat above binding on Task 11's chart.

## Q6 (Phase 10, Task 31) — `foregroundPackage` lookback: NOT MEASURED

The device check this task's Step 3 called for has **not been run**: there is
no Android device or emulator attached to the session that set this value, so
no observed `foregroundPackage` latency is recorded here and none should be
inferred from the default below.

The default was instead set from first principles, from the only caller.
`LiveProbe.foregroundPackage`'s `lookbackMs` now defaults to **15 minutes**,
one `USAGE_CHECK_TASK` heartbeat interval, replacing the original 60 s. The
reasoning: the probe's only consumer is a ~15-minute WorkManager run, usually
on an idle, screen-off device under Doze deferral, so a 60-second window is
narrower than the cadence that reads it and returns `null` on almost every
real wakeup. The value is rendered past tense and pinned to the check-in's own
time ("was using X — last check-in 12 minutes ago"), so an event from anywhere
inside the interval that check-in covers is exactly as true as the sentence
claims. `queryUsageStats` is not an alternative: its `lastTimeUsed` ordering
is unreliable across manufacturers, which is why `queryEvents` was chosen.

**Still open.** Measure it on a device and record the observation here.
Widen the default only if the heartbeat cadence itself widens; narrow it only
if the copy that renders the result stops being pinned to the check-in time.
`lookbackMs` is a parameter, not a constant, so it can be calibrated without
touching the call site.
