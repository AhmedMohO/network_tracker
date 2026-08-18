import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { TotalsCard } from '@/features/usage/TotalsCard';
import { UsageChartCard } from '@/features/usage/UsageChart';
import { openAppDataUsageSettings } from '@/features/usage/api';
import { formatBytes } from '@/features/usage/format';
import { useUsage } from '@/features/usage/useUsage';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';

const NETWORK_LABEL = { MOBILE: 'Mobile', WIFI: 'Wi-Fi', ALL: 'Mobile and Wi-Fi' } as const;

/** Two-part bar: how much of this app's traffic happened while it was on screen. */
function StateSplit({ foreground, background }: { foreground: number; background: number }) {
  const theme = useTheme();
  const sum = foreground + background;
  const share = sum === 0 ? 0 : (foreground / sum) * 100;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Foreground vs background
      </ThemedText>
      <View
        style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          sum === 0
            ? 'No foreground or background usage recorded.'
            : `${Math.round(share)} percent in the foreground, ${formatBytes(foreground)}; ` +
              `${100 - Math.round(share)} percent in the background, ${formatBytes(background)}.`
        }>
        <View style={[styles.fill, { width: `${share}%`, backgroundColor: theme.accent }]} />
      </View>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="textSecondary">
            While you were using it
          </ThemedText>
          <ThemedText type="default" style={styles.number}>
            {formatBytes(foreground)}
          </ThemedText>
        </View>
        <View style={styles.metric}>
          <ThemedText type="small" themeColor="textSecondary">
            In the background
          </ThemedText>
          <ThemedText type="default" style={styles.number}>
            {formatBytes(background)}
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

export default function AppUsageDetail() {
  const theme = useTheme();
  const { uid: uidParam } = useLocalSearchParams<{ uid: string }>();
  const uid = Number(uidParam);
  const { range, network } = useUsageContext();
  const { data, loading, error, reload } = useUsage(range, network);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // The same query the dashboard ran, so this total is the row's total by
  // construction rather than by a second, separately rounded calculation.
  const app = data?.apps.find((a) => a.uid === uid);
  const validUid = Number.isInteger(uid);

  const openSettings = () => {
    if (!app?.packageName) return;
    try {
      setSettingsError(null);
      openAppDataUsageSettings(app.packageName);
    } catch {
      setSettingsError('Android would not open the settings screen for this app.');
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: app?.name ?? 'App usage' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View>
          <ThemedText type="default" numberOfLines={2}>
            {app?.name ?? (validUid ? `UID ${uid}` : 'Unknown app')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {NETWORK_LABEL[network]} · {range.label}
            {app?.packageName ? ` · ${app.packageName}` : ''}
          </ThemedText>
        </View>

        {!validUid ? (
          <ThemedText type="small" themeColor="textSecondary">
            That link does not point at an app. Go back and pick one from the list.
          </ThemedText>
        ) : null}

        {validUid && loading && !data ? (
          <ActivityIndicator color={theme.accent} accessibilityLabel="Loading usage" />
        ) : null}

        {validUid && error ? (
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
                styles.button,
                { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
              ]}>
              <ThemedText type="default" themeColor="accentForeground">
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {validUid && data && !error && !app ? (
          <ThemedText type="small" themeColor="textSecondary">
            No usage recorded for this app in the selected range and network filter. Try a wider
            range, or switch the filter on the dashboard.
          </ThemedText>
        ) : null}

        {app ? (
          <>
            {/* No note: `data.note` is the coverage window unioned across every
                app, so it would not be a statement about this one. The chart
                below carries this app's own coverage. */}
            <TotalsCard
              title="Used by this app"
              totals={{ download: app.download, upload: app.upload, total: app.total }}
            />
            <StateSplit foreground={app.foreground} background={app.background} />
            <UsageChartCard uid={app.uid} />
            {app.packageName ? (
              <Pressable
                onPress={openSettings}
                accessibilityRole="button"
                accessibilityLabel={`Open Android settings for ${app.name}`}
                accessibilityHint="Shows this app's own data usage controls"
                style={({ pressed }) => [
                  styles.button,
                  styles.wideButton,
                  { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
                ]}>
                <ThemedText type="default" themeColor="accentForeground">
                  Open in Android settings
                </ThemedText>
              </Pressable>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                This UID has no installed package, so Android has no settings screen for it.
              </ThemedText>
            )}
            {settingsError ? (
              <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
                {settingsError}
              </ThemedText>
            ) : null}
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
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  block: { gap: Spacing.two },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.four },
  metric: { minWidth: 140 },
  number: { fontVariant: ['tabular-nums'] },
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
