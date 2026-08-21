import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { loadSettings, saveSettings } from "@/features/usage/settings";

import { rpc } from "./sync";

/**
 * Registers this device with the server so it can be woken on demand.
 *
 * This is the third and last leg of "why did my child's phone stop syncing".
 * The other two make Android's own scheduling more likely to happen;
 * this one stops depending on it. A high-priority push is the only mechanism
 * on Android that reaches an idle, Dozing, backgrounded app on a schedule the
 * *server* chooses — it is what every messaging app uses, and it is why they
 * appear to update instantly while a `PeriodicWorkRequest` does not.
 *
 * Expo's push service rather than raw FCM: this project already has an EAS
 * project id, and `exp.host` accepts a plain POST with an anon-safe token, so
 * the server side is a few lines of SQL (`family_ping_stale` in
 * `docs/family-schema.sql`) instead of a deployed function that has to mint
 * Google OAuth JWTs. Delivery still goes over FCM underneath, which is why
 * `docs/push-setup.md`'s one manual step is uploading an FCM key to EAS.
 */
export async function registerPushToken(): Promise<void> {
  if (Platform.OS !== "android") return;

  const s = await loadSettings();
  // Nothing to wake up, and nobody to tell: an unpaired device has no row on
  // the server and no reason to hand a token to one.
  if (!s.pairToken || !s.deviceId) return;

  // A token is only issued once notifications are granted. Not requested here:
  // `ensureNotificationSetup` already asks at startup, and a second prompt
  // from a background path is how apps get their permission denied for good.
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return;

  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId;
  if (!projectId) return;

  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    // No Google Play services, no FCM credentials on the build, no network —
    // all of which mean this leg is unavailable and the other two carry it.
    console.warn("[family] push token unavailable:", e);
    return;
  }

  if (token === s.pushToken) return;

  await rpc("family_register_token", {
    p_token: s.pairToken,
    p_device: s.deviceId,
    p_push: token,
  });
  // Stamped only after the RPC returns, so a failed call is retried on the
  // next app start rather than being remembered as done.
  await saveSettings({ pushToken: token });
}
