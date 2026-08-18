import type { Range } from "@/features/usage/range";
import { detectSpike, limitStatus, median } from "./limits";

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
