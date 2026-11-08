# Kotlin audit fixes

**Goal:** Correct the nine verified 2.0.1 audit findings without changing the shared Wi-Fi limit policy.

**Scope:** Kotlin app, regression tests, family SQL migration, signing configuration and release instructions. Execute inline, without subagents. Preserve existing usage and pairing data.

- [x] Add failing family payload and archive regressions; implement directional tails, unknown legacy splits, clipped and labelled family estimates, and removed-UID reconciliation.
- [x] Track successfully checked calendar days independently of initial backfill. Test offline gaps and interrupted recovery. Empty source results retain the existing missing-data behavior.
- [x] Add device-scoped child removal with deletion tombstones; test isolation and cache removal. Parent-wide deletion remains explicit. Prepare server migration; user confirmed they will apply it in Supabase.
- [x] Make the background-sync switch gate periodic and push work; preserve explicit foreground refresh. Test disabled and re-enabled scheduling.
- [x] Reduce foreground lifecycle events, include longer sessions, and clear state on pause, shutdown, and screen-off. Test long sessions and transitions.
- [x] Remove the exposed signing key from the working tree, require private external signing inputs, separate debug identity, and prepare key rotation with documented older-Android limits.
- [x] Run unit tests, lint, release/debug builds, isolated device checks where available, and review the complete diff. Report any server/signing rollout steps that cannot be performed locally.

**Validation:** Existing tests plus regressions for all nine findings; no destructive calls to the live family backend and no replacement of the installed production app.

**Results:** 88 unit tests pass; lint has 0 errors and 126 existing warnings; release and isolated test APKs build. 16 physical-device tests pass, plus three SQLite fixture checks. New-key rotation preserves private app data and rejects a higher-version old-key update on an Android 17 disposable package. Test packages were removed afterward. The release-signing guard rejects missing credentials and the compromised certificate.

**Rollout remaining:** User will apply the Supabase migration. Back up the ignored private signing files before publishing a future release. Android 7/8 old-key installs require a separate migration/distribution decision; Android 9–16 upgrades and live Postgres were not physically tested. No commit, push, history rewrite, or new release was made.
