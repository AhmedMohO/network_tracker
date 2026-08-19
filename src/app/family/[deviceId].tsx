import { Stack, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, BarChart3 } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { buildDailySeries } from '@/features/family/dailySeries';
import { useChildSnapshots } from '@/features/family/useChildren';
import { summarizeChildren, useFamily } from '@/features/family/useFamily';
import { AppRow } from '@/features/usage/AppRow';
import { RangePicker } from '@/features/usage/RangePicker';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChart } from '@/features/usage/UsageChart';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

export default function ChildUsageScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { deviceId } = useLocalSearchParams<{ deviceId: string }>();
  const { role } = useFamily();
  const { range } = useUsageContext();
  const { snapshots } = useChildSnapshots(deviceId ?? '');

  // Reuses `summarizeChildren` (already tested in `useFamily.test.ts`) rather
  // than re-deriving "label from the newest row" here.
  const summary = useMemo(
    () => summarizeChildren(snapshots).find((c) => c.deviceId === deviceId) ?? null,
    [snapshots, deviceId]
  );

  const series = useMemo(
    () => buildDailySeries(snapshots, range.start, range.end, t('family.otherApps')),
    [snapshots, range.start, range.end, t]
  );

  const label = summary?.label ?? deviceId ?? '';
  const lastSeenLine =
    summary && summary.lastSeen > 0
      ? t('family.lastSeen', { when: formatDateTime(summary.lastSeen) })
      : t('family.neverCheckedIn');

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

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: label }} />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Always visible, never below the fold. */}
        <ThemedText type="small" themeColor="textSecondary" style={styles.lastSeen}>
          {lastSeenLine}
        </ThemedText>

        <RangePicker />

        <FlatList
          data={series.apps}
          keyExtractor={(a) => String(a.uid)}
          style={styles.grow}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <TotalsCard totals={series.totals} />

              {series.bins.length > 0 ? (
                <View style={styles.chartCard}>
                  <View style={styles.chartHeader}>
                    <BarChart3 size={16} color={theme.accent} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {t('chart.title')}
                    </ThemedText>
                  </View>
                  <UsageChart bins={series.bins} />
                </View>
              ) : (
                <View
                  style={[
                    styles.chartEmpty,
                    { borderColor: theme.border, backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('family.detailEmpty')}
                  </ThemedText>
                </View>
              )}

              {/* A day with no `daily` row is a gap, not a zero-usage day —
                  the child may simply have been offline. */}
              {series.missingDays > 0 ? (
                <View style={styles.missingRow}>
                  <AlertTriangle size={13} color={theme.textSecondary} />
                  <ThemedText type="small" themeColor="textSecondary" style={styles.missingText}>
                    {t('family.missingDays', { count: series.missingDays })}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            // No per-app drill-down for a child's remote payload (Task 29
            // scope is the list itself, not a `usage/[uid]`-style detail for
            // it), so this only ever renders the row.
            <AppRow app={item} onPress={() => {}} />
          )}
        />
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
  lastSeen: { paddingHorizontal: Spacing.three },
  grow: { flex: 1 },
  header: { gap: Spacing.three, paddingBottom: Spacing.two },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  chartCard: { gap: Spacing.three },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  chartEmpty: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingHorizontal: 2,
  },
  missingText: { flex: 1 },
});
