import { validateCustomRange } from './customRange';

const NOW = 1_700_000_000_000;
const HOUR = 3_600_000;

describe('validateCustomRange', () => {
  it('accepts a past range in order', () => {
    expect(validateCustomRange(NOW - 2 * HOUR, NOW - HOUR, NOW)).toBeNull();
  });

  it('accepts a range ending exactly now', () => {
    expect(validateCustomRange(NOW - HOUR, NOW, NOW)).toBeNull();
  });

  it('rejects a reversed range', () => {
    expect(validateCustomRange(NOW - HOUR, NOW - 2 * HOUR, NOW)).toBe('Start must be before end.');
  });

  it('rejects a zero-length range', () => {
    expect(validateCustomRange(NOW - HOUR, NOW - HOUR, NOW)).toBe('Start must be before end.');
  });

  it('rejects an end in the future', () => {
    expect(validateCustomRange(NOW - HOUR, NOW + HOUR, NOW)).toBe('End cannot be in the future.');
  });

  it('reports the ordering problem first when both are wrong', () => {
    expect(validateCustomRange(NOW + 2 * HOUR, NOW + HOUR, NOW)).toBe('Start must be before end.');
  });
});
