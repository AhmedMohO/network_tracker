import type { SeriesBin } from '@modules/network-usage';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TextEnd } from '@/constants/theme';
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
const DIMMED = 0.4;
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
  const [selected, setSelected] = useState<number | null>(null);
  const [width, setWidth] = useState(0);

  // A new query means new bins; keeping the old index would point at a
  // different moment in time under the same caption.
  useEffect(() => setSelected(null), [bins]);

  const values = bins.map(total);
  const sum = values.reduce((acc, v) => acc + v, 0);

  // Reachable in normal use: Android returns no detail buckets for a quiet
  // window, and an empty or flat-zero chart must read as an answer, not a gap.
  if (sum <= 0) {
    return (
      <View style={[styles.blank, { height, borderColor: theme.border }]}>
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
    setSelected((current) => (current === index ? null : index));
  };

  return (
    <View style={styles.chart}>
      {/* Fixed slot: the readout replacing the hint must not shift the bars. */}
      <View style={styles.readout}>
        {selected === null ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {t('chart.tapHint')}
          </ThemedText>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {binLabel(bins[selected])}
            </ThemedText>
            <ThemedText type="smallBold" themeColor="accent" style={styles.readoutValue}>
              {formatBytes(values[selected])}
            </ThemedText>
          </>
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
          // Bars are axis-aligned rectangles, so stretching the box to the
          // container distorts nothing; without this the chart would letterbox.
          preserveAspectRatio="none">
          {bins.map((b, i) => {
            const value = values[i];
            if (value <= 0) return null;
            const barHeight = Math.max((value / scale) * VIEW, MIN_BAR);
            return (
              <Rect
                key={b.start}
                x={i * slot}
                y={VIEW - barHeight}
                width={slot * (1 - BAR_GAP)}
                height={barHeight}
                fill={theme.accent}
                opacity={selected === null || selected === i ? 1 : DIMMED}
              />
            );
          })}
        </Svg>
      </Pressable>

      {/* The axis: without it a bar is a shape with no moment attached. */}
      <View style={[styles.axis, { borderTopColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDay(bins[0].start)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatDay(bins[bins.length - 1].end)}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * The chart plus the two things that keep it honest: the width one bar covers,
 * and the range Android actually returned when it differs from the request.
 * Pass a `uid` for one app, omit it for the device total.
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
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('chart.title')}
        </ThemedText>
        {peak > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            {t('chart.peak', { bytes: formatBytes(peak) })}
          </ThemedText>
        ) : null}
      </View>

      {loading && !data ? (
        <ActivityIndicator color={theme.accent} accessibilityLabel={t('chart.loading')} />
      ) : null}

      {error ? (
        <View style={styles.errorBlock}>
          <ThemedText type="small">{t('chart.errorTitle')}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
          <Pressable
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel={t('chart.retryA11y')}
            style={({ pressed }) => [
              styles.retry,
              { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="smallBold" themeColor="accent">
              {t('common.retry')}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {data && !error ? (
        <>
          <UsageChart bins={data.bins} />
          {peak > 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('chart.barSpan', { span: formatSpan(bucketMs) })}
            </ThemedText>
          ) : null}
          {/* Coverage information, not a failure — plain secondary body text. */}
          {drift ? (
            <ThemedText type="small" themeColor="textSecondary">
              {t('chart.coverage', {
                from: formatDateTime(drift.start),
                to: formatDateTime(drift.end),
              })}
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  chart: { gap: Spacing.one },
  readout: {
    minHeight: 20,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  readoutValue: { fontVariant: ['tabular-nums'], textAlign: TextEnd },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.one,
  },
  blank: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  errorBlock: { gap: Spacing.two },
  retry: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
});
