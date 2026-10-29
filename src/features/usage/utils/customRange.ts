/**
 * Widest range the chart can still draw legibly: `chooseBucketMs` tops out at
 * one-week bins, so a year is ~53 bars. Past that the bars shrink towards a
 * sub-pixel comb (2000 of them at the native bin cap) for no added meaning.
 */
const MAX_RANGE_MS = 366 * 24 * 3_600_000;

/**
 * Validates a user-picked custom range before it is queried. A reversed or
 * future range returns nothing useful, and the empty result would read as a
 * data bug rather than bad input. An absurdly wide one draws an unreadable
 * chart.
 *
 * @returns a translation key for the message to show, or null when the range
 * is usable.
 */
export function validateCustomRange(
  start: number,
  end: number,
  now: number
): string | null {
  if (start >= end) return 'range.errorOrder';
  if (end > now) return 'range.errorFuture';
  if (end - start > MAX_RANGE_MS) return 'range.errorTooLong';
  return null;
}
