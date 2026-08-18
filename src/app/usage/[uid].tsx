import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { MaxContentWidth, Spacing, TextEnd } from '@/constants/theme';
import { AppIcon } from '@/features/usage/AppIcon';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChartCard } from '@/features/usage/UsageChart';
import { openAppDataUsageSettings } from '@/features/usage/api';
import { formatBytes } from '@/features/usage/format';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';

/** One legend line: the colour that appears in the bar, then what it means. */
function LegendRow({
  color,
  label,
  bytes,
  percent,
}: {
  color: string;
  label: string;
  bytes: number;
  percent: number;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="textSecondary" style={styles.legendLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.legendValue}>
        {formatBytes(bytes)} · {percent}%
      </ThemedText>
    </View>
  );
}

/** Two-part bar: how much of this app's traffic happened while it was on screen. */
function StateSplit({ foreground, background }: { foreground: number; background: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const sum = foreground + background;
  const share = sum === 0 ? 0 : (foreground / sum) * 100;
  const foregroundPercent = Math.round(share);
  const backgroundPercent = 100 - foregroundPercent;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('app.splitTitle')}
      </ThemedText>
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
      {/* The bar has two colours, so it needs to say which is which. */}
      <View style={styles.legend}>
        <LegendRow
          color={theme.accent}
          label={t('app.foreground')}
          bytes={foreground}
          percent={foregroundPercent}
        />
        <LegendRow
          color={theme.accentAlt}
          label={t('app.background')}
          bytes={background}
          percent={backgroundPercent}
        />
      </View>
    </ThemedView>
  );
}

export default function AppUsageDetail() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { uid: uidParam } = useLocalSearchParams<{ uid: string }>();
  const uid = Number(uidParam);
  const { range, network } = useUsageContext();
  const { data, loading, error, reload } = useUsage(range, network);

  // The same query the dashboard ran, so this total is the row's total by
  // construction rather than by a second, separately rounded calculation.
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
        <View style={styles.identity}>
          {app ? <AppIcon packageName={app.packageName} name={app.name} size={44} /> : null}
          <View style={styles.identityText}>
            <ThemedText type="default" numberOfLines={2}>
              {app?.name ?? (validUid ? t('app.unknownUid', { uid }) : t('app.unknown'))}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {networkLabel} · {t(`range.${range.preset}`)}
              {app?.packageName ? ` · ${app.packageName}` : ''}
            </ThemedText>
          </View>
        </View>

        {!validUid ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('app.badLink')}
          </ThemedText>
        ) : null}

        {validUid && loading && !data ? (
          <ActivityIndicator color={theme.accent} accessibilityLabel={t('dashboard.loading')} />
        ) : null}

        {validUid && error ? (
          <View style={styles.block}>
            <ThemedText type="default">{t('dashboard.errorTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
            <Pressable
              onPress={reload}
              accessibilityRole="button"
              accessibilityLabel={t('common.retry')}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="default" themeColor="accentForeground">
                {t('common.retry')}
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {validUid && data && !error && !app ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('app.notInRange')}
          </ThemedText>
        ) : null}

        {app ? (
          <>
            {/* No coverage note: `data.coverage` is the window unioned across
                every app, so it would not be a statement about this one. The
                chart below carries this app's own coverage. */}
            <TotalsCard
              title={t('totals.appTitle')}
              totals={{ download: app.download, upload: app.upload, total: app.total }}
            />
            <StateSplit foreground={app.foreground} background={app.background} />
            <UsageChartCard uid={app.uid} />
            {app.packageName ? (
              <Pressable
                onPress={openSettings}
                accessibilityRole="button"
                accessibilityLabel={t('app.openSettingsA11y', { name: app.name })}
                accessibilityHint={t('app.openSettingsHint')}
                style={({ pressed }) => [
                  styles.button,
                  styles.wideButton,
                  { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="default" themeColor="accentForeground">
                  {t('app.openSettings')}
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
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
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  identityText: { flex: 1 },
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  block: { gap: Spacing.two },
  track: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  fill: { height: 10 },
  legend: { gap: Spacing.one },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { flex: 1 },
  legendValue: { fontVariant: ['tabular-nums'], textAlign: TextEnd },
  button: {
    minHeight: 48,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    alignSelf: 'flex-start',
  },
  wideButton: { alignSelf: 'stretch' },
});
