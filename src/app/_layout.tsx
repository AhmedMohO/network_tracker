import { reloadAppAsync } from 'expo';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Alert, Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
// Importing this at module scope registers the TaskManager task on load.
import { registerBackgroundCheck } from '@/features/limits/backgroundCheck';
import { ensureNotificationSetup } from '@/features/limits/notify';
import { applyOtaUpdate, checkForOtaUpdate } from '@/features/updates/ota';
import { PermissionGate } from '@/features/usage/PermissionGate';
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
