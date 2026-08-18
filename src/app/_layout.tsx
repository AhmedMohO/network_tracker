import { reloadAppAsync } from 'expo';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
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
