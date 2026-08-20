import type { SeriesBin } from '@modules/network-usage';
import { AlertCircle, BarChart3, Clock, Sparkles, TrendingUp } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radius, Spacing, TextEnd } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, formatDay, formatSpan, formatTime } from '@/i18n/format';

import { chooseBucketMs } from './bucket';
import { formatBytes } from './format';
import { coverageDrift } from './range';
import { useSeries } from './useSeries';
import { useUsageContext } from './useUsageContext';

/**
 * The viewBox is a fixed unit box stretched over the container, so all bar
 * geometry below is a fraction of the plot area rather than a pixel count.
 */
const VIEW = 100;
/** Fraction of each slot left empty, so neighbouring bars stay distinct. */
const BAR_GAP = 0.2;
/** A non-zero bucket keeps a visible sliver instead of disappearing. */
const MIN_BAR = 1.5;
/** Bars that are not the selected one, once a selection exists. */
const DIMMED = 0.35;
const DAY = 86_400_000;

const total = (b: SeriesBin) => b.rxBytes + b.txBytes;

/** A bin's own window: the date is only worth repeating on multi-day ranges. */
function binLabel(bin: SeriesBin): string {
  return bin.end - bin.start >= DAY
    ? formatDay(bin.start)
    : `${formatDateTime(bin.start)} – ${formatTime(bin.end)}`;
}

export function UsageChart({ bins, height = 140 }: { bins: SeriesBin[]; height?: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  // A tapped bar belongs to the series it was tapped in, so the selection
  // carries its own `bins`: a new one (range or filter change) drops it rather
  // than leaving an index pointing into unrelated data.
  const [picked, setPicked] = useState<{ bins: SeriesBin[]; index: number } | null>(null);
  const [width, setWidth] = useState(0);
  const selected = picked !== null && picked.bins === bins ? picked.index : null;

  const values = bins.map(total);
  const sum = values.reduce((acc, v) => acc + v, 0);

  // Reachable in normal use: Android returns no detail buckets for a quiet
  // window, and an empty or flat-zero chart must read as an answer, not a gap.
  if (sum <= 0) {
    return (
      <View style={[styles.blank, { height, borderColor: theme.border, backgroundColor: theme.backgroundSelected }]}>
        <BarChart3 size={24} color={theme.textSecondary} style={{ opacity: 0.5 }} />
        <ThemedText type="small" themeColor="textSecondary">
          {t('chart.empty')}
        </ThemedText>
      </View>
    );
  }

  const peak = Math.max(...values);
  const peakIndex = values.indexOf(peak);
  const scale = Math.max(peak, 1);
  const slot = VIEW / Math.max(bins.length, 1);
  const span = formatSpan(bins[0].end - bins[0].start);
  const label = t('chart.a11y', {
    count: bins.length,
    span,
    total: formatBytes(sum),
    peak: formatBytes(peak),
    peakAt: formatDateTime(bins[peakIndex].start),
  });

  const pick = (x: number) => {
    if (width <= 0) return;
    const index = Math.min(bins.length - 1, Math.max(0, Math.floor((x / width) * bins.length)));
    // Tapping the selected bar again clears it, so the hint can come back.
    setPicked(selected === index ? null : { bins, index });
  };

  return (
    <View style={styles.chart}>
      {/* Fixed slot: the readout replacing the hint must not shift the bars. */}
      <View style={[styles.readout, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
        {selected === null ? (
          <View style={styles.hintRow}>
            <Sparkles size={12} color={theme.accent} style={styles.hintIcon} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.hintText}>
              {t('chart.tapHint')}
            </ThemedText>
          </View>
        ) : (
          <View style={styles.activeReadoutRow}>
            <View style={styles.activeReadoutTime}>
              <Clock size={12} color={theme.accent} style={styles.hintIcon} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={{ flex: 1 }}>
                {binLabel(bins[selected])}
              </ThemedText>
            </View>
            <ThemedText type="smallBold" themeColor="accent" style={styles.readoutValue}>
              {formatBytes(values[selected])}
            </ThemedText>
          </View>
        )}
      </View>

      <Pressable
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => pick(e.nativeEvent.locationX)}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        style={{ height }}>
        <Svg
          width="100%"
          height={height}
          viewBox={`0 0 ${VIEW} ${VIEW}`}
          preserveAspectRatio="none">
          {bins.map((b, i) => {
            const value = values[i];
            if (value <= 0) return null;
            const barHeight = Math.max((value / scale) * VIEW, MIN_BAR);
            const isSelected = selected === i;
            const isDimmed = selected !== null && !isSelected;

            return (
              <Rect
                key={b.start}
                x={i * slot}
                y={VIEW - barHeight}
                width={slot * (1 - BAR_GAP)}
                height={barHeight}
                rx={1.5}
                fill={isSelected ? theme.accent : theme.primary}
                opacity={isDimmed ? DIMMED : 1}
              />
            );
          })}
        </Svg>
      </Pressable>

      {/* The axis: without it a bar is a shape with no moment attached. */}
      <View style={[styles.axis, { borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.axisText}>
          {formatDay(bins[0].start)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.axisText}>
          {formatDay(bins[bins.length - 1].end)}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * The chart plus the two things that keep it honest: the width one bar covers,
 * and the range Android actually returned when it differs from the request.
 */
export function UsageChartCard({ uid }: { uid?: number }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { range, network } = useUsageContext();
  const bucketMs = chooseBucketMs(range.end - range.start);
  const { data, loading, error, reload } = useSeries(range, network, bucketMs, uid);
  const bins = data?.bins ?? [];
  const peak = bins.length > 0 ? Math.max(...bins.map(total)) : 0;
  const drift = data ? coverageDrift(range, data.coveredStart, data.coveredEnd) : null;

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleGroup}>
          <View style={[styles.headerIconBox, { backgroundColor: theme.accentMuted }]}>
            <BarChart3 size={16} color={theme.accent} />
          </View>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {t('chart.title')}
          </ThemedText>
        </View>

        {peak > 0 ? (
          <Badge
            variant="accent"
            icon={<TrendingUp size={11} color={theme.accent} />}
            label={t('chart.peak', { bytes: formatBytes(peak) })}
          />
        ) : null}
      </View>

      {loading && !data ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={theme.accent} accessibilityLabel={t('chart.loading')} />
        </View>
      ) : null}

      {error ? (
        <View style={[styles.errorBlock, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
          <AlertCircle size={20} color={theme.destructive} />
          <View style={{ flex: 1, gap: 2 }}>
            <ThemedText type="smallBold" themeColor="destructive">
              {t('chart.errorTitle')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {error}
            </ThemedText>
          </View>
          <Button
            size="sm"
            variant="outline"
            title={t('common.retry')}
            onPress={reload}
            accessibilityLabel={t('chart.retryA11y')}
          />
        </View>
      ) : null}

      {data && !error ? (
        <>
          <UsageChart bins={data.bins} />
          <View style={styles.footerInfo}>
            {peak > 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
                {t('chart.barSpan', { span: formatSpan(bucketMs) })}
              </ThemedText>
            ) : null}
            {drift ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.infoText}>
                {t('chart.coverage', {
                  from: formatDateTime(drift.start),
                  to: formatDateTime(drift.end),
                })}
              </ThemedText>
            ) : null}
          </View>
        </>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  headerIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: { gap: Spacing.two },
  readout: {
    minHeight: 28,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.half + 2,
    justifyContent: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    flex: 1,
  },
  hintIcon: {
    flexShrink: 0,
  },
  hintText: {
    flex: 1,
    lineHeight: 16,
  },
  activeReadoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flex: 1,
  },
  activeReadoutTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    flex: 1,
    minWidth: 0,
  },
  readoutValue: {
    fontVariant: ['tabular-nums'],
    textAlign: TextEnd,
    flexShrink: 0,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.one,
  },
  axisText: {
    fontSize: 11,
  },
  blank: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  loadingBox: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  footerInfo: {
    gap: Spacing.one,
  },
  infoText: {
    fontSize: 12,
  },
});
