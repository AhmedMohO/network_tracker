import { useUsage } from "@/features/usage/hooks/useUsage";
import { useUsageContext } from "@/features/usage/hooks/useUsageContext";
import { useNow } from "@/hooks/use-now";

import {
  cycleRanges,
  limitStatus,
  type LimitNetwork,
  type LimitStatus,
} from "../utils/limits";

/**
 * How often `now` advances. It drives both the elapsed marker and the native
 * query, so it is deliberately coarse: over a monthly cycle a finer tick moves
 * the bar by nothing visible, and every tick costs a NetworkStatsManager query.
 * 15 minutes also matches the background check's own floor.
 */
const TICK_MS = 15 * 60_000;

export type LimitView = {
  status: LimitStatus;
  /** Window Android actually covered, when it is not the one requested. */
  coverage: { start: number; end: number } | null;
};

/**
 * A data limit is always about data over the billing cycle, not whatever
 * range the dashboard has selected — so this runs its own query rather than
 * reading `range` off the context. Supports both Mobile and Wi-Fi limits.
 */
export function useLimitStatus(network: LimitNetwork): LimitView | null {
  const { settings } = useUsageContext();
  const isWifi = network === "WIFI";
  const cycleStartDay = settings?.cycleStartDay ?? 1;
  const limitBytes = isWifi ? settings?.wifiLimitBytes : settings?.mobileLimitBytes;
  const warnAtPercent =
    (isWifi ? settings?.wifiWarnAtPercent : settings?.mobileWarnAtPercent) ?? 80;

  const now = useNow(TICK_MS);

  // `query` is what Android can be asked about (ends at `now`); `measurement`
  // is what `limitStatus` gauges elapsed time and the projection against
  // (ends at the next cycle start). `useUsage` keys on start/end, so this
  // refetches once a tick and no more.
  const { query, measurement } = cycleRanges(cycleStartDay, now);
  const { data } = useUsage(query, network);

  if (!data || !limitBytes) return null;
  return {
    status: limitStatus(
      data.totals.total,
      limitBytes,
      measurement,
      now,
      warnAtPercent
    ),
    coverage: data.coverage,
  };
}
