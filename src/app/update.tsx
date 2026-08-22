import NetworkUsage from '@modules/network-usage';
import * as Application from 'expo-application';
import { File, Paths } from 'expo-file-system';
import { Stack } from 'expo-router';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  DownloadCloud,
  FileText,
  Sparkles,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
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
        {/* Status Card */}
        <Card style={styles.card}>
          <View style={styles.statusHeader}>
            <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
              <DownloadCloud size={20} color={theme.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText type="default" style={{ fontWeight: '700' }}>
                {t('updateScreen.title')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('updateScreen.installed', { version: current })}
              </ThemedText>
            </View>
          </View>

          {checking && (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={theme.accent} accessibilityLabel={t('common.loading')} />
            </View>
          )}

          {!checking && release !== null && !newer && (
            <View style={[styles.upToDateBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
              <CheckCircle2 size={24} color={theme.success} />
              <ThemedText type="default" style={{ fontWeight: '600' }}>
                {t('updateScreen.upToDate')}
              </ThemedText>
            </View>
          )}

          {newer && release && (
            <View style={styles.updateAvailableGroup}>
              <Badge
                variant="accent"
                icon={<Sparkles size={12} color={theme.accent} />}
                label={t('updateScreen.available', { version: release.version })}
              />

              {release.notes ? (
                <View style={[styles.notesCard, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                  <View style={styles.notesHeader}>
                    <FileText size={14} color={theme.textSecondary} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {t('updateScreen.releaseNotes')}
                    </ThemedText>
                  </View>
                  <ThemedText type="small">{release.notes}</ThemedText>
                </View>
              ) : null}

              <View style={[styles.warningBox, { backgroundColor: theme.warningMuted, borderColor: theme.warning + '44' }]}>
                <AlertTriangle size={15} color={theme.warning} />
                <ThemedText type="small" themeColor="textSecondary" style={styles.warningText}>
                  {t('updateScreen.unknownSourceWarning')}
                </ThemedText>
              </View>

              <Button
                size="lg"
                variant="default"
                icon={<DownloadCloud size={18} color={theme.primaryForeground} />}
                title={t('updateScreen.install')}
                loading={busy}
                onPress={download}
                accessibilityLabel={
                  busy ? t('updateScreen.downloading') : t('updateScreen.install')
                }
                style={styles.installBtn}
              />
            </View>
          )}

          {message && (
            <View style={[styles.errorBox, { backgroundColor: theme.destructive + '22', borderColor: theme.destructive + '44' }]}>
              <AlertCircle size={15} color={theme.destructive} />
              <ThemedText type="small" themeColor="destructive" accessibilityRole="alert" style={{ flex: 1 }}>
                {message}
              </ThemedText>
            </View>
          )}
        </Card>
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
    paddingBottom: Spacing.six,
  },
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  upToDateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  updateAvailableGroup: {
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  notesCard: {
    width: '100%',
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.one,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    width: '100%',
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  installBtn: {
    width: '100%',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
