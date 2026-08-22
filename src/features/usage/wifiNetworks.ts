import NetworkUsage, {
  type WifiNetworkUsageResult,
} from "@modules/network-usage";
import { PermissionsAndroid, Platform } from "react-native";

import i18n from "@/i18n";

import { sumUsage, toAppUsage } from "./aggregate";
import { coverageDrift, type Range } from "./range";
import type { WifiNetworkSlice } from "./wifiSlices";
import type { WifiWatchProblem } from "./wifiProblem";

export { mergeSlices, sliceApp, type WifiNetworkSlice } from "./wifiSlices";

export type WifiNetworkResult = {
  networks: WifiNetworkSlice[];
  coverage: { start: number; end: number } | null;
};

/** Whether this device can answer the per-network question at all. */
export function isWifiWatchEnabled(): boolean {
  if (Platform.OS !== "android") return false;
  try {
    return NetworkUsage.isWifiWatchEnabled();
  } catch {
    // An old APK that took a JS-only OTA has the new JS and none of the new
    // native methods. "Off" is the right answer there, not a crash.
    return false;
  }
}

/** Android 10, where background location and the SSID redaction both start. */
const Q = 29;

/**
 * Turns the watch on, asking for location first.
 *
 * Android has tied the connected network's *name* to `ACCESS_FINE_LOCATION`
 * since Android 10 — a nearby SSID identifies a place, so the OS treats
 * reading one as a location read. There is no narrower permission that returns
 * an SSID, so this is the whole cost of the feature, and the caller has to be
 * able to tell the user when the request was declined.
 *
 * Two requests, not one, and both are required:
 *
 *  - `ACCESS_COARSE_LOCATION` rides along with `ACCESS_FINE_LOCATION` because
 *    from Android 12 a request for fine on its own is *ignored* — no dialog,
 *    no result, just `ACCESS_FINE_LOCATION must be requested with
 *    ACCESS_COARSE_LOCATION` in logcat. Only fine actually lifts the
 *    redaction, so coarse is here to make the dialog happen.
 *  - `ACCESS_BACKGROUND_LOCATION` because a while-in-use grant lets the app
 *    read an SSID only while it is on screen, which for a background watch
 *    means recording almost nothing. Android 11+ will not grant this from a
 *    dialog — the user has to pick "Allow all the time" on a settings page —
 *    so a decline here is expected and is *not* fatal: the watch is switched
 *    on anyway, records what it can while the app is open, and Settings shows
 *    `wifiWatchProblem` until they finish the job.
 *
 * `blocked` is told apart from `denied` because the two need different
 * answers. After two refusals Android stops showing the dialog at all and
 * every later request returns immediately — so repeating "permission is
 * needed" to someone tapping a switch that can no longer do anything is a dead
 * end, and the only way out is the app's own settings page.
 */
export type EnableWatchResult = "on" | "denied" | "blocked";

export async function enableWifiWatch(): Promise<EnableWatchResult> {
  if (Platform.OS !== "android") return "denied";
  const rationale = {
    title: i18n.t("wifiNetworks.permissionTitle"),
    message: i18n.t("wifiNetworks.permissionBody"),
    buttonPositive: i18n.t("common.ok"),
    buttonNegative: i18n.t("common.cancel"),
  };

  const grants = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  const fine = grants[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  if (fine !== PermissionsAndroid.RESULTS.GRANTED) {
    return fine === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
      ? "blocked"
      : "denied";
  }

  if (Number(Platform.Version) >= Q) {
    await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      { ...rationale, message: i18n.t("wifiNetworks.permissionBackground") }
    );
  }

  NetworkUsage.setWifiWatchEnabled(true);
  return "on";
}

export function disableWifiWatch(): void {
  if (Platform.OS !== "android") return;
  NetworkUsage.setWifiWatchEnabled(false);
}

/**
 * Why the watch is recording nothing, or null when it is fine. Read on every
 * foreground: all three causes are changed from system screens, so the app
 * only ever learns about them by looking.
 */
export function wifiWatchProblem(): WifiWatchProblem | null {
  if (Platform.OS !== "android") return null;
  try {
    return NetworkUsage.wifiWatchProblem();
  } catch {
    // Same reason as `isWifiWatchEnabled`: an old APK on a JS-only OTA has no
    // such native method, and "nothing is wrong" is the answer that leaves the
    // screen looking exactly as it did before this existed.
    return null;
  }
}

export function openWifiWatchSettings(): void {
  if (Platform.OS !== "android") return;
  try {
    NetworkUsage.openWifiWatchSettings();
  } catch {
    // Nothing to open on an APK that predates it; better than a red screen.
  }
}

/** Names recorded so far, newest first. Empty until the watch has seen one. */
export function knownWifiNetworks(): string[] {
  if (Platform.OS !== "android") return [];
  try {
    return NetworkUsage.getKnownWifiNetworks();
  } catch {
    return [];
  }
}

/** Converts one native slice into the `AppUsage` shape every list renders. */
export function toSlice(
  network: WifiNetworkUsageResult["networks"][number]
): WifiNetworkSlice {
  const apps = toAppUsage(network.apps, (uid) => i18n.t("app.removed", { uid }));
  return { ssid: network.ssid, apps, totals: sumUsage(apps) };
}

export async function fetchWifiNetworkUsage(
  range: Range
): Promise<WifiNetworkResult> {
  const result = await NetworkUsage.getWifiNetworkUsage({
    start: range.start,
    end: range.end,
  });
  return {
    networks: result.networks.map(toSlice),
    coverage: coverageDrift(range, result.coveredStart, result.coveredEnd),
  };
}
