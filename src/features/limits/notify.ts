import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import i18n from "@/i18n";

const CHANNEL_ID = "usage-alerts";

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === "android") {
    // Required on Android 8+; without it notifications are silently dropped.
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: i18n.t("alerts.channelName"),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Runtime permission is required on Android 13+; a no-op below that.
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notify(title: string, body: string): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null, // deliver immediately
    ...(Platform.OS === "android" ? { channelId: CHANNEL_ID } : {}),
  });
}
