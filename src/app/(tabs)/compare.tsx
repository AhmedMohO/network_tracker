import {
  AlertCircle,
  ArrowLeftRight,
  Calendar,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { compareUsage, partitionApps, type AppUsage } from '@/features/usage/aggregate';
import { DeltaRow } from '@/features/usage/DeltaRow';
import { formatBytes } from '@/features/usage/format';
import { NetworkFilterTabs } from '@/features/usage/NetworkFilterTabs';
import { previousRange } from '@/features/usage/range';
import { RangePicker } from '@/features/usage/RangePicker';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

export default function Compare() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { range, network, settings } = useUsageContext();

  const previous = useMemo(
    () => previousRange(range, settings?.cycleStartDay ?? 1, range.end),
    [range, settings?.cycleStartDay]
  );

  const now = useUsage(range, network);
  const before = useUsage(previous, network);
  const error = now.error ?? before.error;

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
  const isUp = (overall ?? 0) > 0;
  const isDown = (overall ?? 0) < 0;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.controls}>
          <NetworkFilterTabs />
        </View>
        <RangePicker />

        {(now.loading || before.loading) && !deltas && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} accessibilityLabel={t('compare.loading')} />
          </View>
        )}

        {error && (
          <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <AlertCircle size={24} color={theme.destructive} />
            <ThemedText type="default" style={{ fontWeight: '700' }}>
              {t('compare.errorTitle')}
            </ThemedText>
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
                <Card style={styles.summaryCard}>
                  <View style={styles.summaryTop}>
                    <View style={styles.summaryTitleGroup}>
                      <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                        <ArrowLeftRight size={16} color={theme.accent} />
                      </View>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {t('tabs.compare')}
                      </ThemedText>
                    </View>

                    {overall !== null ? (
                      <Badge
                        variant={isUp ? 'destructive' : isDown ? 'success' : 'secondary'}
                        icon={
                          isUp ? (
                            <TrendingUp size={12} color={theme.destructive} />
                          ) : isDown ? (
                            <TrendingDown size={12} color={theme.success} />
                          ) : undefined
                        }
                        label={`${isUp ? '+' : ''}${Math.round(overall)}%`}
                      />
                    ) : null}
                  </View>

                  <ThemedText
                    type="title"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={styles.currentTotalText}>
                    {formatBytes(currentTotal)}
                  </ThemedText>

                  <ThemedText type="small" themeColor="textSecondary">
                    {t('compare.was', { bytes: formatBytes(previousTotal) })}
                  </ThemedText>

                  <View style={[styles.periodComparisonBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                    <Calendar size={13} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                      {t('compare.versus', {
                        from: formatDateTime(previous.start),
                        to: formatDateTime(previous.end),
                      })}
                    </ThemedText>
                  </View>
                </Card>

                {deltas.length > 0 ? (
                  <View style={styles.headingGroup}>
                    <TrendingUp size={16} color={theme.accent} />
                    <ThemedText type="smallBold" themeColor="textSecondary">
                      {t('compare.moversHeading')}
                    </ThemedText>
                    <Badge variant="secondary" label={String(deltas.length)} />
                  </View>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <Sparkles size={36} color={theme.textSecondary} style={{ opacity: 0.6 }} />
                <ThemedText type="default" style={{ fontWeight: '600' }}>
                  {t('compare.empty')}
                </ThemedText>
              </View>
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
    gap: Spacing.two + 2,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  controls: { paddingHorizontal: Spacing.three },
  grow: { flex: 1 },
  header: { gap: Spacing.three },
  summaryCard: {
    padding: Spacing.four,
    gap: Spacing.two,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  summaryTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentTotalText: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  periodComparisonBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    marginTop: Spacing.one,
  },
  headingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
  loadingBox: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: {
    marginHorizontal: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.two,
    alignItems: 'center',
  },
  empty: {
    padding: Spacing.five,
    marginVertical: Spacing.two,
    borderRadius: Radius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
});
