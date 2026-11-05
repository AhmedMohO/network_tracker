# Kotlin conversion repair status

The code repairs below address the 25 findings in kotlin-conversion-review.md. The original review describes the starting state; this document tracks the repairs. All 33 JVM regression tests and three actual SQLite checks passed. The isolated Samsung SM-A356E (Android 17) device regression passed, including the original permission-resume failure; final release packaging is recorded below.

1. Legacy archives: pre-open schema inspection and a transactional table rebuild preserve rows and add the missing SSID primary-key column. Actual SQLite migration and rollback tests added.
2. Family workflows: restored native parent creation, pairing/share/QR/consent, child monitoring/details, local delta cache, usage requests/grants, thresholds, unpair, and background/manual sync. Native FCM receiver and Expo-compatible token registration added; external Firebase/EAS setup remains required.
3. RPC compatibility: restored p_since timestamp, p_device and p_push arguments without changing the existing server contract.
4. Pairing: validate/parse old links, create device identities, prevent accidental role replacement, handle launch and subsequent intents, and require child disclosure/consent.
5. Notification permission: activity runtime request plus visible notification-settings recovery and a test-notification action.
6. Usage permission: lifecycle resume rechecks and reloads the dashboard.
7. Wi-Fi permission: request foreground location at enable time and offer the existing actionable location/background settings flow.
8. Quota display: query the current billing cycle independently of the dashboard selection and retain numeric overage.
9. Snapshot safety: deletion and replacement now share Room's transaction.
10. Background fallback: schedule unique periodic WorkManager work and unique immediate checks.
11. Shared background controls: both flags reconcile through WifiWatchService.sync; either enabled feature retains its service/alarm.
12. Wi-Fi liveness: refresh before transition deduplication; watch-only alarms rearm and sample the network. Read legacy empty-SSID disconnection records correctly.
13. Delivery state: check permission/channel availability and record the alert key only after posting succeeds.
14. Alert identity: preserve original quota/configuration identities, child suffixes and bounded current-cycle/day keys.
15. Smart alerts: restore median-based daily spike checks, parent request/quiet/limit/spike alerts, and sync-failure notices.
16. Relative ranges: refresh current time on resume, explicit refresh, and while visible.
17. Query context: share the selected range/network among overview, details, comparison and export; save selection across recreation.
18. Load races: load directly inside keyed effects, propagate cancellation, clear superseded data, and show errors/retry actions.
19. Custom ranges: both date/time endpoints with reversed/future/maximum-range validation.
20. Comparison totals: retain all device traffic totals while filtering only the per-app rows.
21. Localization/theme: restore language selection, Arabic/RTL, localized templates and formatting, and semantic system/light/dark colors.
22. Exports: selected range/network CSV and JSON, range/network/foreground/background metadata, quote escaping and spreadsheet-formula protection.
23. Investigation tools: restore usage/detail charts, archived daily chart data, live history/per-app activity and original diagnostic actions.
24. Navigation: system Back handles nested screens; root navigation and usage selections use saved state.
25. Legacy preferences: preserve warnAtPercent, unknown JSON fields, pairing and alert records; settings changes patch the latest canonical data instead of overwriting newer background changes.

Additional integration repairs: child sync fails safely when Usage Access is revoked instead of overwriting real usage with zeroes; backfill reads existing daily archives first; unpair clears the local family cache only after the server deletion succeeds; push registration shares the family lock; source and generated Firebase config are excluded from Git.

Final APK comparison also found that the original v1.1.8 supports minimum API 24 and targets API 36, while the initial conversion required API 26 and targeted API 35. The repaired build restores minimum API 24 and compile/target API 36. Core library desugaring keeps the existing java.time parsing and export paths available on Android 7; see [Android's Java API backport documentation](https://developer.android.com/studio/write/java8-support) and the [Google backport release notes](https://github.com/google/desugar_jdk_libs/blob/master/CHANGELOG.md). Device validation includes a real server timestamp parse; an Android 7 device/emulator was not available.

## Checks

Regression tests cover alert rearming/pruning/spikes/blocked delivery, legacy/null/unknown settings, pairing/timestamps/grants, payload compression/cache/daily series, ranges/overage/safe export, push wire encoding, and translation completeness. SQLite tests execute the actual archive migration and archive-series query, including rollback.

Final production-package verification on 5 November 2026: `:app:testDebugUnitTest :app:lintDebug :app:assembleRelease` passed. Results: 33 JVM tests, zero failures/errors; three SQLite checks passed; lint has zero errors and 121 warnings. Warnings are retained for dependency versions, resources and deprecated APIs; they are not suppressed globally.

Before committing, the staged Git index was exported into an empty directory and built using only tracked files. Unit tests, lint, release packaging and device-test APK assembly all passed (114 tasks executed); the three SQLite checks also passed from that export. No untracked files, deleted tracked files, sparse-checkout entries or assumed-unchanged entries were found in the native worktree. Firebase configuration remains the documented external setup requirement.

The release APK is `app/build/outputs/apk/release/app-release.apk` (2,593,222 bytes), package `com.anonymous.network_tracker`, version code 14 / version 2.0.0, minimum API 24, target API 36. Its certificate matches the supplied v1.1.8 APK (version code 13): SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. APK SHA-256: `11d3009d9e74915d44bd4829766a6940262a303be585aa70f7d33a51561c3c37`. Upgrade in place; do not uninstall or clear data.

Both the Gradle connected-test task and the isolated device runner refuse to run device tests against the production app package. Run with:

```powershell
./gradlew.bat --init-script scripts/validation.init.gradle :app:connectedDebugAndroidTest
```

It seeds a legacy archive and settings in com.anonymous.network_tracker.validation20261105, tests real Room rollback, notification delivery, usage-permission recovery, English/Arabic themes, family Back navigation, shared service switches, and unique periodic scheduling. It never seeds or clears the installed production app's data.

The final connected run with minimum API 24 / target API 36 passed on the Samsung SM-A356E running Android 17: one integration test, zero failures, zero skipped. The Android timestamp backport was exercised in this run. Dedicated validation packages were removed after testing. The installed production app was not overwritten, reset or uninstalled.

## Remaining verification limits

Firebase Android configuration and EAS FCM v1 credentials were not provided. Live server push delivery and mixed-version family synchronization cannot be asserted from local tests. Full overnight Doze/reboot behavior and exact pixel parity with every original screen still need acceptance checks. English/dark and Arabic/light Settings screens were captured and inspected; a wrapping tab label and doubled nested screen insets were corrected. No production installation is overwritten as part of the isolated tests.

The on-device regression also caught a native lifecycle race after the first source repairs: Boolean pause/resume state can be conflated when no Compose frame occurs in between. Foreground refresh and live polling now use repeatOnLifecycle directly; the same failing device test passed after that repair.
