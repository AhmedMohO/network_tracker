import NetworkUsage from '@modules/network-usage';
import { useFocusEffect } from 'expo-router';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Info,
  Layers,
  Radio,
  TrendingUp,
} from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { rateBetween, type Counters, type Sample } from '@/features/live/rate';
import { useLiveApps } from '@/features/live/useLiveApps';
import { AppIcon } from '@/features/usage/AppIcon';
import { formatBytes, formatRate } from '@/features/usage/format';
import { useTheme } from '@/hooks/use-theme';

const INTERVAL_MS = 1000;
/** One minute of history on screen, at one sample a second. */
const WINDOW = 60;
const APPS_WINDOW_MS = 10_000;
const APPS_INTERVAL_MS = 2000;

function Sparkline({ history }: { history: Sample[] }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const peak = Math.max(...history.map((s) => s.down), 1);

  return (
    <View style={styles.sparkContainer}>
      <View style={styles.sparkHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('live.sparkHeading')}
        </ThemedText>
        <Badge
          variant="secondary"
          icon={<TrendingUp size={11} color={theme.accent} />}
          label={t('live.peak', { rate: formatRate(peak) })}
        />
      </View>
      <View
        accessible
        accessibilityLabel={t('live.sparkA11y', { peak: formatRate(peak) })}
        style={[styles.spark, { borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
        {history.map((s, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              {
                height: `${(s.down / peak) * 100}%`,
                backgroundColor: theme.accent,
              },
            ]}
          />
        ))}
      </View>
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
        if (!next) return;
        setSample(next);
        setHistory((h) => [...h, next].slice(-WINDOW));
      }, INTERVAL_MS);

      return () => clearInterval(id);
    }, [])
  );

  const down = sample ? formatRate(sample.down) : '—';
  const up = sample ? formatRate(sample.up) : '—';

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Hero Live Speedometer Card */}
          <Card style={styles.heroCard}>
            <View style={styles.heroTop}>
              <View style={styles.heroTitleGroup}>
                <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
                  <Radio size={16} color={theme.accent} />
                </View>
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('tabs.live')}
                </ThemedText>
              </View>

              <Badge
                variant="success"
                icon={<View style={[styles.liveDot, { backgroundColor: theme.success }]} />}
                label={t('live.badge')}
              />
            </View>

            <View
              accessible
              accessibilityLabel={t('live.a11y', { down, up })}
              accessibilityLiveRegion="polite"
              style={styles.speedGrid}>
              <View
                style={[
                  styles.speedTile,
                  { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                ]}>
                <View style={[styles.speedIconBox, { backgroundColor: theme.accentMuted }]}>
                  <ArrowDown size={18} color={theme.accent} strokeWidth={2.5} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('totals.download')}
                </ThemedText>
                <ThemedText type="title" style={styles.speedText}>
                  {down}
                </ThemedText>
              </View>

              <View
                style={[
                  styles.speedTile,
                  { backgroundColor: theme.backgroundSelected, borderColor: theme.border },
                ]}>
                <View style={[styles.speedIconBox, { backgroundColor: theme.accentAltMuted }]}>
                  <ArrowUp size={18} color={theme.accentAlt} strokeWidth={2.5} />
                </View>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('totals.upload')}
                </ThemedText>
                <ThemedText type="title" style={styles.speedText}>
                  {up}
                </ThemedText>
              </View>
            </View>

            <Sparkline history={history} />

            <View style={[styles.noteBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
              <Info size={14} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" style={styles.noteText}>
                {t('live.note')}
              </ThemedText>
            </View>
          </Card>

          {/* Active Live Apps Section */}
          <View style={styles.appsSection}>
            <View style={styles.sectionHeader}>
              <View style={styles.sectionTitleGroup}>
                <Layers size={16} color={theme.accent} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t('live.appsHeading')}
                </ThemedText>
              </View>
              <Badge variant="secondary" label={String(apps.length)} />
            </View>

            <ThemedText type="small" themeColor="textSecondary" style={styles.appsNote}>
              {t('live.appsNote')}
            </ThemedText>

            {apps.length === 0 ? (
              <Card style={styles.appsEmptyCard}>
                <Activity size={28} color={theme.textSecondary} style={{ opacity: 0.5 }} />
                <ThemedText type="small" themeColor="textSecondary">
                  {t('live.appsEmpty')}
                </ThemedText>
              </Card>
            ) : (
              apps.map((app) => (
                <View
                  key={app.uid}
                  style={[
                    styles.appRow,
                    { backgroundColor: theme.card, borderColor: theme.border },
                  ]}>
                  <AppIcon packageName={app.packageName} name={app.name} size={36} />
                  <ThemedText type="default" numberOfLines={1} style={styles.appName}>
                    {app.name}
                  </ThemedText>
                  <ThemedText type="smallBold" themeColor="accent" style={styles.appBytes}>
                    {formatBytes(app.total)}
                  </ThemedText>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
  },
  heroCard: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  speedGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  speedTile: {
    flex: 1,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.one,
  },
  speedIconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.half,
  },
  speedText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sparkContainer: {
    gap: Spacing.one + 2,
  },
  sparkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  spark: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: 2,
    overflow: 'hidden',
  },
  bar: {
    flex: 1,
    // A non-zero second keeps a visible sliver; a zero second stays flat.
    minHeight: 1,
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  noteText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  appsSection: {
    gap: Spacing.two,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  appsNote: {
    fontSize: 12,
  },
  appsEmptyCard: {
    padding: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Radius.xl,
    borderWidth: 1,
    minHeight: 52,
  },
  appName: { flex: 1, fontWeight: '600', fontSize: 14 },
  appBytes: { fontVariant: ['tabular-nums'] },
});
