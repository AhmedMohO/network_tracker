import { Platform } from "react-native";

import {
  isBatteryOptimized,
  requestIgnoreBatteryOptimizations,
  setSyncKeepAliveEnabled,
} from "@/features/limits/keepAlive";

import { hasUsageAccess } from "./api";
import { loadSettings, saveSettings } from "./settings";
import { enableWifiWatch, isWifiWatchEnabled } from "./wifiNetworks";

/**
 * Turns on the two features that have to be on for the app to be any good,
 * and asks for the permission they need, once per install.
 *
 * Both switches default to off in the native prefs and stay that way — the
 * defaults are not flipped in Kotlin, deliberately. `SharedPreferences` cannot
 * tell "never set" from "the user set it to false" unless every read checks
 * `contains`, and a default of `true` would silently re-enable a feature
 * someone had turned off on the next launch. Doing it here, once, behind a
 * stamp, means a user who switches either of these off in Settings keeps it
 * off forever.
 *
 * Runs after usage access is granted, not before: on a fresh install the
 * `PermissionGate` screen is what the user is looking at, and stacking a
 * location prompt and a battery dialog on top of a screen that is itself
 * asking for a permission is how all three get dismissed.
 */
export async function runFirstTimeSetup(): Promise<void> {
  if (Platform.OS !== "android") return;

  const s = await loadSettings();
  if (s.firstRunDoneAt !== null) return;
  // Not stamped yet — the app is not usable until this is granted, and
  // whichever foreground pass sees it granted will run the rest below.
  if (!hasUsageAccess()) return;

  // No permission, no dialog, so it goes first and cannot be lost behind one.
  setSyncKeepAliveEnabled(true);

  // Before the battery dialog, not after: this is an in-app runtime prompt
  // that resolves a promise, whereas the battery one hands control to a
  // system activity. Asking in the other order races the two.
  //
  // A decline is an ordinary outcome and leaves the watch off — running it
  // without location would record every network as "unknown", which is worse
  // than not running it, since the usage still lands in the unattributed
  // bucket either way but the notification claims otherwise.
  if (!isWifiWatchEnabled()) {
    await enableWifiWatch().catch(() => false);
  }

  // Last, because it leaves the app. Skipped when Android has already
  // exempted us — some OEM ROMs grant it to sideloaded apps outright, and a
  // dialog that says "you already allowed this" is pure noise.
  if (isBatteryOptimized()) requestIgnoreBatteryOptimizations();

  // Stamped even when the user declined either prompt. This is a one-time
  // *offer*, not a demand: Settings › Background updates keeps both switches
  // and the battery row available for as long as the app is installed, and an
  // app that re-prompts every launch is one that gets its permissions denied
  // permanently.
  await saveSettings({ firstRunDoneAt: Date.now() });
}
