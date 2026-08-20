import type { NetworkFilter, SeriesBin } from "@modules/network-usage";

import type { AppUsage } from "@/features/usage/aggregate";

import { extractNetworkTotals, fromPayload } from "./fromPayload";
import type { Snapshot } from "./sync";

const DAY = 86_400_000;

export type DailySeries = {
  /** Per-app totals merged across every day in range that has data. */
  apps: AppUsage[];
  /** One bin per day that has data — a missing day gets no bin. */
  bins: SeriesBin[];
  totals: { download: number; upload: number; total: number };
  /**
   * Accumulated mobile/wifi split over the days in range that carry one.
   * `null` only when *no* day in range does. `splitMissingDays` says how many
   * days are excluded from it, so a caller can caption the shortfall instead
   * of the figure quietly under-reporting.
   */
  networkTotals: { mobile: number; wifi: number } | null;
  /** Days folded into the totals above with no mobile/wifi split of their own. */
  splitMissingDays: number;
  /**
   * The day key contributed by a `recent` row rather than a completed
   * `daily` one — an in-progress measurement, not a finished day — or `null`
   * when every day in range is complete. Callers that need to say "so far"
   * read this; nothing else about the shape changes.
   */
  partialDay: number | null;
  /** Calendar days in `[start, end)` with no data at all for this child. */
  missingDays: number;
  /** Calendar days in `[start, end)`, complete or not — `missingDays`'s denominator. */
  daysInRange: number;
};

/** Start of the local calendar day containing `ts`. */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Rebuilds one child's usage over `[start, end)` from its cached snapshots.
 *
 * **Day-snapped selection.** A row's `day` is a whole-day key (midnight on
 * the *child's* own clock), but a `Range` is an arbitrary instant window —
 * `last24h` starts at `now - 24h`, a custom range at whatever time the user
 * picked. Comparing the two directly dropped every row whose midnight fell
 * before the window opened, so `last24h` and every custom range read zero.
 * The window is therefore widened to the calendar days it touches before any
 * row is looked at. Rows are still selected by a plain key comparison, never
 * by matching against locally-generated calendar slots, which would miss
 * every row whenever the parent and child sit in different time zones.
 *
 * **Today.** `syncFromChild` only ever pushes a `daily` row for yesterday and
 * earlier, so today's usage lives in the child's newest `recent` heartbeat.
 * That row is folded in as the day its own `at` timestamp names — a partial,
 * in-progress day, reported as `partialDay` so the caller can say so. Without
 * it the default range (`today`) could only ever render zero. A completed
 * `daily` row always wins over a `recent` one for the same day.
 *
 * `network` controls which app list is extracted from the payload: `"ALL"`
 * uses the combined list, `"MOBILE"` / `"WIFI"` use the per-network lists
 * when available (falling back to `"ALL"` for old payloads).
 */
export function buildDailySeries(
  snapshots: Snapshot[],
  start: number,
  end: number,
  otherAppsLabel?: string,
  now: number = Date.now(),
  network: NetworkFilter = "ALL"
): DailySeries {
  // `end` is exclusive, so it is the last *covered* instant that names the
  // final day: an end of exactly midnight belongs to the day before it.
  const dayStart = startOfDay(start);
  const dayEnd = end > start ? startOfDay(end - 1) + DAY : dayStart;

  const byDay = new Map<number, Snapshot>();
  for (const row of snapshots) {
    if (row.kind !== "daily") continue;
    if (row.day < dayStart || row.day >= dayEnd) continue;
    const existing = byDay.get(row.day);
    if (!existing || row.updatedAt > existing.updatedAt) byDay.set(row.day, row);
  }

  // The child's newest heartbeat, keyed to the day its own clock says it
  // covers — not to this device's "today", which can be a different date.
  const newestRecent = snapshots
    .filter((r) => r.kind === "recent")
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  let partialDay: number | null = null;
  if (newestRecent) {
    const at = typeof newestRecent.payload?.at === "number" ? newestRecent.payload.at : newestRecent.updatedAt;
    const day = startOfDay(at);
    if (day >= dayStart && day < dayEnd && !byDay.has(day)) {
      byDay.set(day, newestRecent);
      partialDay = day;
    }
  }

  const days = Array.from(byDay.keys()).sort((a, b) => a - b);
  const bins: SeriesBin[] = [];
  const perDayApps: AppUsage[][] = [];
  let download = 0;
  let upload = 0;
  let total = 0;
  let mobile = 0;
  let wifi = 0;
  let splitMissingDays = 0;

  for (const day of days) {
    const row = byDay.get(day)!;
    const apps = fromPayload(row.payload, otherAppsLabel, network);
    perDayApps.push(apps);
    const dayDownload = apps.reduce((s, a) => s + a.download, 0);
    const dayUpload = apps.reduce((s, a) => s + a.upload, 0);
    // Sums `.total`, not `dayDownload + dayUpload`: a day whose app list got
    // trimmed folds its untracked-direction tail into `.total` via
    // `fromPayload`'s synthetic row, which `dayDownload`/`dayUpload` (known
    // split only) does not include. Summing `.total` keeps the grand total
    // exact even though the chart bin below can only plot the known split.
    const dayTotal = apps.reduce((s, a) => s + a.total, 0);

    // A day with no split of its own is counted, not fabricated as zero and
    // not allowed to void every other day's real split — the shortfall is
    // reported instead, via `splitMissingDays`.
    const netTotals = extractNetworkTotals(row.payload);
    if (netTotals) {
      mobile += netTotals.mobile;
      wifi += netTotals.wifi;
    } else {
      splitMissingDays += 1;
    }

    download += dayDownload;
    upload += dayUpload;
    total += dayTotal;
    bins.push({ start: day, end: day + DAY, rxBytes: dayDownload, txBytes: dayUpload });
  }

  const daysInRange = Math.max(0, Math.round((dayEnd - dayStart) / DAY));
  // Today is only "missing" once the child has pushed nothing for it at all;
  // a day still in progress is not a gap the user needs warning about.
  const today = startOfDay(now);
  const todayUncounted = today >= dayStart && today < dayEnd && !byDay.has(today) ? 1 : 0;
  const missingDays = Math.max(0, daysInRange - byDay.size - todayUncounted);

  return {
    apps: mergeApps(perDayApps),
    bins,
    totals: { download, upload, total },
    networkTotals: splitMissingDays < days.length ? { mobile, wifi } : null,
    splitMissingDays,
    partialDay,
    missingDays,
    daysInRange,
  };
}

/**
 * Sums each app's bytes across the days it appears in, then recomputes
 * percentage against the summed grand total — never averages the per-day
 * percentages, which would not answer "what share of the whole range".
 */
function mergeApps(perDayApps: AppUsage[][]): AppUsage[] {
  const byUid = new Map<
    number,
    { name: string; packageName: string | null; download: number; upload: number; total: number }
  >();

  for (const apps of perDayApps) {
    for (const a of apps) {
      const existing = byUid.get(a.uid);
      if (existing) {
        existing.download += a.download;
        existing.upload += a.upload;
        existing.total += a.total;
      } else {
        byUid.set(a.uid, {
          name: a.name,
          packageName: a.packageName,
          download: a.download,
          upload: a.upload,
          total: a.total,
        });
      }
    }
  }

  const grandTotal = Array.from(byUid.values()).reduce((s, a) => s + a.total, 0);
  return Array.from(byUid.entries())
    .map(([uid, a]) => ({
      uid,
      name: a.name,
      packageName: a.packageName,
      download: a.download,
      upload: a.upload,
      total: a.total,
      foreground: 0,
      background: 0,
      percentage: grandTotal === 0 ? 0 : (a.total / grandTotal) * 100,
    }))
    .sort((a, b) => b.total - a.total);
}
