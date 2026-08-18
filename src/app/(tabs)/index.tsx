import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { toCsv, toJson } from '@/features/export/csv';
import { shareExport } from '@/features/export/share';
import { LimitCard } from '@/features/limits/LimitCard';
import { useLimitStatus } from '@/features/limits/useLimitStatus';
import { partitionApps } from '@/features/usage/aggregate';
import { AppRow } from '@/features/usage/AppRow';
import { NetworkFilterTabs } from '@/features/usage/NetworkFilterTabs';
import { RangePicker } from '@/features/usage/RangePicker';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChartCard } from '@/features/usage/UsageChart';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';

export default function Dashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const { range, network, settings } = useUsageContext();
  const { data, loading, error, reload } = useUsage(range, network);
  // The limit is always about the billing cycle, not the dashboard's own
  // selected range, so it runs its own query — see useLimitStatus. Only the
  // filtered network's limit is fetched; 'ALL' has no limit of its own and
  // borrows mobile's query, which the card below then declines to show.
  const limitStatus = useLimitStatus(network === 'WIFI' ? 'WIFI' : 'MOBILE');

  // The headline stays the device total, so the apps the list leaves out are
  // kept around for TotalsCard to disclose rather than silently dropped.
  const { visible: apps, hidden } = useMemo(
    () => partitionApps(data?.apps ?? [], settings?.showSystemApps ?? false),
    [data, settings?.showSystemApps]
  );

  // Every row, not just the visible ones: a CSV is a data dump, and it carries
  // a uid column the spreadsheet can filter on. Hiding system apps is a
  // display preference, not a reason to withhold the numbers.
  const exportUsage = () => {
    if (!data) return;
    const stamp = new Date(range.start).toISOString().slice(0, 10);
    const name = `usage-${network.toLowerCase()}-${stamp}`;
    const send = (content: string, extension: string, mimeType: string) =>
      shareExport(content, `${name}.${extension}`, mimeType).catch(() =>
        toast(t('export.failed'))
      );

    Alert.alert(t('export.title'), t('export.body'), [
      { text: 'CSV', onPress: () => send(toCsv(data.apps, range, network), 'csv', 'text/csv') },
      {
        text: 'JSON',
        onPress: () => send(toJson(data.apps, range, network), 'json', 'application/json'),
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.controls}>
          <NetworkFilterTabs />
        </View>
        <RangePicker />

        {loading && (
          <ActivityIndicator color={theme.accent} accessibilityLabel={t('dashboard.loading')} />
        )}

        {error && (
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
                styles.retry,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="default" themeColor="accentForeground">
                {t('common.retry')}
              </ThemedText>
            </Pressable>
          </View>
        )}

        {data && !error && (
          <FlatList
            data={apps}
            keyExtractor={(a) => String(a.uid)}
            style={styles.grow}
            contentContainerStyle={styles.list}
            ListHeaderComponent={
              <View style={styles.header}>
                {network !== 'ALL' && limitStatus ? (
                  <LimitCard status={limitStatus.status} coverage={limitStatus.coverage} />
                ) : null}
                <TotalsCard totals={data.totals} coverage={data.coverage} hidden={hidden} />
                <UsageChartCard />
                <View style={styles.headingRow}>
                  {apps.length > 0 ? (
                    <ThemedText type="small" themeColor="textSecondary" style={styles.heading}>
                      {t('dashboard.appsHeading')}
                    </ThemedText>
                  ) : null}
                  <Pressable
                    onPress={exportUsage}
                    accessibilityRole="button"
                    accessibilityLabel={t('export.action')}
                    accessibilityHint={t('export.hint')}
                    style={({ pressed }) => [
                      styles.export,
                      { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                    ]}>
                    <ThemedText type="small">{t('export.action')}</ThemedText>
                  </Pressable>
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <ThemedText type="default" themeColor="textSecondary">
                  {t('dashboard.empty')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('dashboard.emptyHint')}
                </ThemedText>
              </View>
            }
            renderItem={({ item }) => (
              <AppRow app={item} onPress={() => router.push(`/usage/${item.uid}`)} />
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
  // The range picker scrolls edge to edge and carries its own inset, so the
  // horizontal padding lives on the sections rather than on the screen.
  controls: { paddingHorizontal: Spacing.three },
  grow: { flex: 1 },
  header: { gap: Spacing.two },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  heading: { flex: 1 },
  export: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
    marginStart: 'auto',
  },
  block: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.four, gap: Spacing.two },
  // Inside the list, the content container already supplies the horizontal inset.
  empty: { paddingVertical: Spacing.four, gap: Spacing.two },
  retry: {
    minHeight: 48,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },
});
