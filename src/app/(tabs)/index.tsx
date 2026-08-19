import { useRouter } from 'expo-router';
import {
  AlertCircle,
  HardDriveDownload,
  Layers,
  RefreshCw,
  Share2,
} from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
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
  const limitStatus = useLimitStatus(network === 'WIFI' ? 'WIFI' : 'MOBILE');

  const { visible: apps, hidden } = useMemo(
    () => partitionApps(data?.apps ?? [], settings?.showSystemApps ?? false),
    [data, settings?.showSystemApps]
  );

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
        <View style={styles.topBar}>
          <NetworkFilterTabs />
          <Button
            size="sm"
            variant="outline"
            icon={<Share2 size={14} color={theme.text} />}
            title={t('export.action')}
            onPress={exportUsage}
            disabled={!data}
            accessibilityLabel={t('export.action')}
            accessibilityHint={t('export.hint')}
          />
        </View>

        <RangePicker />

        {loading && !data && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} accessibilityLabel={t('dashboard.loading')} />
          </View>
        )}

        {error && (
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
                    <View style={styles.headingGroup}>
                      <Layers size={16} color={theme.accent} />
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        {t('dashboard.appsHeading')}
                      </ThemedText>
                      <Badge variant="secondary" label={String(apps.length)} />
                    </View>
                  ) : null}
                </View>
              </View>
            }
            ListEmptyComponent={
              <View style={[styles.empty, { backgroundColor: theme.card, borderColor: theme.border }]}>
                <HardDriveDownload size={36} color={theme.textSecondary} style={{ opacity: 0.6 }} />
                <ThemedText type="default" style={{ fontWeight: '600' }}>
                  {t('dashboard.empty')}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
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
    gap: Spacing.two + 2,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
  },
  grow: { flex: 1 },
  header: { gap: Spacing.three },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.one,
  },
  headingGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
