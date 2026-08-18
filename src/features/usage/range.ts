export type PresetId =
  | "today"
  | "yesterday"
  | "last24h"
  | "last7d"
  | "last30d"
  | "thisCycle"
  | "lastCycle";

/** `custom` is the only id the presets do not produce. */
export type RangeId = PresetId | "custom";

/**
 * A range carries its id rather than a display string: the label is a
 * translation key resolved at render time, and the id is what the picker
 * compares to decide which chip is active.
 */
export type Range = { start: number; end: number; preset: RangeId };

const DAY = 86_400_000;
const COVERAGE_TOLERANCE_MS = 60_000;

function midnight(ts: number, dayOffset = 0): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  return d.getTime();
}

/**
 * Start of the billing cycle containing `now`, shifted by `offset` cycles.
 * offset 0 = current cycle, -1 = previous complete cycle.
 */
export function billingCycleRange(
  cycleStartDay: number,
  now: number,
  offset = 0
): Range {
  const cycleStart = (monthsBack: number) => {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(1); // avoid rolling over when setting the month
    d.setMonth(d.getMonth() - monthsBack);
    // Clamp: a cycle day of 31 in a 30-day month means the last day.
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(cycleStartDay, daysInMonth));
    return d.getTime();
  };

  // If this month's cycle day has not arrived yet, the current cycle began last month.
  const thisMonthStart = cycleStart(0);
  const base = thisMonthStart <= now ? 0 : 1;

  const start = cycleStart(base - offset);
  const end = offset === 0 ? now : cycleStart(base - offset - 1);
  return { start, end, preset: offset === 0 ? "thisCycle" : "lastCycle" };
}

export function presetRange(
  preset: PresetId,
  now: number,
  cycleStartDay = 1
): Range {
  switch (preset) {
    case "today":
      return { start: midnight(now), end: now, preset };
    case "yesterday":
      return { start: midnight(now, -1), end: midnight(now), preset };
    case "last24h":
      return { start: now - DAY, end: now, preset };
    case "last7d":
      return { start: midnight(now, -6), end: now, preset };
    case "last30d":
      return { start: midnight(now, -29), end: now, preset };
    case "thisCycle":
      return billingCycleRange(cycleStartDay, now, 0);
    case "lastCycle":
      return billingCycleRange(cycleStartDay, now, -1);
  }
}

/**
 * Android reports usage in system buckets, so the data returned for a range
 * may cover a wider window than requested. Returns the window actually
 * covered when it differs enough to be worth telling the user about, or null
 * when the difference is negligible. Wording and date formatting belong to
 * the UI layer, which knows the active language.
 */
export function coverageDrift(
  requested: Range,
  coveredStart: number,
  coveredEnd: number
): { start: number; end: number } | null {
  const startDrift = Math.abs(coveredStart - requested.start);
  const endDrift = Math.abs(coveredEnd - requested.end);
  if (startDrift <= COVERAGE_TOLERANCE_MS && endDrift <= COVERAGE_TOLERANCE_MS) {
    return null;
  }
  return { start: coveredStart, end: coveredEnd };
}
