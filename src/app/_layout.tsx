import { reloadAppAsync } from 'expo';
import * as Linking from 'expo-linking';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Alert, Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { parsePairLink } from '@/features/family/pair';
import { joinAsChild } from '@/features/family/useFamily';
// Importing this at module scope registers the TaskManager task on load.
import { registerBackgroundCheck } from '@/features/limits/backgroundCheck';
import { ensureNotificationSetup } from '@/features/limits/notify';
import { applyOtaUpdate, checkForOtaUpdate } from '@/features/updates/ota';
import { PermissionGate } from '@/features/usage/PermissionGate';
import { loadSettings } from '@/features/usage/settings';
import { UsageProvider } from '@/features/usage/useUsageContext';
import i18n, { syncLayoutDirection } from '@/i18n';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Android only applies a layout-direction flip to a freshly started bundle,
  // so a device whose locale disagrees with the stored language reloads once.
  useEffect(() => {
    if (syncLayoutDirection(i18n.language)) reloadAppAsync();
  }, []);

  // Notifications and background tasks have no meaningful web implementation.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    ensureNotificationSetup().then((granted) => {
      if (granted) registerBackgroundCheck();
    });
  }, []);

  // A downloaded bundle is applied by a reload, and a reload mid-session throws
  // away whatever the user was looking at — so it is offered, never forced.
  useEffect(() => {
    checkForOtaUpdate().then((result) => {
      if (result !== 'downloaded') return;
      Alert.alert(i18n.t('update.readyTitle'), i18n.t('update.readyBody'), [
        { text: i18n.t('update.later'), style: 'cancel' },
        { text: i18n.t('update.restart'), onPress: () => applyOtaUpdate() },
      ]);
    });
  }, []);

  // Covers both a cold start via the link and the app already running. This
  // sits above `UsageProvider`, so it cannot use `useFamily` — it goes
  // through the plain `joinAsChild` export instead, and reloads the app
  // afterwards so every screen (in particular the child's disclosure banner)
  // picks up the new pairing immediately rather than on next restart.
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    const pairing = parsePairLink(url);
    if (!pairing) return;
    loadSettings().then((s) => {
      // Already paired with this exact link: no prompt, not even a no-op one.
      if (s.pairToken === pairing.token) return;
      // Never pair silently: a link can arrive from anyone, and the whole point
      // of this feature is that the person being monitored knows about it.
      Alert.alert(
        i18n.t('family.joinTitle'),
        i18n.t('family.joinBody', { label: pairing.label }),
        [
          { text: i18n.t('common.cancel'), style: 'cancel' },
          {
            text: i18n.t('family.join'),
            onPress: () => {
              joinAsChild(pairing.token, pairing.label).then(() => reloadAppAsync());
            },
          },
        ]
      );
    });
  }, [url]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <UsageProvider>
        <PermissionGate>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </PermissionGate>
      </UsageProvider>
    </ThemeProvider>
  );
}
