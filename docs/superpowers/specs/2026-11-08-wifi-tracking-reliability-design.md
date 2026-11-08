# Wi-Fi tracking reliability

User authorization: proceed carefully with the Kotlin implementation, preserve all current features, and require no VPN.

Keep NetworkStatsManager as the accounting source and the existing SSID transition timeline as the attribution source. Fix stale observations, stop/restart boundaries, and fractional allocation; retain explicit unknown usage and estimated network breakdowns. Existing SQLite, preference, settings, export, and family payload formats remain compatible.

Approaches: harden the current observation path (selected); use a VPN (excluded by the user); replace accounting with TrafficStats (does not provide equivalent per-app accounting). Logical networks remain grouped by SSID: automatically treating each BSSID as a separate network would split mesh/dual-band networks and require new grouping/migration behavior. Exact reconstruction of unobserved history is unavailable.

Scope: move timeline calculations into a testable class without changing their persisted format; atomically stop observations when disabled, close restart gaps at the last observation, reject stale callbacks, and resolve only connected, unambiguous Wi-Fi identities. Request location-bearing callbacks on supported Android versions. Allocate bytes with existing integer proportional arithmetic, leaving uncovered intervals unknown. Archived network slices retain their estimated status.

Verification: first establish a passing baseline; reproduce each defect with a failing test; run the full JVM suite, lint, app and instrumentation compilation, and migration checks. Physical switching, permission revocation, reboot, VPN coexistence, and manufacturer background restrictions need a connected device. No device was connected at baseline.
