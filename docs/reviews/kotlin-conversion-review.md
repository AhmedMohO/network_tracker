# Kotlin conversion review — 5 November 2026

What this change does: The conversion replaces React Native/Expo with Kotlin and Jetpack Compose, reuses the Android network-statistics code, and attempts to reuse the existing archive and settings. The current implementation does not preserve all features, UI behavior, notification behavior, or background scheduling.

Verdict: Do not ship as an equivalent upgrade yet. Findings 1–8 are high-priority blockers; findings 9–25 are also required to meet the requested feature parity and compatibility.

## Scope and evidence

Reviewed conversion commits 7d12520, 1af6628, and 19ef191 against pre-conversion commit 2a38ba6, the current Kotlin working tree, and the original sibling mobile-app. The four existing uncommitted Kotlin changes contain only trailing blank lines. No application source was edited during review.

Assumed workload: one Android installation tracking installed apps, up to seven months of local history, and optional family devices. Findings concern that intended workload, not hypothetical server scale.

Validation completed:

- Freshly compiled the current RangeUtils, VersionUtils, and their current JUnit tests with the locally installed Kotlin 2.1.20 compiler. All 8 tests passed.
- Verified signatures on the supplied v1.1.8 and v2.0.0 APKs with apksigner. Both certificates have SHA-256 fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c.
- Verified supplied v2.0.0 package com.anonymous.network_tracker, versionCode 14, versionName 2.0.0, minimum API 26, target API 35. The original source uses versionCode 13. These support installation compatibility; they do not establish correct data migration.
- Checked existing generated Room schema validation and reproduced the older table's missing ssid column with SQLite. Also checked that a standalone day deletion commits before a replacement insert.
- Traced current callers, old storage schema/migrations, family SQL signatures, settings flows, and background startup/boot paths. Queried the existing original-app graph, then checked actual source because graph paths predate some folder moves.

Full Gradle unit-test/lint/release-build execution failed before project checks with “Unable to establish loopback connection,” including a no-daemon retry. ADB also failed to start its daemon. The APK checks refer to supplied artifacts; no new full APK was built during this review. Hardware timing, rendered UI, process death, live backend delivery, and actual upgrade installation remain unverified.

## Must fix — high priority

### 1. [P1] Older archives cannot open after a direct upgrade

Location: [UsageDatabase.kt:31](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/db/UsageDatabase.kt:31>).

- What this is: Room deliberately opens the existing Expo archive file.
- Problem: Installations predating Wi-Fi attribution have a version-zero daily_usage table without ssid. The builder does not migrate that table, but generated Room validation requires ssid in the primary key. Archive reads and background snapshots fail; snapshot failure also prevents subsequent limit checking in performBackgroundCheck.
- Fix: Preserve the original pre-open table inspection and transactional rebuild, copying every existing row with an empty ssid. Do not use a destructive migration.
- If skipped: A supported older installation loses access to its saved history and stops checking quotas after upgrading. Original evidence: [db.ts:72](<F:/Projects/network_tracker/mobile-app/src/features/archive/services/db.ts:72>).

### 2. [P1] Family sharing is missing its actual synchronization and monitoring workflow

Location: [UsageRepository.kt:191](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/repository/UsageRepository.kt:191>), [FamilyScreen.kt:151](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/FamilyScreen.kt:151>).

- What this is: Paired children previously pushed daily/recent usage; parents pulled, cached, displayed, and managed child usage and requests.
- Problem: The Kotlin background check never runs family synchronization. familyPush and registerPushToken have no callers. “Sync Now” discards its response. Parent creation, QR sharing, child lists/details, per-child limits, request/grant actions, and unpair are absent. Push receipt/handling is also absent.
- Fix: Restore the original role-specific lifecycle, synchronization/cache, parent/child screens, request/grant and unpair flows, and a push path compatible with the existing backend. Use the same sync operation for background and manual checks.
- If skipped: Existing paired devices stop sharing meaningful updates; parents cannot monitor children; family notifications disappear. Original evidence: [backgroundCheck.ts:405](<F:/Projects/network_tracker/mobile-app/src/features/limits/services/backgroundCheck.ts:405>), [sync.ts](<F:/Projects/network_tracker/mobile-app/src/features/family/services/sync.ts>), [PairingCard.tsx](<F:/Projects/network_tracker/mobile-app/src/features/family/components/PairingCard.tsx>), [family/index.tsx](<F:/Projects/network_tracker/mobile-app/src/app/family/index.tsx>).

### 3. [P1] Family RPC arguments are incompatible with the existing backend contract

Location: [SupabaseRpc.kt:59](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/api/SupabaseRpc.kt:59>).

- What this is: The existing Supabase functions are selected by function name and named parameters.
- Problem: Kotlin sends p_updated_after as a number; the existing family_pull function expects p_since as a timestamp. Push uses p_device_id instead of p_device; registration uses p_device_id/p_push_token instead of p_device/p_push.
- Fix: Restore the established parameter names and timestamp encoding. Check against the checked-in SQL and original client, without changing the deployed API for old clients.
- If skipped: Even an already valid pairing cannot pull through the new “Sync Now” action, and restored push callers would also fail. Original evidence: [family-schema.sql:47](<F:/Projects/network_tracker/mobile-app/docs/family-schema.sql:47>), [family-schema.sql:125](<F:/Projects/network_tracker/mobile-app/docs/family-schema.sql:125>). The live deployment was not contacted.

### 4. [P1] Existing pairing links become invalid secrets

Location: [FamilyScreen.kt:43](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/FamilyScreen.kt:43>), [MainActivity.kt:39](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/MainActivity.kt:39>).

- What this is: Original pairing QR codes contain nettrack://pair?t=<32hex>&label=..., not just the secret token.
- Problem: Scanning stores the complete URL as pairToken, overwrites the role without validation, and does not create a child device ID. MainActivity also never consumes incoming pairing intents, despite declaring the scheme.
- Fix: Parse and validate the existing link format, extract token/label, create the device identity, preserve the existing-family guard and consent flow, and handle initial and subsequent pairing intents.
- If skipped: Old QR codes and deep links cannot pair successfully, while unrelated QR codes can overwrite a valid local role. Original evidence: [pair.ts:33](<F:/Projects/network_tracker/mobile-app/src/features/family/utils/pair.ts:33>), [scan.tsx:53](<F:/Projects/network_tracker/mobile-app/src/app/scan.tsx:53>), [useFamily.ts:80](<F:/Projects/network_tracker/mobile-app/src/features/family/hooks/useFamily.ts:80>).

### 5. [P1] Fresh Android 13+ installations never request notification permission

Location: [NetTrackApplication.kt:15](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/NetTrackApplication.kt:15>), [AndroidManifest.xml:34](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/AndroidManifest.xml:34>).

- What this is: Creating a notification channel and declaring POST_NOTIFICATIONS do not grant runtime permission.
- Problem: No runtime notification permission request exists anywhere in the new application. On fresh Android 13+ installations alerts remain blocked by default.
- Fix: Request permission through an activity and expose its denied state so the user can recover.
- If skipped: Users configure limits but never receive their alerts. Original evidence: [notify.ts:25](<F:/Projects/network_tracker/mobile-app/src/features/limits/services/notify.ts:25>). Platform rule: [Android notification permission documentation](https://developer.android.com/develop/ui/compose/notifications/notification-permission).

### 6. [P1] Granting usage access does not unblock the open dashboard

Location: [OverviewScreen.kt:56](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/OverviewScreen.kt:56>).

- What this is: The usage permission gates every dashboard load.
- Problem: hasPermission is initialized once and never updated. Grant access in Android Settings and return: the banner stays, and Refresh exits immediately because it still sees false.
- Fix: Recheck permission on lifecycle resume, then reload when granted.
- If skipped: First-run setup appears broken until the screen is recreated. Original evidence: [PermissionGate.tsx:30](<F:/Projects/network_tracker/mobile-app/src/features/usage/components/PermissionGate.tsx:30>).

### 7. [P1] Wi-Fi attribution has no usable permission/setup flow

Location: [SettingsScreen.kt:474](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/SettingsScreen.kt:474>).

- What this is: Identifying Wi-Fi networks requires location permission and the associated system settings.
- Problem: The switch starts the service immediately, requests no runtime location permission, and only shows raw problem text. The existing openFix helper has no UI caller.
- Fix: Restore permission requests and an actionable settings flow before enabling attribution; recheck on resume.
- If skipped: Fresh installations cannot get useful per-network attribution through the offered UI. Original evidence: [settings.tsx:157](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/settings.tsx:157>), [settings.tsx:553](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/settings.tsx:553>).

### 8. [P1] Monthly quota progress displays the selected period's usage

Location: [OverviewScreen.kt:258](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/OverviewScreen.kt:258>).

- What this is: A monthly limit must be compared with current billing-cycle usage independently of the dashboard filter.
- Problem: The quota card uses appList/totalBytes from Today, Yesterday, Last Cycle, or another selected interval. With 9 GB used this cycle and 100 MB today, a 10 GB plan displays roughly 1% instead of 90% on the default screen. Displayed percentages are also capped at 100%.
- Fix: Query current cycle usage separately; clamp only the progress drawing, not the numeric percentage.
- If skipped: Users receive misleading remaining-quota information. Original evidence: [useLimitStatus.ts:27](<F:/Projects/network_tracker/mobile-app/src/features/limits/hooks/useLimitStatus.ts:27>).

## Must fix — further correctness, compatibility, and parity regressions

### 9. [P2] Replacing an archived day can delete saved history

Location: [UsageRepository.kt:182](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/repository/UsageRepository.kt:182>).

- What this is: A snapshot first removes the saved day, then inserts replacement rows.
- Problem: These are separate transactions. Process death, cancellation, or insert failure between them leaves the previously stored day deleted. A failure around midnight can miss the normal yesterday-only retry window.
- Fix: Wrap deletion and insertion together in db.withTransaction.
- If skipped: Previously archived data can disappear. Original evidence: [db.ts:147](<F:/Projects/network_tracker/mobile-app/src/features/archive/services/db.ts:147>) uses one exclusive transaction.

### 10. [P2] The WorkManager fallback is never scheduled

Location: [DailySnapshotWorker.kt:8](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/service/worker/DailySnapshotWorker.kt:8>), [NetTrackApplication.kt:15](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/NetTrackApplication.kt:15>).

- What this is: The original periodic background job exists independently of the optional keep-alive service.
- Problem: DailySnapshotWorker is defined but has no enqueue or registration caller anywhere. With keep-alive and Wi-Fi watch disabled, no periodic Kotlin check runs. Old Expo worker records cannot execute the removed Expo implementation.
- Fix: Enqueue unique periodic native work on startup, preserving the separate fallback behavior.
- If skipped: Disabling the optional keep-alive also stops archival and quota checks entirely; prolonged gaps eventually lose history after Android's retention. Original evidence: [backgroundCheck.ts:537](<F:/Projects/network_tracker/mobile-app/src/features/limits/services/backgroundCheck.ts:537>).

### 11. [P2] The two background switches interfere with their shared service/alarm

Location: [SettingsScreen.kt:477](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/SettingsScreen.kt:477>), [SyncKeepAlive.kt:32](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/service/SyncKeepAlive.kt:32>).

- What this is: Wi-Fi attribution and regular background updates share one foreground service and alarm.
- Problem: Turning Wi-Fi off stops the service even if keep-alive remains on. Turning keep-alive off cancels the alarm even if Wi-Fi tracking remains on. Turning keep-alive back on only arms an alarm and does not restore the service.
- Fix: Reconcile both switches through the existing WifiWatchService.sync helper, which already checks both flags.
- If skipped: Background reliability changes unexpectedly when users adjust the other setting. Original evidence: [SyncKeepAlive.kt:68](<F:/Projects/network_tracker/mobile-app/modules/network-usage/android/src/main/java/expo/modules/networkusage/SyncKeepAlive.kt:68>).

### 12. [P2] Wi-Fi-only tracking expires an active connection after an hour

Location: [SyncKeepAlive.kt:37](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/service/SyncKeepAlive.kt:37>), [WifiSessions.kt:51](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/service/WifiSessions.kt:51>).

- What this is: last-seen proves an open Wi-Fi session is still being observed.
- Problem: With keep-alive off, the first watch alarm does not rearm. Repeated recordings of the same SSID return before refreshing last-seen. After the last tick plus the one-hour grace period, sessions clips a connection that is still active.
- Fix: Rearm while either feature needs the alarm, sample the network on the watch tick, and update liveness before deduplicating transitions.
- If skipped: Later bytes lose their correct network attribution. Original evidence: [SyncTickReceiver.kt:31](<F:/Projects/network_tracker/mobile-app/modules/network-usage/android/src/main/java/expo/modules/networkusage/SyncTickReceiver.kt:31>), [WifiSessions.kt:110](<F:/Projects/network_tracker/mobile-app/modules/network-usage/android/src/main/java/expo/modules/networkusage/WifiSessions.kt:110>).

### 13. [P2] Blocked notifications are recorded as already delivered

Location: [UsageRepository.kt:252](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/repository/UsageRepository.kt:252>).

- What this is: Stored alert keys prevent repeated delivery.
- Problem: The key is saved before notification posting, with no permission/channel-enabled check. Cross a threshold while notifications are blocked, then enable them: the alert remains suppressed for the billing cycle.
- Fix: Check delivery eligibility, attempt the post, and save its key only after successful posting.
- If skipped: Enabling notifications later does not recover important quota alerts. Original evidence: [notify.ts:35](<F:/Projects/network_tracker/mobile-app/src/features/limits/services/notify.ts:35>), [backgroundCheck.ts:44](<F:/Projects/network_tracker/mobile-app/src/features/limits/services/backgroundCheck.ts:44>).

### 14. [P2] Alert identities break upgrade deduplication and quota changes

Location: [UsageRepository.kt:249](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/repository/UsageRepository.kt:249>).

- What this is: The alert identity must represent the configured threshold as well as its billing cycle.
- Problem: New keys omit quota bytes and warning percentage, and differ from stored original keys. Reach 10 GB, raise the quota to 20 GB, then reach 20 GB: the reached alert is suppressed. Upgrading can also repeat an already delivered alert.
- Fix: Preserve the old key format including the relevant threshold values, with the original bounded pruning behavior.
- If skipped: Alerts are duplicated on upgrade or missing after settings changes. Original evidence: [alerts.ts:23](<F:/Projects/network_tracker/mobile-app/src/features/limits/utils/alerts.ts:23>).

### 15. [P2] Sudden-usage spike notifications were removed

Location: [UsageRepository.kt:205](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/repository/UsageRepository.kt:205>).

- What this is: The original app detects unusually high daily usage, including mobile spikes without a configured quota.
- Problem: The new checker only evaluates quota percentages and returns immediately when both limits are null. There is no anomaly comparison or spike notification path.
- Fix: Restore the existing anomaly rule and its per-day/per-network alert identity.
- If skipped: Users lose an existing smart-alert feature despite the request to preserve all notifications. Original evidence: [backgroundCheck.ts:152](<F:/Projects/network_tracker/mobile-app/src/features/limits/services/backgroundCheck.ts:152>).

### 16. [P2] Refresh queries the time captured when the screen opened

Location: [OverviewScreen.kt:63](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/OverviewScreen.kt:63>), [CompareScreen.kt:60](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/CompareScreen.kt:60>).

- What this is: Relative ranges such as Today and This Cycle must advance with current time.
- Problem: remember depends on preset/settings, not time. Open Today at 10:00 and refresh at 11:00: the range still ends at 10:00. Midnight rollover is stale too.
- Fix: Recompute relative ranges from a current-time state advanced on refresh, resume, and while visible.
- If skipped: “Refresh” excludes the newest traffic. Original evidence: [useUsageContext.tsx:26](<F:/Projects/network_tracker/mobile-app/src/features/usage/hooks/useUsageContext.tsx:26>).

### 17. [P2] Details and comparison lose the selected range/network

Location: [AppDetailScreen.kt:47](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/AppDetailScreen.kt:47>), [MainActivity.kt:96](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/MainActivity.kt:96>), [CompareScreen.kt:48](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/CompareScreen.kt:48>).

- What this is: Opening an app or Compare previously retained the shared usage context.
- Problem: From Wi-Fi/Yesterday, opening an app queries Last 30 Days across all networks. Compare independently defaults to Mobile/This Cycle and offers fewer ranges.
- Fix: Keep the active range/network in shared host state and pass them to all dependent screens.
- If skipped: Drilldowns disagree with the row the user selected and some existing comparisons are impossible. Original evidence: [usage/[uid].tsx:125](<F:/Projects/network_tracker/mobile-app/src/app/usage/[uid].tsx:125>), [compare.tsx:33](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/compare.tsx:33>).

### 18. [P2] Old asynchronous loads can overwrite the new filter's results

Location: [OverviewScreen.kt:71](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/OverviewScreen.kt:71>), [CompareScreen.kt:68](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/CompareScreen.kt:68>).

- What this is: Results must stay associated with the selected query.
- Problem: A keyed effect launches a separate screen-scope job; cancelling the effect does not cancel that job. A slow older request can replace a newer selection's totals. Swallowed failures can also leave old data looking current.
- Fix: Run the suspending load inside the keyed effect or explicitly cancel the previous job, and show query-specific errors instead of presenting stale data as current.
- If skipped: Rapid filter changes or read failures display misleading figures. Original evidence: [useUsage.ts:19](<F:/Projects/network_tracker/mobile-app/src/features/usage/hooks/useUsage.ts:19>).

### 19. [P2] Custom ranges lost endpoint/time selection and validation

Location: [OverviewScreen.kt:93](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/OverviewScreen.kt:93>).

- What this is: Custom ranges previously selected both date/time endpoints.
- Problem: The replacement chooses only a start day and ends at now. Past intervals such as November 1, 14:00–16:00 are impossible; a future start can create start greater than end.
- Fix: Restore both endpoints and validate start < end <= now.
- If skipped: Existing history investigations cannot be reproduced and invalid queries are accepted. Original evidence: [RangePicker.tsx:35](<F:/Projects/network_tracker/mobile-app/src/features/usage/components/RangePicker.tsx:35>).

### 20. [P2] Hiding system apps changes overall comparison totals

Location: [CompareScreen.kt:75](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/CompareScreen.kt:75>).

- What this is: Hiding rows should not change device traffic totals.
- Problem: Totals sum the filtered lists. A period with 500 MB user traffic and 500 MB system traffic displays 500 MB while system apps are hidden; showing them doubles the overall total and changes its delta.
- Fix: Compute totals from complete query results and filter only the displayed per-app comparison.
- If skipped: Overall comparison depends on a presentation preference. Original evidence: [compare.tsx:44](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/compare.tsx:44>).

### 21. [P2] Arabic/RTL and light-mode behavior are disconnected

Location: [MainActivity.kt:29](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/MainActivity.kt:29>), [Theme.kt:44](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/theme/Theme.kt:44>).

- What this is: The original app supports stored Arabic selection, RTL, and the system's light/dark appearance.
- Problem: Screens use literal English strings rather than the supplied translations; the saved language is never applied and its selector is gone. Theme chooses DarkColorScheme in both branches, and screens hardcode dark colors.
- Fix: Restore language selection/application and localized resources; apply the actual selected color scheme through semantic theme colors.
- If skipped: Existing Arabic and light-mode users lose their UI behavior. Original evidence: [i18n/index.ts](<F:/Projects/network_tracker/mobile-app/src/i18n/index.ts>), [settings.tsx:270](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/settings.tsx:270>), [use-theme.ts](<F:/Projects/network_tracker/mobile-app/src/hooks/use-theme.ts>).

### 22. [P2] Export changed its dataset and removed safe CSV encoding

Location: [SettingsScreen.kt:642](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/SettingsScreen.kt:642>).

- What this is: Export previously retained the active range/network, offered CSV/JSON, and safely encoded untrusted application labels.
- Problem: Export always queries Last 30 Days/All networks, drops JSON and range/network/foreground/background fields, and writes names without doubling embedded quotes or neutralizing spreadsheet formulas. A label containing quotes corrupts CSV; a formula-like label may be evaluated by spreadsheet software.
- Fix: Restore the selected dataset and format choice, metadata, proper CSV quoting, and the original formula protection.
- If skipped: Exported data is incomplete or ambiguous and app labels are unsafe to open in spreadsheets. Original evidence: [csv.ts:19](<F:/Projects/network_tracker/mobile-app/src/features/export/utils/csv.ts:19>), [index.tsx:64](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/index.tsx:64>).

### 23. [P2] Existing charts, live per-app activity, and diagnostic actions disappeared

Location: [OverviewScreen.kt:307](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/OverviewScreen.kt:307>), [AppDetailScreen.kt:117](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/AppDetailScreen.kt:117>), [LiveScreen.kt:26](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/LiveScreen.kt:26>), [ProbeScreen.kt:46](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/screens/ProbeScreen.kt:46>).

- What this is: Usage charts, the live history/per-app list, and diagnostic probes are existing user-facing tools.
- Problem: No Kotlin UI calls StatsReader.series; overview/detail charts are absent. Live has no history sparkline or recent per-app traffic list. Probe replaces the previous usage, granularity, counter, notification, and background-check tools with fixed TCP connectivity tests.
- Fix: Restore these existing views/actions using the retained reader and equivalent native implementations.
- If skipped: The replacement has materially fewer features and a different interface. Original evidence: [index.tsx:168](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/index.tsx:168>), [usage/[uid].tsx:213](<F:/Projects/network_tracker/mobile-app/src/app/usage/[uid].tsx:213>), [live.tsx:249](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/live.tsx:249>), [probe.tsx:266](<F:/Projects/network_tracker/mobile-app/src/app/(tabs)/probe.tsx:266>).

### 24. [P2] Android Back exits nested screens

Location: [MainActivity.kt:53](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/ui/MainActivity.kt:53>).

- What this is: App details, Family, and Updates are represented by remembered flags/UID rather than a navigation stack.
- Problem: There is no BackHandler or navigation controller for these states. The on-screen back button works, but Android's system Back exits the activity instead of returning. Configuration recreation also loses the remembered destination.
- Fix: Handle Back for active nested destinations and preserve destination state across recreation.
- If skipped: Standard Android navigation differs from the original routed screens and unexpectedly exits the app. Original evidence: the original Expo Router usage, family, and update routes.

### 25. [P2] Direct upgrades lose the older warning-threshold setting

Location: [SettingsRepository.kt:42](<F:/Projects/network_tracker/network_tracker_kotlin/app/src/main/java/com/anonymous/network_tracker/data/repository/SettingsRepository.kt:42>).

- What this is: Before separate Wi-Fi limits, the mobile threshold was stored as warnAtPercent.
- Problem: Kotlin reads only mobileWarnAtPercent and otherwise defaults to 80. An older stored 50% warning silently becomes 80%, and a later save persists that change.
- Fix: Use stored warnAtPercent as the legacy fallback before the default.
- If skipped: A supported direct upgrade delays the user's configured warning. Original evidence: [settings.ts:120](<F:/Projects/network_tracker/mobile-app/src/features/usage/services/settings.ts:120>).

## Release verification still required

The current eight unit tests cover date utilities and version comparison only. They do not verify any archive migration, interruption safety, alert delivery, family synchronization, permission lifecycle, or UI parity finding above.

After fixes, run an actual in-place upgrade with seeded current and older archives/settings, confirm every retained row and preference, and test interruption during snapshot replacement. Test fresh Android 13+ permissions, denied/reenabled notifications, changed quotas, and spike alerts. Exercise both background switches in all combinations, reboot, package replacement, idle/Doze, and long continuous Wi-Fi connections. Test old/new parent-child combinations, existing QR/deep links, requests/grants, unpair deletion, and backend push delivery. Compare rendered original/Kotlin screens in English/Arabic, light/dark, selected/custom ranges, drilldowns, exports, and system Back.

The smaller supplied APK is a real size reduction (2,161,497 bytes versus 143,799,798 bytes for the supplied original APK), but removed features account for part of the difference. No runtime performance or battery benchmark was completed, so optimization equivalence is unproven.

Not checked: on-device upgrade, rendered pixel/UI parity, alarm timing, push delivery, accessibility, battery/runtime performance, or a successful fresh full Gradle build.
Risk: current code can lose an archived day on interruption and cannot be approved as feature-equivalent or reliably notification/background compatible.
