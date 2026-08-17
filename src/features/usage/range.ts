export type PresetId =
  | "today"
  | "yesterday"
  | "last24h"
  | "last7d"
  | "last30d"
  | "thisCycle"
  | "lastCycle";

export type Range = { start: number; end: number; label: string };

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
  return { start, end, label: offset === 0 ? "This cycle" : "Last cycle" };
}

export function presetRange(
  preset: PresetId,
  now: number,
  cycleStartDay = 1
): Range {
  switch (preset) {
    case "today":
      return { start: midnight(now), end: now, label: "Today" };
    case "yesterday":
      return { start: midnight(now, -1), end: midnight(now), label: "Yesterday" };
    case "last24h":
      return { start: now - DAY, end: now, label: "Last 24 hours" };
    case "last7d":
      return { start: midnight(now, -6), end: now, label: "Last 7 days" };
    case "last30d":
      return { start: midnight(now, -29), end: now, label: "Last 30 days" };
    case "thisCycle":
      return billingCycleRange(cycleStartDay, now, 0);
    case "lastCycle":
      return billingCycleRange(cycleStartDay, now, -1);
  }
}

/**
 * Android reports usage in system buckets, so the data returned for a range
 * may cover a wider window than requested. Returns a sentence to show the
 * user, or null when the difference is negligible.
 */
export function coverageNote(
  requested: Range,
  coveredStart: number,
  coveredEnd: number
): string | null {
  const startDrift = Math.abs(coveredStart - requested.start);
  const endDrift = Math.abs(coveredEnd - requested.end);
  if (startDrift <= COVERAGE_TOLERANCE_MS && endDrift <= COVERAGE_TOLERANCE_MS) {
    return null;
  }
  const fmt = (ts: number) =>
    new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `Showing ${fmt(coveredStart)} – ${fmt(coveredEnd)}, the closest range covered by Android's system data.`;
}
