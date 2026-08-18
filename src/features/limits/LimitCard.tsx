import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { formatBytes } from '@/features/usage/format';
import { useTheme } from '@/hooks/use-theme';

import type { LimitState, LimitStatus } from './limits';

const STATE_COLOR: Record<LimitState, ThemeColor> = {
  ok: 'accent',
  warn: 'warning',
  over: 'danger',
};

/**
 * Two bars, not one: usage against the limit, and a marker for how far
 * through the cycle we are. Being at 60% of the data on day 3 of 30 is the
 * thing worth seeing, and one number cannot show it.
 */
export function LimitCard({ status }: { status: LimitStatus }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const color = STATE_COLOR[status.state];
  const overProjection = status.projectedBytes > status.limitBytes;
  const usedBytes = formatBytes(status.usedBytes);
  const limitBytes = formatBytes(status.limitBytes);
  const usedPercent = Math.round(status.usedPercent);
  const elapsedPercent = Math.round(status.elapsedPercent);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headline}>
        <ThemedText type="subtitle" numberOfLines={1} adjustsFontSizeToFit>
          {usedBytes}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('limits.of', { limit: limitBytes })}
        </ThemedText>
      </View>

      <View
        style={styles.progress}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('limits.a11y', {
          used: usedBytes,
          limit: limitBytes,
          percent: usedPercent,
          elapsed: elapsedPercent,
        })}>
        {/* Decorative bars: the container above announces the summary instead. */}
        <View
          style={[styles.track, { backgroundColor: theme.backgroundSelected }]}
          accessibilityElementsHidden
          importantForAccessibility="no">
          <View
            style={[
              styles.fill,
              { width: `${Math.min(100, status.usedPercent)}%`, backgroundColor: theme[color] },
            ]}
          />
        </View>
        <View
          style={[styles.elapsedTrack, { backgroundColor: theme.backgroundSelected }]}
          accessibilityElementsHidden
          importantForAccessibility="no">
          <View
            style={[
              styles.elapsedFill,
              {
                width: `${Math.min(100, status.elapsedPercent)}%`,
                backgroundColor: theme.textSecondary,
              },
            ]}
          />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('limits.elapsed', { percent: elapsedPercent })}
        </ThemedText>
      </View>

      <ThemedText type="smallBold" themeColor={color}>
        {status.state === 'over'
          ? t('limits.over', { bytes: formatBytes(status.usedBytes - status.limitBytes) })
          : t('limits.remaining', { bytes: formatBytes(status.remainingBytes) })}
      </ThemedText>

      <ThemedText type="small" themeColor="textSecondary">
        {overProjection
          ? t('limits.projectedOver', { bytes: formatBytes(status.projectedBytes) })
          : t('limits.projected', { bytes: formatBytes(status.projectedBytes) })}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  headline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progress: { gap: Spacing.one },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  elapsedTrack: { height: 2, borderRadius: 1, overflow: 'hidden' },
  elapsedFill: { height: 2, borderRadius: 1 },
});
