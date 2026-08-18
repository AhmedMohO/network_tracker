import { useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [granted, setGranted] = useState(false);

  // This component sits above <Stack>, so navigation focus events never reach
  // it. Returning from the system settings screen re-activates the app, and
  // that is the only moment the answer can change.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const check = () => setGranted(readUsageAccess());
    check();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check();
    });
    return () => sub.remove();
  }, []);

  if (Platform.OS !== 'android') {
    return (
      <ThemedView style={styles.screen}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.content}>
            <ThemedText type="subtitle">{t('permission.androidOnly')}</ThemedText>
            <ThemedText themeColor="textSecondary">{t('permission.androidOnlyBody')}</ThemedText>
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
          <ThemedText type="subtitle">{t('permission.title')}</ThemedText>
          <ThemedText themeColor="textSecondary">
            {/* `app` is bolded in place, so the sentence stays one translatable
                unit instead of three fragments the translator has to reorder. */}
            <Trans
              i18nKey="permission.body"
              values={{ app: 'network_tracker' }}
              components={{ 1: <ThemedText type="default" style={styles.appName} /> }}
            />
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('permission.privacy')}
          </ThemedText>
          <Pressable
            onPress={openSettings}
            accessibilityRole="button"
            accessibilityLabel={t('permission.open')}
            accessibilityHint={t('permission.openHint')}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
            ]}>
            <ThemedText type="default" themeColor="accentForeground">
              {t('permission.open')}
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
