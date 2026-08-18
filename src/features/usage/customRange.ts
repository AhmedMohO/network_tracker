/**
 * Validates a user-picked custom range before it is queried. A reversed or
 * future range returns nothing useful, and the empty result would read as a
 * data bug rather than bad input.
 *
 * @returns an error message to show, or null when the range is usable.
 */
export function validateCustomRange(start: number, end: number, now: number): string | null {
  if (start >= end) return 'Start must be before end.';
  if (end > now) return 'End cannot be in the future.';
  return null;
}
