import type { SeriesBin } from "@modules/network-usage";

import type { AppUsage } from "@/features/usage/aggregate";

import { fromPayload } from "./fromPayload";
import type { Snapshot } from "./sync";

const DAY = 86_400_000;

export type DailySeries = {
  /** Per-app totals merged across every completed day in range. */
  apps: AppUsage[];
  /** One bin per day that has a `daily` row — a missing day gets no bin. */
  bins: SeriesBin[];
  totals: { download: number; upload: number; total: number };
  /** Calendar days in `[start, end)` with no `daily` row for this child. */
  missingDays: number;
  /** Calendar days in `[start, end)`, complete or not — `missingDays`'s denominator. */
  daysInRange: number;
};

/**
 * Local midnights covering `[start, end)`, the same day-start convention
 * `features/usage/range.ts`'s (unexported) `midnight` uses and that a child's
 * `daily` snapshot is keyed by. `setDate` rather than `+= DAY` so a DST
 * transition shifts the wall-clock hour, not which calendar day this lands on.
 */
function daySlots(start: number, end: number): number[] {
  const days: number[] = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() < end) {
    days.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Rebuilds one child's daily usage over `[start, end)` from its cached
 * `daily` snapshots. A day with no `daily` row is a gap, not a zero-usage
 * day — the child may simply have been offline — so it contributes no bin
 * and no bytes; `missingDays` is how the caller says so instead of silently
 * under-reporting. `otherAppsLabel` is forwarded to `fromPayload` — see its
 * own doc comment for why this module does not import `@/i18n` itself.
 */
export function buildDailySeries(
  snapshots: Snapshot[],
  start: number,
  end: number,
  otherAppsLabel?: string
): DailySeries {
  const byDay = new Map<number, Snapshot>();
  for (const row of snapshots) {
    if (row.kind !== "daily") continue;
    const existing = byDay.get(row.day);
    if (!existing || row.updatedAt > existing.updatedAt) byDay.set(row.day, row);
  }

  const slots = daySlots(start, end);
  const bins: SeriesBin[] = [];
  const perDayApps: AppUsage[][] = [];
  let download = 0;
  let upload = 0;
  let total = 0;

  for (const day of slots) {
    const row = byDay.get(day);
    if (!row) continue; // gap: Android's day-of-week midnight, no data for it

    const apps = fromPayload(row.payload, otherAppsLabel);
    perDayApps.push(apps);
    const dayDownload = apps.reduce((s, a) => s + a.download, 0);
    const dayUpload = apps.reduce((s, a) => s + a.upload, 0);
    // Sums `.total`, not `dayDownload + dayUpload`: a day whose app list got
    // trimmed folds its untracked-direction tail into `.total` via
    // `fromPayload`'s synthetic row, which `dayDownload`/`dayUpload` (known
    // split only) does not include. Summing `.total` keeps the grand total
    // exact even though the chart bin below can only plot the known split.
    const dayTotal = apps.reduce((s, a) => s + a.total, 0);

    download += dayDownload;
    upload += dayUpload;
    total += dayTotal;
    bins.push({ start: day, end: day + DAY, rxBytes: dayDownload, txBytes: dayUpload });
  }

  return {
    apps: mergeApps(perDayApps),
    bins,
    totals: { download, upload, total },
    missingDays: slots.length - bins.length,
    daysInRange: slots.length,
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
