import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * `./api` pulls in the native module at import time, which throws on any
 * platform where it is not registered. Load it only once we know we are on
 * Android so the non-Android explanation screen can actually render.
 */
function readUsageAccess(): boolean {
  if (Platform.OS !== 'android') return false;
  return (require('./api') as typeof import('./api')).hasUsageAccess();
}

function openSettings(): void {
  if (Platform.OS !== 'android') return;
  (require('./api') as typeof import('./api')).openUsageAccessSettings();
}

export function PermissionGate({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [granted, setGranted] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;
      const check = () => setGranted(readUsageAccess());
      check();
      // Returning from the system settings screen re-activates the app; that
      // is the only moment the answer can change.
      const sub = AppState.addEventListener('change', (s) => {
        if (s === 'active') check();
      });
      return () => sub.remove();
    }, [])
  );

  if (Platform.OS !== 'android') {
    return (
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <ThemedText type="subtitle">Android only</ThemedText>
            <ThemedText themeColor="textSecondary">
              Per-app network usage is not available on this platform.
            </ThemedText>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (granted) return <>{children}</>;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="subtitle">Usage access needed</ThemedText>
          <ThemedText themeColor="textSecondary">
            Android keeps per-app network statistics behind a special permission. Tap below, find{' '}
            <ThemedText type="default" style={styles.appName}>
              network_tracker
            </ThemedText>{' '}
            in the list, and turn on &ldquo;Permit usage access&rdquo;.
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nothing leaves your device. There is no account and no network call.
          </ThemedText>
          <Pressable
            onPress={openSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
            accessibilityHint="Opens the Android usage access settings screen"
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
            ]}>
            <ThemedText type="default" themeColor="accentForeground">
              Open settings
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'center' },
  content: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  appName: { fontWeight: '700' },
  button: {
    minHeight: 48,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
});
