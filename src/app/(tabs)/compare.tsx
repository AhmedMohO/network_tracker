import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { compareUsage, partitionApps, type AppUsage } from '@/features/usage/aggregate';
import { DeltaRow } from '@/features/usage/DeltaRow';
import { formatBytes } from '@/features/usage/format';
import { NetworkFilterTabs } from '@/features/usage/NetworkFilterTabs';
import { previousRange } from '@/features/usage/range';
import { RangePicker } from '@/features/usage/RangePicker';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { formatDateTime } from '@/i18n/format';

export default function Compare() {
  const { t } = useTranslation();
  const { range, network, settings } = useUsageContext();

  // `range.end` rather than the wall clock: for the cycle presets it already
  // is "now", and pinning to the range keeps this pure across re-renders.
  const previous = useMemo(
    () => previousRange(range, settings?.cycleStartDay ?? 1, range.end),
    [range, settings?.cycleStartDay]
  );

  const now = useUsage(range, network);
  const before = useUsage(previous, network);
  const error = now.error ?? before.error;

  // The list compares the same apps the dashboard lists; the headline stays the
  // device total, so hidden system traffic is still counted in the percentage.
  const deltas = useMemo(() => {
    if (!now.data || !before.data) return null;
    const listed = (apps: AppUsage[]) =>
      partitionApps(apps, settings?.showSystemApps ?? false).visible;
    return compareUsage(listed(now.data.apps), listed(before.data.apps));
  }, [now.data, before.data, settings?.showSystemApps]);

  const packageOf = useMemo(
    () => new Map((now.data?.apps ?? []).map((a) => [a.uid, a.packageName])),
    [now.data]
  );

  const currentTotal = now.data?.totals.total ?? 0;
  const previousTotal = before.data?.totals.total ?? 0;
  const overall = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.controls}>
          <NetworkFilterTabs />
        </View>
        <RangePicker />

        {(now.loading || before.loading) && (
          <ActivityIndicator accessibilityLabel={t('compare.loading')} />
        )}

        {error && (
          <View style={styles.block}>
            <ThemedText type="default">{t('compare.errorTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          </View>
        )}

        {deltas && !error && (
          <FlatList
            data={deltas}
            keyExtractor={(d) => String(d.uid)}
            style={styles.grow}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                <ThemedText type="title">{formatBytes(currentTotal)}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('compare.was', { bytes: formatBytes(previousTotal) })}
                  {overall === null
                    ? ''
                    : `  ·  ${overall > 0 ? '+' : ''}${Math.round(overall)}%`}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('compare.versus', {
                    from: formatDateTime(previous.start),
                    to: formatDateTime(previous.end),
                  })}
                </ThemedText>
                {deltas.length > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.heading}>
                    {t('compare.moversHeading')}
                  </ThemedText>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <ThemedText type="default" themeColor="textSecondary" style={styles.empty}>
                {t('compare.empty')}
              </ThemedText>
            }
            renderItem={({ item }) => (
              <DeltaRow delta={item} packageName={packageOf.get(item.uid) ?? null} />
            )}
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
    paddingTop: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  controls: { paddingHorizontal: Spacing.three },
  grow: { flex: 1 },
  header: { gap: Spacing.one },
  heading: { paddingTop: Spacing.three },
  block: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.four, gap: Spacing.two },
  empty: { paddingVertical: Spacing.four },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },
});
