import type { AppUsage } from "@/features/usage/aggregate";
import type { Range } from "@/features/usage/range";

import { archiveCutoff, mergeUsage, splitRange } from "./merge";

const DAY = 86_400_000;

const range = (start: number, end: number): Range => ({
  start,
  end,
  preset: "custom",
});

const app = (uid: number, total: number): AppUsage => ({
  uid,
  name: `App ${uid}`,
  packageName: `com.app${uid}`,
  download: total,
  upload: 0,
  total,
  foreground: 0,
  background: 0,
  percentage: 0,
});

describe("splitRange", () => {
  const cutoff = 100 * DAY;

  it("sends a fully recent range to the live source only", () => {
    const r = range(101 * DAY, 102 * DAY);
    const split = splitRange(r, cutoff);
    expect(split.archived).toBeNull();
    expect(split.live).toEqual(r);
  });

  it("sends a fully old range to the archive only", () => {
    const r = range(10 * DAY, 20 * DAY);
    const split = splitRange(r, cutoff);
    expect(split.live).toBeNull();
    expect(split.archived).toEqual(r);
  });

  it("splits a range that straddles the cutoff", () => {
    const split = splitRange(range(90 * DAY, 110 * DAY), cutoff);
    expect(split.archived).toEqual(range(90 * DAY, cutoff));
    expect(split.live).toEqual(range(cutoff, 110 * DAY));
  });
});

describe("archiveCutoff", () => {
  it("lands on a local midnight", () => {
    const at = archiveCutoff(new Date(2026, 7, 18, 10, 30).getTime());
    expect(new Date(at).getHours()).toBe(0);
    expect(new Date(at).getMinutes()).toBe(0);
  });

  it("stays inside Android's retention window", () => {
    const now = new Date(2026, 7, 18, 10, 30).getTime();
    const age = now - archiveCutoff(now);
    expect(age).toBeGreaterThan(70 * DAY);
    expect(age).toBeLessThan(90 * DAY);
  });
});

describe("mergeUsage", () => {
  it("sums the same app across both sources", () => {
    const merged = mergeUsage([app(1, 100)], [app(1, 50)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].total).toBe(150);
  });

  it("keeps apps present in only one source", () => {
    expect(mergeUsage([app(1, 100)], [app(2, 50)])).toHaveLength(2);
  });

  it("recomputes percentages over the merged total", () => {
    const merged = mergeUsage([app(1, 75)], [app(2, 25)]);
    expect(merged[0].percentage).toBeCloseTo(75);
  });

  it("returns the other side unchanged when one is empty", () => {
    expect(mergeUsage([], [app(1, 10)])[0].total).toBe(10);
  });

  it("does not mutate its inputs", () => {
    const live = [app(1, 100)];
    mergeUsage([app(1, 50)], live);
    expect(live[0].total).toBe(100);
  });
});
