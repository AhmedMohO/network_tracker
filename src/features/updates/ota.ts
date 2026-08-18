import * as Updates from "expo-updates";

export type OtaResult = "none" | "downloaded" | "error";

/**
 * Checks for a published JS bundle and downloads it if there is one. Nothing is
 * applied here — the reload is the user's decision, see `applyOtaUpdate`.
 *
 * Returns "none" until `eas update:configure` has been run and a release build
 * is installed: there is no bundle to replace in development.
 */
export async function checkForOtaUpdate(): Promise<OtaResult> {
  if (__DEV__ || !Updates.isEnabled) return "none";
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return "none";
    await Updates.fetchUpdateAsync();
    return "downloaded";
  } catch {
    // An offline device is the normal case here, not an error worth showing.
    return "error";
  }
}

export async function applyOtaUpdate(): Promise<void> {
  await Updates.reloadAsync();
}
