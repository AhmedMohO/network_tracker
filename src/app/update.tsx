import NetworkUsage from '@modules/network-usage';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { fetchLatestRelease, isNewerVersion, type ReleaseInfo } from '@/features/updates/apk';
import { useTheme } from '@/hooks/use-theme';

/** The repository this app is released from. */
const REPO = 'AhmedMohO/network_tracker';

export default function Update() {
  const theme = useTheme();
  const { t } = useTranslation();
  const current = Application.nativeApplicationVersion ?? '0.0.0';
  const [release, setRelease] = useState<ReleaseInfo | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchLatestRelease(REPO)
      .then((r) => alive && setRelease(r))
      .catch(() => alive && setMessage(t('updateScreen.unreachable')))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, [t]);

  const newer =
    release !== null && isNewerVersion(release.version, current) && release.apkUrl !== null;

  const download = async () => {
    if (!release?.apkUrl) return;

    // Ask for install permission before spending the user's data on a download
    // that would stop at the last step anyway.
    if (!NetworkUsage.canInstallPackages()) {
      setMessage(t('updateScreen.needPermission'));
      NetworkUsage.openInstallPermissionSettings();
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const target = new File(Paths.cache, 'update.apk');
      if (target.exists) target.delete();
      const downloaded = await File.downloadFileAsync(release.apkUrl, target);
      NetworkUsage.installApk(downloaded.uri);
    } catch (e) {
      setMessage(t('updateScreen.failed', { error: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: t('updateScreen.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('updateScreen.installed', { version: current })}
        </ThemedText>

        {checking && <ActivityIndicator color={theme.accent} accessibilityLabel={t('common.loading')} />}

        {!checking && !newer && (
          <ThemedText type="default">{t('updateScreen.upToDate')}</ThemedText>
        )}

        {newer && release && (
          <View style={styles.block}>
            <ThemedText type="subtitle">
              {t('updateScreen.available', { version: release.version })}
            </ThemedText>
            {release.notes ? <ThemedText type="small">{release.notes}</ThemedText> : null}
            <ThemedText type="small" themeColor="textSecondary">
              {t('updateScreen.unknownSourceWarning')}
            </ThemedText>
            {busy ? (
              <ActivityIndicator color={theme.accent} accessibilityLabel={t('updateScreen.downloading')} />
            ) : (
              <Pressable
                onPress={download}
                accessibilityRole="button"
                accessibilityLabel={t('updateScreen.install')}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="default" themeColor="accentForeground">
                  {t('updateScreen.install')}
                </ThemedText>
              </Pressable>
            )}
          </View>
        )}

        {message && (
          <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
            {message}
          </ThemedText>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  block: { gap: Spacing.two },
  button: {
    minHeight: 48,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    alignSelf: 'flex-start',
  },
});
