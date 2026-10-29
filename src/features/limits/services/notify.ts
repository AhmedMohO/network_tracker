import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import i18n from "@/i18n";

const CHANNEL_ID = "usage-alerts";

Notifications.setNotificationHandler({
  handleNotification: async ({ request }) => ({
    shouldShowAlert: Boolean(request.content.title || request.content.body),
    shouldShowBanner: Boolean(request.content.title || request.content.body),
    shouldShowList: Boolean(request.content.title || request.content.body),
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function createAlertChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: i18n.t("alerts.channelName"),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === "android") await createAlertChannel();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  // Runtime permission is required on Android 13+; a no-op below that.
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notify(title: string, body: string, identifier?: string): Promise<boolean> {
  // The background task now runs whether or not notifications were granted —
  // it is also the sync path (see `_layout.tsx`). Scheduling on a denied
  // permission rejects, and this is the one function every alert path routes
  // through, so the guard lives here rather than in each of its six callers.
  const { granted } = await Notifications.getPermissionsAsync();
  if (!granted) return false;
  if (Platform.OS === "android") {
    const channel = await Notifications.getNotificationChannelAsync(CHANNEL_ID);
    if (channel?.importance === Notifications.AndroidImportance.NONE) return false;
    if (!channel) await createAlertChannel();
  }

  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body },
    // deliver immediately — a channel-only trigger carries no schedule, it
    // just tells Android which channel to post on. `channelId` is only read
    // here; at the top level of the request it is silently ignored.
    trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null,
  });
  return true;
}
