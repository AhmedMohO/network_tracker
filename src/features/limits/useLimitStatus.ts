import { useEffect, useState } from "react";

import { billingCycleRange, nextCycleStart } from "@/features/usage/range";
import { useUsage } from "@/features/usage/useUsage";
import { useUsageContext } from "@/features/usage/useUsageContext";

import { limitStatus, type LimitStatus } from "./limits";

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
 * A data limit is always about mobile data over the billing cycle, not
 * whatever range/filter the dashboard has selected — so this runs its own
 * query rather than reading `range`/`network` off the context.
 */
export function useLimitStatus(): LimitView | null {
  const { settings } = useUsageContext();
  const cycleStartDay = settings?.cycleStartDay ?? 1;

  // `now` has to come from state: with `reactCompiler` on, a bare `Date.now()`
  // in the render body has no dependency that could ever invalidate it, so the
  // elapsed fraction would freeze at whatever the first render happened to see.
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const cycleStart = billingCycleRange(cycleStartDay, now).start;
  // Android cannot be queried about the future, so the query window ends now.
  // `useUsage` keys on start/end, so this refetches once a tick and no more.
  const query = { start: cycleStart, end: now, preset: "thisCycle" as const };
  const { data } = useUsage(query, "MOBILE");

  if (!data || !settings?.mobileLimitBytes) return null;
  return {
    status: limitStatus(
      data.totals.total,
      settings.mobileLimitBytes,
      // The cycle to measure against runs to the *next* cycle start, which is
      // not where the query stopped.
      {
        start: cycleStart,
        end: nextCycleStart(cycleStartDay, now),
        preset: "thisCycle",
      },
      now,
      settings.warnAtPercent
    ),
    coverage: data.coverage,
  };
}
