# NetTrack — native Android

Native Kotlin and Jetpack Compose version of NetTrack. Supports Android 7.0 (API 24) or newer, matching v1.1.8, and requires Usage Access for local app traffic measurements.

## Build and verify

Use JDK 17 or newer, an installed Android SDK, and the Gradle wrapper:

```powershell
./gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleRelease
python scripts/test-archive-migration.py
python scripts/test-family-removal.py
```

Release signing requires private credentials and a new signing certificate. See [release signing and key migration](docs/release-signing.md) before building or distributing an APK; the exposed key used through 2.0.1 is rejected. Do not uninstall or clear app data to upgrade.

The app opens the existing Expo usage archive and key/value database in place. Legacy archives without Wi-Fi names are migrated transactionally. Settings, family pairing/cache, and notification identities retain their existing formats. Usage history is retained for seven calendar months.

## Features

- Mobile/Wi-Fi/all-network usage, per-app details, foreground/background breakdown, selected/custom date ranges, charts, and billing-cycle limits with selectable Wi-Fi network scope.
- Live device speed/history and recent per-app traffic; native diagnostic and notification probes.
- CSV/JSON export of the selected range/network with safe CSV encoding.
- English/Arabic and RTL; system, light, and dark appearance.
- Optional Wi-Fi network attribution and shared keep-alive service/alarm, plus periodic WorkManager fallback.
- Family QR/deep-link pairing, cached parent/child usage, requests/grants, limits, daily/recent synchronization and resumable history backfill.

Family synchronization requires the Supabase RPC contract in docs/family-schema.sql. Existing servers must apply [the device-removal migration](docs/migrations/2026-11-08-family-remove-device.sql) before distributing these fixes. Child unpairing fails safely if that RPC is absent; it never falls back to deleting the family. Native FCM wake-ups retain the existing Expo push-token contract; Firebase/EAS credentials must be supplied for actual push delivery. See docs/push-setup.md.

See docs/reviews/kotlin-conversion-repair-status.md for the repair checklist and verification limits.
