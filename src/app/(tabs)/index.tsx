import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { AppRow } from '@/features/usage/AppRow';
import { NetworkFilterTabs } from '@/features/usage/NetworkFilterTabs';
import { RangePicker } from '@/features/usage/RangePicker';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChartCard } from '@/features/usage/UsageChart';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';

// Android assigns app UIDs from 10000 up; anything below is platform-owned.
const FIRST_APP_UID = 10000;

export default function Dashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { range, network, settings } = useUsageContext();
  const { data, loading, error, reload } = useUsage(range, network);

  const apps = useMemo(() => {
    if (!data) return [];
    return settings?.showSystemApps ? data.apps : data.apps.filter((a) => a.uid >= FIRST_APP_UID);
  }, [data, settings?.showSystemApps]);

  const hiddenCount = data ? data.apps.length - apps.length : 0;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.controls}>
          <NetworkFilterTabs />
        </View>
        <RangePicker />

        {loading && (
          <ActivityIndicator color={theme.accent} accessibilityLabel="Loading usage" />
        )}

        {error && (
          <View style={styles.block}>
            <ThemedText type="default">Could not read usage.</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
            <Pressable
              onPress={reload}
              accessibilityRole="button"
              accessibilityLabel="Retry"
              style={({ pressed }) => [
                styles.retry,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="default" themeColor="accentForeground">
                Retry
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
                <TotalsCard totals={data.totals} note={data.note} />
                <UsageChartCard />
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <ThemedText type="default" themeColor="textSecondary">
                  No usage recorded in this range.
                </ThemedText>
                {hiddenCount > 0 ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {hiddenCount} system {hiddenCount === 1 ? 'app is' : 'apps are'} hidden. Turn on
                    &ldquo;Show system apps&rdquo; in settings to include {
                      hiddenCount === 1 ? 'it' : 'them'
                    }.
                  </ThemedText>
                ) : null}
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
