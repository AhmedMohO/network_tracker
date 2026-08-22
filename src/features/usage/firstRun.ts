import { Platform } from "react-native";

import { setSyncKeepAliveEnabled } from "@/features/limits/keepAlive";

import { hasUsageAccess } from "./api";
import { loadSettings, saveSettings } from "./settings";

/**
 * Turns on the background updates the app is useless without, once per install.
 *
 * The battery-optimization exemption those updates need is deliberately *not*
 * asked for here. On a fresh install nothing has explained why the app wants
 * to be exempt, and a system dialog with no context is one that gets denied.
 * It is asked at the moment it is both explicable and actually needed — when
 * this device joins a parent as a child (`family/useFamily.ts`, `joinAsChild`),
 * which is when missed background pushes start costing the user something —
 * and stays available forever from Settings › Background updates.
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
 * Runs after usage access is granted, not before: until it is, the background
 * task this switch schedules has nothing it is allowed to read.
 */
export async function runFirstTimeSetup(): Promise<void> {
  if (Platform.OS !== "android") return;

  const s = await loadSettings();
  if (s.firstRunDoneAt !== null) return;
  // Not stamped yet — the app is not usable until this is granted, and
  // whichever foreground pass sees it granted will run the rest below.
  if (!hasUsageAccess()) return;

  setSyncKeepAliveEnabled(true);

  await saveSettings({ firstRunDoneAt: Date.now() });
}
