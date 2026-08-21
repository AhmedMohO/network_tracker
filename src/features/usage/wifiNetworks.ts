import NetworkUsage, {
  type WifiNetworkUsageResult,
} from "@modules/network-usage";
import { PermissionsAndroid, Platform } from "react-native";

import i18n from "@/i18n";

import { sumUsage, toAppUsage } from "./aggregate";
import { coverageDrift, type Range } from "./range";
import type { WifiNetworkSlice } from "./wifiSlices";

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

/**
 * Turns the watch on, asking for location first.
 *
 * Android has tied the connected network's *name* to `ACCESS_FINE_LOCATION`
 * since Android 10 — a nearby SSID identifies a place, so the OS treats
 * reading one as a location read. There is no narrower permission that returns
 * an SSID, so this is the whole cost of the feature, and the caller has to be
 * able to tell the user when the request was declined.
 *
 * Returns false when the user declines; the watch stays off.
 */
export async function enableWifiWatch(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: i18n.t("wifiNetworks.permissionTitle"),
      message: i18n.t("wifiNetworks.permissionBody"),
      buttonPositive: i18n.t("common.ok"),
      buttonNegative: i18n.t("common.cancel"),
    }
  );
  if (granted !== PermissionsAndroid.RESULTS.GRANTED) return false;
  NetworkUsage.setWifiWatchEnabled(true);
  return true;
}

export function disableWifiWatch(): void {
  if (Platform.OS !== "android") return;
  NetworkUsage.setWifiWatchEnabled(false);
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
