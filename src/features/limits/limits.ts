import {
  billingCycleRange,
  nextCycleStart,
  type Range,
} from "@/features/usage/range";

export type LimitState = "ok" | "warn" | "over";

/** The networks a limit can be set on. `NetworkFilter`'s "ALL" is not one. */
export type LimitNetwork = "MOBILE" | "WIFI";

export type LimitStatus = {
  usedBytes: number;
  limitBytes: number;
  remainingBytes: number;
  usedPercent: number;
  elapsedPercent: number;
  projectedBytes: number;
  state: LimitState;
};

const MIN_HISTORY_DAYS = 5;

/**
 * The two windows a limit check needs from one billing cycle: `query`, which
 * Android can be asked about (it ends at `now` — the future is unqueryable),
 * and `measurement`, which is what `limitStatus` must gauge elapsed time and
 * the projection against (it ends at the next cycle start). Both callers
 * built this same pair by hand, which is how the cycle projection shipped
 * dead in the first place — extracted here so there is no per-caller wiring
 * left to get wrong.
 */
export function cycleRanges(
  cycleStartDay: number,
  now: number
): { query: Range; measurement: Range } {
  const query = billingCycleRange(cycleStartDay, now);
  return {
    query,
    measurement: { ...query, end: nextCycleStart(cycleStartDay, now) },
  };
}

export function limitStatus(
  usedBytes: number,
  limitBytes: number,
  range: Range,
  now: number,
  warnAtPercent: number
): LimitStatus {
  const span = Math.max(1, range.end - range.start);
  const elapsed = Math.min(Math.max(0, now - range.start), span);
  const elapsedFraction = elapsed / span;

  // Straight-line projection: at this rate, where does the cycle end up?
  // With no elapsed time there is no rate to extrapolate from, so project
  // what has actually been used rather than dividing by zero.
  const projectedBytes =
    elapsedFraction === 0 ? usedBytes : usedBytes / elapsedFraction;

  const usedPercent = limitBytes === 0 ? 0 : (usedBytes / limitBytes) * 100;

  const state: LimitState =
    usedBytes >= limitBytes
      ? "over"
      : usedPercent >= warnAtPercent
        ? "warn"
        : "ok";

  return {
    usedBytes,
    limitBytes,
    remainingBytes: Math.max(0, limitBytes - usedBytes),
    usedPercent,
    elapsedPercent: elapsedFraction * 100,
    projectedBytes,
    state,
  };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * A spike is today being far above the *median* of recent days. Median, not
 * mean: one 5 GB day should not raise the bar for the next fortnight.
 */
export function detectSpike(
  previousDailyTotals: number[],
  todayTotal: number,
  factor = 3
): boolean {
  if (previousDailyTotals.length < MIN_HISTORY_DAYS) return false;
  const baseline = median(previousDailyTotals);
  // A zero baseline makes every non-zero day an infinite ratio; that is not
  // a spike, it is a first day of use.
  if (baseline <= 0) return false;
  return todayTotal / baseline >= factor;
}
