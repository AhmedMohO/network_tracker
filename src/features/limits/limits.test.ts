import {
  billingCycleRange,
  nextCycleStart,
  type Range,
} from "@/features/usage/range";
import { cycleRanges, detectSpike, limitStatus, median } from "./limits";

const GB = 1024 ** 3;
// A 10-day cycle, so "halfway" is easy to reason about.
const range: Range = { start: 0, end: 10 * 86_400_000, preset: "thisCycle" };
const halfway = 5 * 86_400_000;

describe("limitStatus", () => {
  it("reports remaining bytes and percent used", () => {
    const s = limitStatus(6 * GB, 10 * GB, range, halfway, 80);
    expect(s.remainingBytes).toBe(4 * GB);
    expect(s.usedPercent).toBeCloseTo(60);
  });

  it("projects the cycle total from the elapsed fraction", () => {
    // 6 GB used at the halfway point projects to 12 GB.
    const s = limitStatus(6 * GB, 10 * GB, range, halfway, 80);
    expect(s.elapsedPercent).toBeCloseTo(50);
    expect(s.projectedBytes).toBeCloseTo(12 * GB);
  });

  it("is ok below the warning threshold", () => {
    expect(limitStatus(1 * GB, 10 * GB, range, halfway, 80).state).toBe("ok");
  });

  it("warns at the configured percentage", () => {
    expect(limitStatus(8 * GB, 10 * GB, range, halfway, 80).state).toBe("warn");
  });

  it("reports over once the limit is passed", () => {
    expect(limitStatus(11 * GB, 10 * GB, range, halfway, 80).state).toBe("over");
  });

  it("never reports negative remaining", () => {
    expect(limitStatus(15 * GB, 10 * GB, range, halfway, 80).remainingBytes).toBe(0);
  });

  it("does not divide by zero at the very start of a cycle", () => {
    const s = limitStatus(0, 10 * GB, range, range.start, 80);
    expect(Number.isFinite(s.projectedBytes)).toBe(true);
    expect(s.projectedBytes).toBe(0);
  });

  it("does not project beyond the end of the cycle", () => {
    const s = limitStatus(9 * GB, 10 * GB, range, range.end, 80);
    expect(s.projectedBytes).toBeCloseTo(9 * GB);
  });

  // Regression: every caller queries with billingCycleRange, whose `end` for
  // the current cycle is `now` — a query window, not the cycle. Fed that
  // directly as the measurement range, elapsed time is the whole span and the
  // "projection" is just the current reading wearing a forecast's clothes.
  it("measures elapsed time against the cycle, not the query window", () => {
    const cycleStartDay = 1;
    // Noon on day 5 of a 31-day cycle: 4.5 of 31 days gone.
    const now = new Date(2026, 7, 5, 12, 0, 0).getTime();
    const { query, measurement } = cycleRanges(cycleStartDay, now);

    const s = limitStatus(2 * GB, 10 * GB, measurement, now, 80);
    expect(s.elapsedPercent).toBeGreaterThan(0);
    expect(s.elapsedPercent).toBeLessThan(100);
    // 4.5 / 31 ≈ 14.5%. Precision 0 so a DST hour cannot flip the assertion.
    expect(s.elapsedPercent).toBeCloseTo((4.5 / 31) * 100, 0);
    // A projection that equals the measurement is not a projection: 2 GB in
    // 4.5 of 31 days extrapolates to roughly 6.9x that.
    expect(s.projectedBytes).toBeGreaterThan(6 * s.usedBytes);
    expect(s.projectedBytes).toBeLessThan(8 * s.usedBytes);

    // The exact caller-level regression this guards against: feeding the
    // *query* window (what useUsage/fetchUsage actually asks Android for)
    // into limitStatus instead of the measurement window collapses the
    // projection back into a restatement of what has already been used.
    const reverted = limitStatus(2 * GB, 10 * GB, query, now, 80);
    expect(reverted.elapsedPercent).toBeCloseTo(100);
    expect(reverted.projectedBytes).toBeCloseTo(reverted.usedBytes);
  });
});

// R1: the C1 fix's real risk was never limitStatus's math (covered above) —
// it was a caller quietly handing it the query range instead of the
// measurement range. `cycleRanges` is the one place both `useLimitStatus` and
// `backgroundCheck.runUsageCheck` get this pair from, so testing it here is
// testing what every caller actually receives.
describe("cycleRanges", () => {
  const cycleStartDay = 1;
  const now = new Date(2026, 7, 5, 12, 0, 0).getTime();

  it("ends the query at now and the measurement at the next cycle start", () => {
    const { query, measurement } = cycleRanges(cycleStartDay, now);
    expect(query.end).toBe(now);
    expect(measurement.end).toBe(nextCycleStart(cycleStartDay, now));
    expect(measurement.end).toBeGreaterThan(query.end);
  });

  it("starts both ranges at the same cycle start", () => {
    const { query, measurement } = cycleRanges(cycleStartDay, now);
    expect(measurement.start).toBe(query.start);
    expect(query.start).toBe(billingCycleRange(cycleStartDay, now).start);
  });
});

describe("median", () => {
  it("returns the middle value of an odd-length list", () => {
    expect(median([5, 1, 3])).toBe(3);
  });

  it("averages the middle pair of an even-length list", () => {
    expect(median([1, 3, 5, 7])).toBe(4);
  });

  it("returns zero for an empty list", () => {
    expect(median([])).toBe(0);
  });
});

describe("detectSpike", () => {
  const normal = [100, 110, 90, 105, 95, 100, 100];

  it("flags a day far above the recent median", () => {
    expect(detectSpike(normal, 400)).toBe(true);
  });

  it("ignores a normal day", () => {
    expect(detectSpike(normal, 130)).toBe(false);
  });

  it("uses the median so one huge day does not raise the bar", () => {
    const withOutlier = [100, 110, 5000, 105, 95, 100, 100];
    expect(detectSpike(withOutlier, 400)).toBe(true);
  });

  it("does not flag anything without enough history", () => {
    expect(detectSpike([100, 200], 5000)).toBe(false);
  });

  it("does not flag a spike from a zero baseline", () => {
    expect(detectSpike([0, 0, 0, 0, 0, 0, 0], 50 * 1024 * 1024)).toBe(false);
  });
});
