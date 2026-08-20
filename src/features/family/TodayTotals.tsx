import { Smartphone, Wifi } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatBytes } from '@/features/usage/format';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, formatSpan } from '@/i18n/format';

import { checkInAt, connectionKey, isContextStale, resolveForegroundAppName } from './context';
import type { RecentPayload } from './useChildren';

/**
 * The device-context probe (Task 32) attached to the heartbeat, rendered past
 * tense and pinned to the check-in time it was captured at — never "is
 * currently", which nothing here can promise: the reading is up to 15
 * minutes old by the time it arrives, and older still by the time anyone
 * reads it. `isContextStale` (45 minutes, three missed heartbeats) decides
 * whether naming an app would still be honest; past that, this names the gap
 * instead. A missing `context` (a payload pushed before this task, or a
 * probe that itself failed) renders nothing rather than guessing.
 *
 * Staleness is judged on `checkInAt` — the older of the child's own clock and
 * the server's stamp for the same row — never on the child's clock alone, and
 * it is judged *before* the missing-context check so that a heartbeat old
 * enough to name the gap says so whether or not it carried a context.
 */
function describeContext(
  recent: RecentPayload,
  serverAt: number | null,
  now: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string | null {
  const { context, at, apps } = recent;
  const since = checkInAt(at, serverAt);
  if (isContextStale(since, now)) {
    return t('family.noCheckInSince', { when: formatDateTime(since) });
  }
  if (!context) return null;

  const appName = resolveForegroundAppName(context.foregroundPackage, apps);
  const parts: string[] = [];
  if (appName) parts.push(t('family.wasUsingApp', { app: appName }));
  if (context.batteryPercent != null) {
    parts.push(t('family.batteryPercent', { percent: context.batteryPercent }));
  }
  parts.push(t(connectionKey(context.connection)));
  // Clamped at zero: this parent's own clock can still sit behind the server's
  // stamp, and `formatSpan` renders a negative span as "1 minute ago".
  const span = formatSpan(Math.max(0, now - since));
  return `${t('family.lastCheckIn', { span })} — ${parts.join(' · ')}`;
}

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
export function TodayTotals({
  recent,
  serverAt,
}: {
  recent: RecentPayload;
  /** `updated_at` of the row this payload came from — see `checkInAt`. */
  serverAt: number | null;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const contextText = describeContext(recent, serverAt, Date.now(), t);

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
      {contextText ? (
        <ThemedText type="small" themeColor="textSecondary">
          {contextText}
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
