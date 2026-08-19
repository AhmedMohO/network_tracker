import { Lock, ShieldAlert, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { AppState, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
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
          <Card style={styles.contentCard}>
            <View style={[styles.heroIconBox, { backgroundColor: theme.accentMuted }]}>
              <ShieldAlert size={36} color={theme.accent} />
            </View>
            <ThemedText type="subtitle" style={styles.centerText}>
              {t('permission.androidOnly')}
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.centerText}>
              {t('permission.androidOnlyBody')}
            </ThemedText>
          </Card>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (granted) return <>{children}</>;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <Card style={styles.contentCard}>
          <View style={[styles.heroIconBox, { backgroundColor: theme.accentMuted }]}>
            <ShieldCheck size={40} color={theme.accent} />
          </View>

          <ThemedText type="subtitle" style={styles.centerText}>
            {t('permission.title')}
          </ThemedText>

          <ThemedText themeColor="textSecondary" style={styles.bodyText}>
            <Trans
              i18nKey="permission.body"
              values={{ app: t('common.appName') }}
              components={{ 1: <ThemedText type="default" style={styles.appName} /> }}
            />
          </ThemedText>

          <View style={[styles.privacyBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
            <Lock size={15} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.privacyText}>
              {t('permission.privacy')}
            </ThemedText>
          </View>

          <Button
            size="lg"
            variant="default"
            title={t('permission.open')}
            onPress={openSettings}
            accessibilityLabel={t('permission.open')}
            accessibilityHint={t('permission.openHint')}
            style={styles.actionBtn}
          />
        </Card>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  contentCard: {
    padding: Spacing.five,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    alignItems: 'center',
  },
  heroIconBox: {
    width: 72,
    height: 72,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  centerText: {
    textAlign: 'center',
  },
  bodyText: {
    textAlign: 'center',
    lineHeight: 22,
  },
  appName: { fontWeight: '700' },
  privacyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    width: '100%',
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
  },
  actionBtn: {
    width: '100%',
    marginTop: Spacing.two,
  },
});
