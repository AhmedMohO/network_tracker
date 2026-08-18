import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
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
  // selected range, so it runs its own query — see useLimitStatus.
  const limitStatus = useLimitStatus();

  // The headline stays the device total, so the apps the list leaves out are
  // kept around for TotalsCard to disclose rather than silently dropped.
  const { visible: apps, hidden } = useMemo(
    () => partitionApps(data?.apps ?? [], settings?.showSystemApps ?? false),
    [data, settings?.showSystemApps]
  );

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
                {network === 'MOBILE' && limitStatus ? (
                  <LimitCard status={limitStatus.status} coverage={limitStatus.coverage} />
                ) : null}
                <TotalsCard totals={data.totals} coverage={data.coverage} hidden={hidden} />
                <UsageChartCard />
                {apps.length > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('dashboard.appsHeading')}
                  </ThemedText>
                ) : null}
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
