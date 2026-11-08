# Wi-Fi Tracking Reliability Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Preserve the user's existing uncommitted work; do not commit unrelated changes.

**Goal:** Fix reproducible Wi-Fi attribution defects while preserving features and requiring no VPN.

**Architecture:** Retain Android usage accounting and the JSON SSID timeline. Isolate timeline calculations for JVM testing, harden observation boundaries, and reuse integer proportional allocation.

**Tech Stack:** Kotlin, Android API 24+, existing Room/SharedPreferences and JUnit dependencies.

**Spec:** docs/superpowers/specs/2026-11-08-wifi-tracking-reliability-design.md

## Global Constraints

- No VPN, new dependency, database/schema change, data reset, or automatic BSSID splitting.
- Preserve archive, per-app totals, foreground/background, limits, exports, and family contracts.
- Work in the current dirty checkout; preserve all prior edits. No unsolicited commit or release.

## Review Focus

- Disabled tracking must not be revived by queued callbacks.
- Restart gaps must remain unknown even when returning to the same SSID.
- Disconnected, ambiguous, or redacted Wi-Fi must not reuse another network's name.
- Small and large byte counts and partial ranges must conserve allocated bytes.
- Full-day archived network slices must still identify their attribution as estimated.

### Task 1: Timeline and observation lifecycle

Files: NetTrackApplication.kt, service/WifiSessions.kt, new service/WifiSessionLog.kt, service/WifiWatchService.kt; JVM and instrumentation Wi-Fi session tests.

- [x] Extract existing timeline calculations unchanged and port existing session behavior checks to JVM tests.
- [x] Add restart regressions and stop/disabled-observation instrumentation tests; implement minimal fixes. (Instrumentation compiled; no device available to execute it.)
- [x] Guard connected Wi-Fi identity, location-bearing callbacks, and callbacks after unregister; preserve unknown intervals.
- [x] Run focused tests and compile Android integration tests.

### Task 2: Exact fractional allocation and honest archives

Files: core/StatsReader.kt, new core/WifiUsageAllocation.kt, data/util/ArchiveUsage.kt; allocation and archive tests.

- [x] Add failing tests for single-byte splits, large counters, unknown gaps, partial ranges, and archived estimated status.
- [x] Reuse proportionalBytes for interval allocation and wire it into StatsReader; preserve summary reconciliation.
- [x] Preserve estimated status in archiveWifiSlices without changing ordinary archived totals.
- [x] Run the full JVM suite and migration checks.

### Task 3: Verification and review

- [x] Run lintDebug, assembleDebug, assembleDebugAndroidTest, and the full JVM suite.
- [x] Obtain a fresh review of only this change and resolve material findings.
- [x] Record test counts and physical-device limitations; inspect diff for unrelated changes.

## Progress

- Baseline: :app:testDebugUnitTest --offline passed (cached); no connected Android device. Initial sandbox denied Gradle-cache access; the authorized test run succeeded with elevation.
- Timeline extraction: existing nine session cases ported unchanged and passing. New restart/clock-rollback cases pass; new archived-estimate test failed before the estimate flag fix.
- Allocation: five of seven regressions failed against the extracted floating-point implementation; all pass after integer allocation. Full JVM suite: 115 tests, zero failures/errors.
- First integration verification: lintDebug, assembleDebug, assembleDebugAndroidTest and full JVM suite passed; archive migration (2 tests) and family contract (1 test) checks passed.
- Review ruling: process initialization belongs in attachBaseContext, before WorkManager's initialization provider; neither the boot receiver nor service registration should interrupt a newer observation. Callback validation/publication and unregister share the service monitor; name sampling/publication share the WifiSessions monitor.

- Final review: both startup and callback findings resolved; no further concrete material finding.
- Restart regression mutation check: both outage tests fail when interruption is removed; fixed source restored and reverified.
- Final verification: `:app:testDebugUnitTest :app:lintDebug :app:assembleDebug :app:assembleDebugAndroidTest --offline --console=plain` passed. 115 JVM tests, 0 failures/errors; lint 0 errors (125 warnings/informational issues remain). Both debug APKs generated. Archive migration: 2 passing tests; family contract: 1 passing test. Diff whitespace check passed.
- Remaining verification: run device tests with `./gradlew.bat --init-script scripts/validation.init.gradle :app:connectedDebugAndroidTest` against the isolated validation package. Physical Wi-Fi switches, permission changes, process termination/reboot, VPN coexistence and manufacturer background restrictions were not exercised here. No installed user app was modified.
- Device/release follow-up: the user connected a Samsung SM-A356E (Android 17) and authorized 2.0.2. All 22 isolated device tests pass, including a live Wi-Fi callback without dashboard polling. The two older UI assertions were corrected after reproducing failures. Signing rotation preserves the disposable package's private data and rejects the old signer. Version 2.0.2/code16 passes all 115 JVM tests, release lint (zero errors) and R8 release packaging. See docs/releases/2.0.2-validation.md for artifact checksums and remaining physical-device scope.
