import NetworkUsage from '@modules/network-usage';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { rateBetween, type Counters, type Sample } from '@/features/live/rate';
import { useLiveApps } from '@/features/live/useLiveApps';
import { AppIcon } from '@/features/usage/AppIcon';
import { formatBytes, formatRate } from '@/features/usage/format';
import { useTheme } from '@/hooks/use-theme';

const INTERVAL_MS = 1000;
/** One minute of history on screen, at one sample a second. */
const WINDOW = 60;
/**
 * The window and cadence Phase 0 Q4 validated: shorter windows return nothing
 * useful, and a faster poll only re-reads the same system buckets.
 */
const APPS_WINDOW_MS = 10_000;
const APPS_INTERVAL_MS = 2000;

/**
 * Sixty one-second bars. Plain views rather than the usage chart: these bars
 * carry no timestamps to label and nothing worth tapping, and they are
 * replaced every second.
 */
function Sparkline({ history }: { history: Sample[] }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const peak = Math.max(...history.map((s) => s.down), 1);

  return (
    <View
      accessible
      accessibilityLabel={t('live.sparkA11y', { peak: formatRate(peak) })}
      style={[styles.spark, { borderColor: theme.border }]}>
      {history.map((s, i) => (
        <View
          // Samples are only ever appended and dropped from the front, so the
          // index is the only identity a bar has.
          key={i}
          style={[
            styles.bar,
            { height: `${(s.down / peak) * 100}%`, backgroundColor: theme.accent },
          ]}
        />
      ))}
    </View>
  );
}

export default function Live() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [sample, setSample] = useState<Sample | null>(null);
  const [history, setHistory] = useState<Sample[]>([]);
  const previous = useRef<{ counters: Counters; at: number } | null>(null);
  const apps = useLiveApps(APPS_WINDOW_MS, APPS_INTERVAL_MS);

  useFocusEffect(
    useCallback(() => {
      previous.current = null;
      const id = setInterval(() => {
        const counters = NetworkUsage.getDeviceCounters();
        const now = Date.now();
        const last = previous.current;
        previous.current = { counters, at: now };
        if (!last) return;

        const next = rateBetween(last.counters, counters, now - last.at);
        // A rejected pair leaves the last good reading on screen rather than
        // blanking it; the next tick recovers.
        if (!next) return;
        setSample(next);
        setHistory((h) => [...h, next].slice(-WINDOW));
      }, INTERVAL_MS);

      // Stops the moment the screen loses focus — no background polling, which
      // is the whole reason this needs no foreground service.
      return () => clearInterval(id);
    }, [])
  );

  const down = sample ? formatRate(sample.down) : '—';
  const up = sample ? formatRate(sample.up) : '—';

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.badge}>
          <View style={[styles.dot, { backgroundColor: theme.danger }]} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('live.badge')}
          </ThemedText>
        </View>

        <View
          accessible
          accessibilityLabel={t('live.a11y', { down, up })}
          accessibilityLiveRegion="polite"
          style={styles.rates}>
          <ThemedText type="title" style={styles.rate}>
            ↓ {down}
          </ThemedText>
          <ThemedText type="subtitle" themeColor="textSecondary" style={styles.rate}>
            ↑ {up}
          </ThemedText>
        </View>

        <Sparkline history={history} />

        <ThemedText type="small" themeColor="textSecondary">
          {t('live.note')}
        </ThemedText>

        <ThemedText type="smallBold">{t('live.appsHeading')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('live.appsNote')}
        </ThemedText>

        <ScrollView contentContainerStyle={styles.apps}>
          {apps.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('live.appsEmpty')}
            </ThemedText>
          ) : (
            apps.map((app) => (
              <View key={app.uid} style={styles.appRow}>
                <AppIcon packageName={app.packageName} name={app.name} size={28} />
                <ThemedText type="default" numberOfLines={1} style={styles.appName}>
                  {app.name}
                </ThemedText>
                {/* formatBytes, never formatRate: this is a total over the
                    window, and calling it MB/s would be a lie. */}
                <ThemedText type="smallBold" style={styles.appBytes}>
                  {formatBytes(app.total)}
                </ThemedText>
              </View>
            ))
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
    gap: Spacing.three,
    padding: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingBottom: BottomTabInset,
  },
  badge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rates: { gap: Spacing.one },
  rate: { fontVariant: ['tabular-nums'] },
  spark: {
    height: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    borderBottomWidth: 1,
  },
  bar: { flex: 1, minHeight: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  apps: { gap: Spacing.two, paddingBottom: Spacing.three },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 40 },
  appName: { flex: 1 },
  appBytes: { fontVariant: ['tabular-nums'] },
});
