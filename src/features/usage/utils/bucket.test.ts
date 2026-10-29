import { chooseBucketMs } from "./bucket";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** Mirrors the bin count `StatsReader.series()` computes before its guard. */
const binCount = (rangeMs: number, bucketMs: number) =>
  Math.floor(rangeMs / bucketMs) + 1;

describe("chooseBucketMs", () => {
  it("floors short ranges at two hours rather than the ladder's one hour", () => {
    expect(chooseBucketMs(HOUR)).toBe(2 * HOUR);
    expect(chooseBucketMs(DAY)).toBe(2 * HOUR);
    expect(chooseBucketMs(2 * DAY)).toBe(2 * HOUR);
  });

  it("uses one day up to sixty days and one week beyond", () => {
    expect(chooseBucketMs(2 * DAY + 1)).toBe(DAY);
    expect(chooseBucketMs(30 * DAY)).toBe(DAY);
    expect(chooseBucketMs(60 * DAY)).toBe(DAY);
    expect(chooseBucketMs(60 * DAY + 1)).toBe(WEEK);
    expect(chooseBucketMs(365 * DAY)).toBe(WEEK);
  });

  it("never returns a width that trips the 2000-bin native guard", () => {
    const ranges = [
      0,
      HOUR,
      2 * DAY,
      30 * DAY,
      60 * DAY,
      365 * DAY,
      // 2000 weeks is where the week rung would start failing.
      2000 * WEEK,
      50 * 365 * DAY,
      // A custom range reaching back to the epoch is reachable from the picker.
      Date.UTC(2026, 7, 18),
    ];
    for (const rangeMs of ranges) {
      expect(binCount(rangeMs, chooseBucketMs(rangeMs))).toBeLessThanOrEqual(2000);
    }
  });

  it("stays at the week rung right up to the widening boundary", () => {
    expect(chooseBucketMs(1999 * WEEK)).toBe(WEEK);
    expect(chooseBucketMs(1999 * WEEK + 1)).toBeGreaterThan(WEEK);
  });

  it("returns a positive integer for degenerate ranges", () => {
    for (const rangeMs of [0, -1]) {
      const bucket = chooseBucketMs(rangeMs);
      expect(Number.isInteger(bucket)).toBe(true);
      expect(bucket).toBeGreaterThan(0);
    }
  });
});
