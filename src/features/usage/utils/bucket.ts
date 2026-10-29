const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * `StatsReader.series()` rejects a query needing more than this many bins.
 * It computes `(end - start) / bucketMs + 1`, so the widening below has to
 * keep that expression at or under the limit for any range the UI can build.
 */
const MAX_BINS = 2000;

// ponytail: 2h floor because Android's queryDetails buckets are ~2h wide and a
// finer request just produces a comb of empty bins. Lower it once the Phase 0
// Q3 granularity re-probe runs over a window with real mobile traffic.
const MIN_BUCKET_MS = 2 * HOUR;

/**
 * Bin width for a chart covering `rangeMs`. Wide enough that every bar stands
 * for a window Android actually measures, and never so narrow that the native
 * bin guard rejects the query.
 */
export function chooseBucketMs(rangeMs: number): number {
  const ladder = rangeMs <= 2 * DAY ? HOUR : rangeMs <= 60 * DAY ? DAY : WEEK;
  // rangeMs / bucket <= MAX_BINS - 1, so the native +1 lands exactly on the cap.
  const widestNeeded = Math.ceil(rangeMs / (MAX_BINS - 1));
  return Math.max(ladder, MIN_BUCKET_MS, widestNeeded);
}
