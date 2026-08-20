import { Stack, useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowUp, BarChart3 } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Card } from '@/components/ui/card';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useChildSnapshots } from '@/features/family/useChildren';
import { useFamily } from '@/features/family/useFamily';
import { AppIcon } from '@/features/usage/AppIcon';
import { formatBytes } from '@/features/usage/format';
import { RangePicker } from '@/features/usage/RangePicker';
import { UsageChart } from '@/features/usage/UsageChart';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';

import type { SeriesBin } from '@modules/network-usage';

const DAY = 86_400_000;

/** Start of the local calendar day containing `ts`. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Detail screen for a single app on a child device. Shows the app's daily
 * download/upload across the selected range from the cached `daily` snapshots.
 *
 * Cannot show foreground/background split or per-hour bins — the synced
 * payload doesn't carry that — but the daily aggregate download/upload is
 * still useful for understanding per-app trends.
 */
export default function ChildAppDetailScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { uid: rawUid, deviceId: rawDeviceId } = useLocalSearchParams<{
    uid: string;
    deviceId: string;
  }>();
  const uid = Number(rawUid);
  const deviceId = rawDeviceId ?? '';
  const { role } = useFamily();
  const { range } = useUsageContext();
  const { snapshots } = useChildSnapshots(deviceId);

  // Discover app name from ALL snapshots regardless of range, so the title
  // never falls back to "UID …" just because the current range has no data.
  const appIdentity = useMemo(() => {
    let appName = '';
    let packageName: string | null = null;
    for (const row of snapshots) {
      if (row.kind !== 'daily' && row.kind !== 'recent') continue;
      const apps = row.payload?.apps as
        | { uid: number; name: string; pkg: string | null }[]
        | undefined;
      if (!Array.isArray(apps)) continue;
      const match = apps.find((a) => a.uid === uid);
      if (match) {
        if (!appName && match.name) appName = match.name;
        if (!packageName && match.pkg) packageName = match.pkg;
        if (appName && packageName) break;
      }
    }
    return { appName, packageName };
  }, [snapshots, uid]);

  const appData = useMemo(() => {
    let download = 0;
    let upload = 0;
    const bins: SeriesBin[] = [];

    // Snap range to calendar-day boundaries before comparing with row.day
    // (a midnight key). Without this, ranges that start mid-day (last24h,
    // custom) drop every row whose midnight falls before the window opens.
    // This mirrors buildDailySeries's own day-snapping logic.
    const dayStart = startOfDay(range.start);
    const dayEnd = range.end > range.start ? startOfDay(range.end - 1) + DAY : dayStart;

    // Find the best `daily` row per day, same logic as buildDailySeries.
    const byDay = new Map<number, any>();
    for (const row of snapshots) {
      if (row.kind !== 'daily') continue;
      if (row.day < dayStart || row.day >= dayEnd) continue;
      const existing = byDay.get(row.day);
      if (!existing || row.updatedAt > existing.updatedAt) {
        byDay.set(row.day, row);
      }
    }

    // Fold in the newest `recent` heartbeat for today's partial data — same
    // logic as buildDailySeries. Without this, any range that includes today
    // (today, last24h, last7d, …) shows 0B for the current day because
    // `syncFromChild` only pushes a `daily` row for *yesterday*, not today.
    const newestRecent = snapshots
      .filter((r) => r.kind === 'recent')
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (newestRecent) {
      const at =
        typeof newestRecent.payload?.at === 'number'
          ? newestRecent.payload.at
          : newestRecent.updatedAt;
      const recentDay = startOfDay(at);
      if (recentDay >= dayStart && recentDay < dayEnd && !byDay.has(recentDay)) {
        byDay.set(recentDay, newestRecent);
      }
    }

    const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);
    for (const day of sortedDays) {
      const row = byDay.get(day)!;
      const apps = row.payload?.apps as
        | { uid: number; name: string; pkg: string | null; dl: number; ul: number }[]
        | undefined;
      if (!Array.isArray(apps)) continue;

      const match = apps.find((a) => a.uid === uid);
      if (!match) continue;

      download += match.dl;
      upload += match.ul;
      bins.push({ start: day, end: day + DAY, rxBytes: match.dl, txBytes: match.ul });
    }

    const total = download + upload;
    return { appName: appIdentity.appName, packageName: appIdentity.packageName, download, upload, total, bins };
  }, [snapshots, range.start, range.end, uid, appIdentity]);

  if (role !== 'parent') {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: t('family.listTitle') }} />
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.pad}>
            {t('family.parentOnly')}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const title = appData.appName || `UID ${uid}`;

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title }} />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <RangePicker />

        <ScrollView
          style={styles.grow}
          contentContainerStyle={styles.content}>

          {/* App identity header */}
          <View style={styles.appHeader}>
            <AppIcon
              packageName={appData.packageName}
              name={appData.appName}
              size={48}
            />
            <View style={styles.appMeta}>
              <ThemedText type="default" style={styles.appName} numberOfLines={2}>
                {title}
              </ThemedText>
              {appData.packageName ? (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {appData.packageName}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {/* Totals card */}
          <Card style={styles.totalsCard}>
            <ThemedText
              type="title"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={styles.totalValue}>
              {formatBytes(appData.total)}
            </ThemedText>
            <View style={styles.metricsRow}>
              <View
                style={[
                  styles.metricChip,
                  { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                ]}>
                <View style={[styles.metricIconBox, { backgroundColor: theme.accentMuted }]}>
                  <ArrowDown size={14} color={theme.accent} strokeWidth={2.5} />
                </View>
                <View style={styles.metricTexts}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.metricLabel}>
                    {t('totals.download')}
                  </ThemedText>
                  <ThemedText type="default" style={styles.metricValue}>
                    {formatBytes(appData.download)}
                  </ThemedText>
                </View>
              </View>
              <View
                style={[
                  styles.metricChip,
                  { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                ]}>
                <View style={[styles.metricIconBox, { backgroundColor: theme.accentAltMuted }]}>
                  <ArrowUp size={14} color={theme.accentAlt} strokeWidth={2.5} />
                </View>
                <View style={styles.metricTexts}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.metricLabel}>
                    {t('totals.upload')}
                  </ThemedText>
                  <ThemedText type="default" style={styles.metricValue}>
                    {formatBytes(appData.upload)}
                  </ThemedText>
                </View>
              </View>
            </View>
          </Card>

          {/* Daily chart */}
          {appData.bins.length > 0 ? (
            <View style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <BarChart3 size={16} color={theme.accent} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('chart.title')}
                </ThemedText>
              </View>
              <UsageChart bins={appData.bins} />
            </View>
          ) : (
            <View
              style={[
                styles.emptyChart,
                { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
              ]}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('family.detailEmpty')}
              </ThemedText>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    gap: Spacing.two + 2,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  pad: { padding: Spacing.four },
  grow: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  appHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  appMeta: { flex: 1, gap: 2 },
  appName: { fontWeight: '700', fontSize: 18 },
  totalsCard: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  totalValue: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  metricChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.two + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two,
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricTexts: { flex: 1 },
  metricLabel: { fontSize: 12 },
  metricValue: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  chartCard: { gap: Spacing.three },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  emptyChart: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
});
