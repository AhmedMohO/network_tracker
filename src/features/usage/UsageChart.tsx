import type { SeriesBin } from '@modules/network-usage';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { chooseBucketMs } from './bucket';
import { formatBytes } from './format';
import { coverageNote } from './range';
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

const total = (b: SeriesBin) => b.rxBytes + b.txBytes;

function formatMoment(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "2 hours" / "1 day" — the width one bar actually stands for. */
function describeSpan(ms: number): string {
  const hours = Math.round(ms / 3_600_000);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function UsageChart({ bins, height = 120 }: { bins: SeriesBin[]; height?: number }) {
  const theme = useTheme();
  const values = bins.map(total);
  const sum = values.reduce((acc, v) => acc + v, 0);

  // Reachable in normal use: Android returns no detail buckets for a quiet
  // window, and an empty or flat-zero chart must read as an answer, not a gap.
  if (sum <= 0) {
    return (
      <View style={[styles.blank, { height, borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary">
          No usage in this range.
        </ThemedText>
      </View>
    );
  }

  const peak = Math.max(...values);
  const scale = Math.max(peak, 1);
  const slot = VIEW / Math.max(bins.length, 1);
  const label =
    `Bar chart of usage over time. ${bins.length} ${bins.length === 1 ? 'bar' : 'bars'} of ` +
    `${describeSpan(bins[0].end - bins[0].start)} each, ${formatBytes(sum)} in total, ` +
    `peaking at ${formatBytes(peak)} around ${formatMoment(bins[values.indexOf(peak)].start)}.`;

  return (
    <View style={{ height }} accessible accessibilityRole="image" accessibilityLabel={label}>
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
            />
          );
        })}
      </Svg>
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
  const { range, network } = useUsageContext();
  const bucketMs = chooseBucketMs(range.end - range.start);
  const { data, loading, error, reload } = useSeries(range, network, bucketMs, uid);
  const hasBars = !!data && data.bins.some((b) => total(b) > 0);
  const note = data ? coverageNote(range, data.coveredStart, data.coveredEnd) : null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="small" themeColor="textSecondary">
        Usage over time
      </ThemedText>

      {loading && !data ? (
        <ActivityIndicator color={theme.accent} accessibilityLabel="Loading chart" />
      ) : null}

      {error ? (
        <View style={styles.errorBlock}>
          <ThemedText type="small">Could not load the chart.</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {error}
          </ThemedText>
          <Pressable
            onPress={reload}
            accessibilityRole="button"
            accessibilityLabel="Retry loading the chart"
            style={({ pressed }) => [
              styles.retry,
              { borderColor: theme.accent, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText type="smallBold" themeColor="accent">
              Retry
            </ThemedText>
          </Pressable>
        </View>
      ) : null}

      {data && !error ? (
        <>
          <UsageChart bins={data.bins} />
          {hasBars ? (
            <ThemedText type="small" themeColor="textSecondary">
              Each bar covers {describeSpan(bucketMs)}.
            </ThemedText>
          ) : null}
          {/* Coverage information, not a failure — plain secondary body text. */}
          {note ? (
            <ThemedText type="small" themeColor="textSecondary">
              {note}
            </ThemedText>
          ) : null}
        </>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
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
