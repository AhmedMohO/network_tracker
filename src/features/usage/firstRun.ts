import { Platform } from "react-native";

import {
  isBatteryOptimized,
  requestIgnoreBatteryOptimizations,
  setSyncKeepAliveEnabled,
} from "@/features/limits/keepAlive";

import { hasUsageAccess } from "./api";
import { loadSettings, saveSettings } from "./settings";

/**
 * Turns on the background updates the app is useless without, and asks for the
 * exemption they need, once per install.
 *
 * Per-network Wi-Fi tracking is deliberately *not* here. It is the one feature
 * that costs a location permission, and a location prompt on first launch —
 * for something the user has not asked for and cannot yet see the value of —
 * is how an app gets that permission denied permanently. It stays off until
 * the user switches it on in Settings › Separate Wi-Fi networks, which asks
 * for location at the moment the request makes sense.
 *
 * The keep-alive switch defaults to off in the native prefs and is flipped
 * here rather than in Kotlin, deliberately. `SharedPreferences` cannot tell
 * "never set" from "the user set it to false" unless every read checks
 * `contains`, and a default of `true` would silently re-enable a feature
 * someone had turned off on the next launch. Doing it here, once, behind a
 * stamp, means a user who switches it off in Settings keeps it off forever.
 *
 * Runs after usage access is granted, not before: on a fresh install the
 * `PermissionGate` screen is what the user is looking at, and stacking a
 * battery dialog on top of a screen that is itself asking for a permission is
 * how both get dismissed.
 */
export async function runFirstTimeSetup(): Promise<void> {
  if (Platform.OS !== "android") return;

  const s = await loadSettings();
  if (s.firstRunDoneAt !== null) return;
  // Not stamped yet — the app is not usable until this is granted, and
  // whichever foreground pass sees it granted will run the rest below.
  if (!hasUsageAccess()) return;

  setSyncKeepAliveEnabled(true);

  // Last, because it leaves the app. Skipped when Android has already
  // exempted us — some OEM ROMs grant it to sideloaded apps outright, and a
  // dialog that says "you already allowed this" is pure noise.
  if (isBatteryOptimized()) requestIgnoreBatteryOptimizations();

  // Stamped even when the user declines the dialog. This is a one-time
  // *offer*, not a demand: Settings › Background updates keeps the switch and
  // the battery row available for as long as the app is installed, and an app
  // that re-prompts every launch is one that gets its permissions denied
  // permanently.
  await saveSettings({ firstRunDoneAt: Date.now() });
}
