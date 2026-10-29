/**
 * The codes `NetworkUsage.wifiWatchProblem` can return, and the line that
 * explains each one to the user.
 *
 * Its own module, small as it is, so `wifiProblem.test.ts` can check that every
 * code has a translation in every locale without importing the settings screen
 * — and with it React Native, `@/i18n` and the native module. Same reason
 * `wifiSlices` is split out of `wifiNetworks`.
 *
 * A missing entry here is not a crash but something worse: i18next falls back
 * to echoing the key, so the one line telling the user why the feature is
 * recording nothing would read `wifiNetworks.problemLocationOff`.
 */
export const WIFI_PROBLEM_KEY = {
  permission: "wifiNetworks.problemPermission",
  locationOff: "wifiNetworks.problemLocationOff",
  background: "wifiNetworks.problemBackground",
} as const;

export type WifiWatchProblem = keyof typeof WIFI_PROBLEM_KEY;
