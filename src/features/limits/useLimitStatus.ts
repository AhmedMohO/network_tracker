import { useEffect, useState } from "react";

import { useUsage } from "@/features/usage/useUsage";
import { useUsageContext } from "@/features/usage/useUsageContext";

import {
  cycleRanges,
  limitStatus,
  type LimitNetwork,
  type LimitStatus,
} from "./limits";

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

  // `now` has to come from state: with `reactCompiler` on, a bare `Date.now()`
  // in the render body has no dependency that could ever invalidate it, so the
  // elapsed fraction would freeze at whatever the first render happened to see.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

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
