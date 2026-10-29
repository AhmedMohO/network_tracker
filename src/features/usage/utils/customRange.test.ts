import { validateCustomRange } from './customRange';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('validateCustomRange', () => {
  it('accepts a past range in order', () => {
    expect(validateCustomRange(NOW - 2 * HOUR, NOW - HOUR, NOW)).toBeNull();
  });

  it('accepts a range ending exactly now', () => {
    expect(validateCustomRange(NOW - HOUR, NOW, NOW)).toBeNull();
  });

  it('rejects a reversed range', () => {
    expect(validateCustomRange(NOW - HOUR, NOW - 2 * HOUR, NOW)).toBe('range.errorOrder');
  });

  it('rejects a zero-length range', () => {
    expect(validateCustomRange(NOW - HOUR, NOW - HOUR, NOW)).toBe('range.errorOrder');
  });

  it('rejects an end in the future', () => {
    expect(validateCustomRange(NOW - HOUR, NOW + HOUR, NOW)).toBe('range.errorFuture');
  });

  it('accepts a range exactly at the one-year cap', () => {
    expect(validateCustomRange(NOW - 366 * DAY, NOW, NOW)).toBeNull();
  });

  it('rejects a range wider than a year', () => {
    expect(validateCustomRange(NOW - 367 * DAY, NOW, NOW)).toBe('range.errorTooLong');
  });

  it('rejects a decade-wide range that would draw a sub-pixel comb', () => {
    expect(validateCustomRange(NOW - 3650 * DAY, NOW, NOW)).toBe('range.errorTooLong');
  });

  it('reports the ordering problem first when both are wrong', () => {
    expect(validateCustomRange(NOW + 2 * HOUR, NOW + HOUR, NOW)).toBe('range.errorOrder');
  });
});
