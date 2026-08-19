import { Stack, useLocalSearchParams } from 'expo-router';
import {
  AlertCircle,
  ExternalLink,
  Moon,
  PieChart,
  RefreshCw,
  Sun,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Radius, Spacing, TextEnd } from '@/constants/theme';
import { AppIcon } from '@/features/usage/AppIcon';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChartCard } from '@/features/usage/UsageChart';
import { openAppDataUsageSettings } from '@/features/usage/api';
import { formatBytes } from '@/features/usage/format';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';

function LegendRow({
  color,
  icon,
  label,
  bytes,
  percent,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  bytes: number;
  percent: number;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: color }]}>
        {icon}
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.legendLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.legendValue}>
        {formatBytes(bytes)} · {percent}%
      </ThemedText>
    </View>
  );
}

function StateSplit({ foreground, background }: { foreground: number; background: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const sum = foreground + background;
  const share = sum === 0 ? 0 : (foreground / sum) * 100;
  const foregroundPercent = Math.round(share);
  const backgroundPercent = 100 - foregroundPercent;

  return (
    <Card style={styles.splitCard}>
      <View style={styles.splitHeader}>
        <View style={styles.splitTitleGroup}>
          <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
            <PieChart size={16} color={theme.accent} />
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('app.splitTitle')}
          </ThemedText>
        </View>
      </View>

      <View
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          sum === 0
            ? t('app.splitEmptyA11y')
            : t('app.splitA11y', {
                foregroundPercent,
                foreground: formatBytes(foreground),
                backgroundPercent,
                background: formatBytes(background),
              })
        }>
        <View style={[styles.fill, { width: `${share}%`, backgroundColor: theme.accent }]} />
        <View
          style={[styles.fill, { width: `${100 - share}%`, backgroundColor: theme.accentAlt }]}
        />
      </View>

      <View style={styles.legend}>
        <LegendRow
          color={theme.accent}
          icon={<Sun size={10} color="#FFF" />}
          label={t('app.foreground')}
          bytes={foreground}
          percent={foregroundPercent}
        />
        <LegendRow
          color={theme.accentAlt}
          icon={<Moon size={10} color="#FFF" />}
          label={t('app.background')}
          bytes={background}
          percent={backgroundPercent}
        />
      </View>
    </Card>
  );
}

export default function AppUsageDetail() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { uid: uidParam } = useLocalSearchParams<{ uid: string }>();
  const uid = Number(uidParam);
  const { range, network } = useUsageContext();
  const { data, loading, error, reload } = useUsage(range, network);

  const app = data?.apps.find((a) => a.uid === uid);
  const validUid = Number.isInteger(uid);
  const networkLabel = t(`network.${network.toLowerCase()}`);

  const openSettings = () => {
    if (!app?.packageName) return;
    try {
      openAppDataUsageSettings(app.packageName);
    } catch {
      toast(t('app.openSettingsFailed'));
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: app?.name ?? t('app.unknown') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* App Profile Hero Card */}
        {app ? (
          <Card style={styles.heroProfileCard}>
            <AppIcon packageName={app.packageName} name={app.name} size={54} />
            <View style={styles.profileTextGroup}>
              <ThemedText type="default" numberOfLines={2} style={styles.appName}>
                {app.name}
              </ThemedText>
              <View style={styles.badgeRow}>
                <Badge variant="secondary" label={networkLabel} />
                <Badge variant="outline" label={t(`range.${range.preset}`)} />
              </View>
              {app.packageName ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {app.packageName}
                </ThemedText>
              ) : null}
            </View>
          </Card>
        ) : null}

        {!validUid ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('app.badLink')}
          </ThemedText>
        ) : null}

        {validUid && loading && !data ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} accessibilityLabel={t('dashboard.loading')} />
          </View>
        ) : null}

        {validUid && error ? (
          <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <AlertCircle size={24} color={theme.destructive} />
            <ThemedText type="default" style={{ fontWeight: '700' }}>
              {t('dashboard.errorTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
            <Button
              variant="default"
              icon={<RefreshCw size={15} color={theme.primaryForeground} />}
              title={t('common.retry')}
              onPress={reload}
              accessibilityLabel={t('common.retry')}
            />
          </View>
        ) : null}

        {validUid && data && !error && !app ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('app.notInRange')}
          </ThemedText>
        ) : null}

        {app ? (
          <>
            <TotalsCard
              title={t('totals.appTitle')}
              totals={{ download: app.download, upload: app.upload, total: app.total }}
            />
            <StateSplit foreground={app.foreground} background={app.background} />
            <UsageChartCard uid={app.uid} />
            {app.packageName ? (
              <Button
                size="lg"
                variant="default"
                icon={<ExternalLink size={18} color={theme.primaryForeground} />}
                title={t('app.openSettings')}
                onPress={openSettings}
                accessibilityLabel={t('app.openSettingsA11y', { name: app.name })}
                accessibilityHint={t('app.openSettingsHint')}
                style={styles.openSettingsBtn}
              />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                {t('app.noPackage')}
              </ThemedText>
            )}
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    gap: Spacing.three,
    padding: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: Spacing.six,
  },
  heroProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.four,
  },
  profileTextGroup: {
    flex: 1,
    gap: 4,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginVertical: 2,
    flexWrap: 'wrap',
  },
  splitCard: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: { height: 10, borderRadius: Radius.full, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 10 },
  legend: { gap: Spacing.two },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendLabel: { flex: 1 },
  legendValue: { fontVariant: ['tabular-nums'], textAlign: TextEnd },
  loadingBox: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.two,
    alignItems: 'center',
  },
  openSettingsBtn: {
    width: '100%',
  },
});
