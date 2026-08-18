import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";

/** Conservatively inside Android's ~90-day per-UID retention window. */
const RETENTION_DAYS = 80;

/**
 * The moment before which the archive is authoritative.
 *
 * Snapped back to local midnight because the archive stores whole days: an
 * unaligned cutoff would put the day containing it on both sides of the split
 * and count that day's traffic twice.
 */
export function archiveCutoff(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - RETENTION_DAYS);
  return d.getTime();
}

/** Splits a request into the part the archive owns and the part Android still has. */
export function splitRange(
  range: Range,
  cutoff: number
): { archived: Range | null; live: Range | null } {
  if (range.end <= cutoff) return { archived: range, live: null };
  if (range.start >= cutoff) return { archived: null, live: range };
  return {
    archived: { start: range.start, end: cutoff, preset: range.preset },
    live: { start: cutoff, end: range.end, preset: range.preset },
  };
}

export function mergeUsage(a: AppUsage[], b: AppUsage[]): AppUsage[] {
  const byUid = new Map<number, AppUsage>();

  for (const row of [...a, ...b]) {
    const existing = byUid.get(row.uid);
    // Copied, never referenced: these rows belong to the caller's arrays.
    if (!existing) {
      byUid.set(row.uid, { ...row });
      continue;
    }
    existing.download += row.download;
    existing.upload += row.upload;
    existing.total += row.total;
    existing.foreground += row.foreground;
    existing.background += row.background;
  }

  const merged = [...byUid.values()];
  const grandTotal = merged.reduce((sum, r) => sum + r.total, 0);
  for (const row of merged) {
    row.percentage = grandTotal === 0 ? 0 : (row.total / grandTotal) * 100;
  }
  return merged.sort((x, y) => y.total - x.total);
}
