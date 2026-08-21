import NetworkUsage from "@modules/network-usage";
import { Platform } from "react-native";

/**
 * The two switches that decide whether `USAGE_CHECK_TASK` actually runs on
 * time — see the Kotlin `SyncKeepAlive` for why `registerBackgroundCheck`'s
 * `minimumInterval: 15` is a request Android is free to ignore for a day.
 *
 * Every call is guarded the same way `features/usage/wifiNetworks.ts` guards
 * its own: an APK that took a JS-only OTA has this file and none of the native
 * methods it names, and "off" is the right answer there rather than a crash.
 */

export function isSyncKeepAliveEnabled(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    return NetworkUsage.isSyncKeepAliveEnabled();
  } catch {
    return false;
  }
}

export function setSyncKeepAliveEnabled(enabled: boolean): void {
  if (Platform.OS !== "android") return;
  try {
    NetworkUsage.setSyncKeepAliveEnabled(enabled);
  } catch {
    // An old APK cannot turn this on; the switch stays where it was.
  }
}

/**
 * True when Android may still defer this app's background work. Reported as
 * the *problem* rather than the permission, because that is what the settings
 * row is telling the user about — and because an unsupported build answering
 * "no problem" is the right failure direction for a row that otherwise nags.
 */
export function isBatteryOptimized(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    return !NetworkUsage.isIgnoringBatteryOptimizations();
  } catch {
    return false;
  }
}

export function requestIgnoreBatteryOptimizations(): void {
  if (Platform.OS !== "android") return;
  try {
    NetworkUsage.requestIgnoreBatteryOptimizations();
  } catch {
    // No dialog on this build; the settings row simply does nothing.
  }
}
