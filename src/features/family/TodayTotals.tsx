import { Smartphone, Wifi } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatBytes } from '@/features/usage/format';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import type { RecentPayload } from './useChildren';

/**
 * Whether a heartbeat's own timestamp falls on this device's calendar day —
 * the question both screens that render `TodayTotals` have to answer before
 * putting a figure under a "today" heading. A `recent` row is upserted under
 * `day = 0` and simply stays there when a child stops syncing, so the newest
 * one is not necessarily today's.
 */
export function isTodayHeartbeat(at: number, now = Date.now()): boolean {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return at >= midnight.getTime() && at < midnight.getTime() + 86_400_000;
}

/**
 * A child's newest `recent` heartbeat: today so far, carrying its own "as of"
 * time (the child's clock, `payload.at`) and its `coverage` caption when
 * Android reported a different window than requested. Never a zero — the
 * caller only renders this when a `recent` row actually exists; a missing
 * check-in is its own, separate message.
 *
 * Shared by `family/index.tsx` (inline, per row) and `family/[deviceId].tsx`
 * ("Today so far" section) so the two screens can never disagree about what
 * "today" means for a child.
 */
export function TodayTotals({ recent }: { recent: RecentPayload }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.totalsGroup}>
      <View style={styles.totalsRow}>
        <View style={styles.totalChip}>
          <Smartphone size={12} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {formatBytes(recent.totals.mobile)}
          </ThemedText>
        </View>
        <View style={styles.totalChip}>
          <Wifi size={12} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary">
            {formatBytes(recent.totals.wifi)}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('family.asOf', { when: formatDateTime(recent.at) })}
      </ThemedText>
      {/* Android reported a different window than requested: without this
          caption the figures above would carry precision they do not have. */}
      {recent.coverage ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('chart.coverage', {
            from: formatDateTime(recent.coverage.start),
            to: formatDateTime(recent.coverage.end),
          })}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  totalsGroup: { gap: 2, marginTop: 2 },
  totalsRow: { flexDirection: 'row', gap: Spacing.two },
  totalChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
