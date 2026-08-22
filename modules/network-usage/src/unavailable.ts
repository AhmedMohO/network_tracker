import type { NetworkUsageModule } from "./NetworkUsage.types";

const MESSAGE = "Per-app network usage is only available on Android.";

/** `() => never` satisfies every signature on the interface. */
function unavailable(): never {
  throw new Error(MESSAGE);
}

/**
 * Stand-in used by the non-Android platform entry points. Importing it does
 * nothing — only calling a method throws — so a route that pulls the module
 * in at module scope still lets `PermissionGate` render its explanation.
 */
export const unavailableNetworkUsage: NetworkUsageModule = {
  hasUsageAccess: unavailable,
  openUsageAccessSettings: unavailable,
  openAppDataUsageSettings: unavailable,
  getAppUsage: unavailable,
  getAppIcon: unavailable,
  dumpBuckets: unavailable,
  getSeries: unavailable,
  getWifiNetworkUsage: unavailable,
  isWifiWatchEnabled: unavailable,
  setWifiWatchEnabled: unavailable,
  wifiWatchProblem: unavailable,
  openWifiWatchSettings: unavailable,
  getKnownWifiNetworks: unavailable,
  clearWifiSessions: unavailable,
  isSyncKeepAliveEnabled: unavailable,
  setSyncKeepAliveEnabled: unavailable,
  isIgnoringBatteryOptimizations: unavailable,
  requestIgnoreBatteryOptimizations: unavailable,
  getDeviceCounters: unavailable,
  getDeviceContext: unavailable,
  canInstallPackages: unavailable,
  openInstallPermissionSettings: unavailable,
  installApk: unavailable,
};
