# Wi-Fi limit filter implementation plan

## Design

The user chose to filter usage against the existing shared Wi-Fi limit, rather than save a separate limit per SSID. Keep one Wi-Fi amount, threshold, and billing cycle. Add a saved optional SSID: null means all Wi-Fi, including unattributed bytes; a named SSID means only usage attributed to that exact name. Apply the same scope to the limit bar, forecasts, and Wi-Fi alerts. Other usage lists and charts retain their current transport filter.

Reuse the existing Compose controls and settings persistence. Put a network picker in the Wi-Fi limit card and existing settings dialog. Include recorded names and the saved selection, even if that network has no usage in the selected period. Explain that named-network counts exclude unattributed usage, and show when attribution is disabled. Saving must not change the shared amount or mobile settings. A canceled dialog must not save its draft.

**Goal:** Select one Wi-Fi network's usage for the existing limit bar.

**Architecture:** Add `AppSettings.wifiLimitSsid: String?` to the canonical JSON and preferences fallback. Share exact-name byte selection and alert scope identity across the repository and UI. Use one reusable native dropdown with the current theme.

**Tech stack:** Kotlin, Compose Material 3, existing Room/SQLite and preferences, JUnit and Android instrumentation. No new dependencies or subagents.

**Spec:** Design section above, including the user's explicit shared-limit choice.

## Scope and checks

- Old settings default to all Wi-Fi; Unicode, quotes, colons, and unavailable saved SSIDs round-trip unchanged.
- All Wi-Fi includes unattributed bytes; named scopes exclude them and return zero when absent.
- Scope changes re-arm alerts without breaking existing mobile/all-Wi-Fi keys.
- Disabled attribution is visible and does not trigger misleading named-network alerts.
- Loading and failed queries do not show a fabricated zero-use forecast.

## Implementation

- [x] Write failing codec, selection, and scoped-alert tests; implement persistence and shared selection.
  - Modify `AppSettings.kt`, `SettingsCodec.kt`, `SettingsRepository.kt`, `AlertRules.kt`.
  - Add `data/util/WifiLimitUsage.kt` and tests; preserve the shared limit value.
- [x] Add the shared Compose picker to `OverviewScreen.kt` and `SettingsScreen.kt`; wire `UsageRepository.getLimitUsedBytes` into the bar and alerts.
  - Keep the existing global transport filters unchanged.
  - Add Arabic strings and a Compose interaction check for switching networks and reverting to all Wi-Fi.
- [x] Run the complete unit suite, Android compilation/lint, and isolated device tests; inspect the rendered selector in the existing layout.

## Verification record

Baseline fixes were committed as `dc5a8c7`; the Wi-Fi filter and exact-quota preservation changes are included in NetTrack 2.0.1.

- Unit suite: 79 passed, zero failures/errors/skips.
- Physical device: 17 passed on the connected Samsung, using only the `.validation20261105` package. Includes migration/session/statistics regressions, switching networks, returning to all Wi-Fi, saved-but-unseen SSIDs, dialog cancellation, settings persistence into the real bar, and Arabic light mode at 1.3 font scale.
- Final validation APKs assembled successfully; lint has zero errors and 126 warnings. Two added warnings describe the test-only activity's API-27 lock-screen attributes; the remaining warnings predate this feature.
- Visual checks covered the real overview card, open menu, dark mode, and Arabic/light/larger text. Captures are in the session visualization directory under `wifi-limit-filter`.
- A device regression first reproduced quota rounding when saving an otherwise unchanged fractional limit. The dialog now preserves the original byte value unless the amount field is edited; the regression passes with `5492165909` bytes unchanged.
- A non-exported debug-only `ComponentActivity` hosts UI tests, avoiding the main activity's background sync initialization. Its lock-screen visibility flags allow the test UI to render without unlocking the device.
- Named-network usage remains an attribution estimate and excludes unattributed bytes. Per-network alerts are paused while attribution is disabled; the picker explains the requirement. Other Android versions and tablet layouts were not exercised.
