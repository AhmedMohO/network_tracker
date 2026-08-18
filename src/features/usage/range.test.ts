import {
  billingCycleRange,
  coverageDrift,
  nextCycleStart,
  presetRange,
  previousRange,
} from "./range";

// 2026-08-18T10:30:00 local time
const NOW = new Date(2026, 7, 18, 10, 30, 0).getTime();

describe("presetRange", () => {
  it("today starts at local midnight and ends now", () => {
    const r = presetRange("today", NOW);
    expect(r.preset).toBe("today");
    expect(new Date(r.start).getHours()).toBe(0);
    expect(new Date(r.start).getDate()).toBe(18);
    expect(r.end).toBe(NOW);
  });

  it("yesterday is a full local day", () => {
    const r = presetRange("yesterday", NOW);
    expect(new Date(r.start).getDate()).toBe(17);
    expect(new Date(r.end).getDate()).toBe(18);
    expect(new Date(r.end).getHours()).toBe(0);
  });

  it("last24h is exactly 24 hours back from now", () => {
    const r = presetRange("last24h", NOW);
    expect(r.end - r.start).toBe(86_400_000);
  });

  it("last7d starts at midnight six days ago", () => {
    const r = presetRange("last7d", NOW);
    expect(new Date(r.start).getDate()).toBe(12);
    expect(new Date(r.start).getHours()).toBe(0);
  });
});

describe("billingCycleRange", () => {
  it("starts on the cycle day of the current month when that day has passed", () => {
    const r = billingCycleRange(11, NOW);
    expect(new Date(r.start).getMonth()).toBe(7); // August
    expect(new Date(r.start).getDate()).toBe(11);
    expect(r.end).toBe(NOW);
  });

  it("starts in the previous month when the cycle day has not arrived yet", () => {
    const r = billingCycleRange(21, NOW);
    expect(new Date(r.start).getMonth()).toBe(6); // July
    expect(new Date(r.start).getDate()).toBe(21);
  });

  it("clamps a day-31 cycle to the last day of a short month", () => {
    // 2026-04-15; cycle day 31 must fall back to March 31.
    const april = new Date(2026, 3, 15, 12, 0, 0).getTime();
    const r = billingCycleRange(31, april);
    expect(new Date(r.start).getMonth()).toBe(2); // March
    expect(new Date(r.start).getDate()).toBe(31);
  });

  it("offset -1 returns the previous complete cycle", () => {
    const r = billingCycleRange(11, NOW, -1);
    expect(new Date(r.start).getMonth()).toBe(6); // July 11
    expect(new Date(r.end).getMonth()).toBe(7); // to August 11
    expect(new Date(r.end).getDate()).toBe(11);
  });
});

describe("coverageDrift", () => {
  const requested = { start: 1000, end: 2000, preset: "custom" } as const;

  it("returns null when coverage matches the request", () => {
    expect(coverageDrift(requested, 1000, 2000)).toBeNull();
  });

  it("tolerates sub-minute drift", () => {
    expect(coverageDrift(requested, 1000 - 30_000, 2000)).toBeNull();
  });

  it("reports the real window when coverage is wider", () => {
    expect(coverageDrift(requested, 0, 7_200_000)).toEqual({
      start: 0,
      end: 7_200_000,
    });
  });
});

describe("nextCycleStart", () => {
  it("is the cycle day of the following month", () => {
    const next = nextCycleStart(11, NOW);
    expect(new Date(next).getMonth()).toBe(8); // September
    expect(new Date(next).getDate()).toBe(11);
    expect(new Date(next).getHours()).toBe(0);
  });

  it("is this month's cycle day when that day has not arrived yet", () => {
    // On the 18th with a cycle day of 25, the current cycle began last month.
    const next = nextCycleStart(25, NOW);
    expect(new Date(next).getMonth()).toBe(7); // August
    expect(new Date(next).getDate()).toBe(25);
  });

  it("clamps to the last day of a shorter following month", () => {
    const jan31 = new Date(2026, 0, 31, 9, 0, 0).getTime();
    const next = nextCycleStart(31, jan31);
    expect(new Date(next).getMonth()).toBe(1); // February
    expect(new Date(next).getDate()).toBe(28); // 2026 is not a leap year
  });

  it("is strictly after the current cycle's query window", () => {
    const cycle = billingCycleRange(11, NOW);
    expect(nextCycleStart(11, NOW)).toBeGreaterThan(cycle.end);
    expect(cycle.end).toBe(NOW);
  });
});

describe("previousRange", () => {
  it("shifts a fixed range back by its own length", () => {
    const r = presetRange("last7d", NOW);
    const prev = previousRange(r, 1, NOW);
    expect(prev.end).toBe(r.start);
    expect(prev.end - prev.start).toBe(r.end - r.start);
  });

  it("returns the previous calendar cycle for a cycle range", () => {
    const cycle = presetRange("thisCycle", NOW, 11);
    const prev = previousRange(cycle, 11, NOW);
    expect(new Date(prev.start).getMonth()).toBe(6); // July 11
    expect(new Date(prev.start).getDate()).toBe(11);
  });

  it("compares like with like for a partial cycle", () => {
    // Seven days into the cycle: the previous period must also be seven days,
    // not a whole month, or the comparison is meaningless.
    const cycle = presetRange("thisCycle", NOW, 11);
    const prev = previousRange(cycle, 11, NOW);
    expect(prev.end - prev.start).toBe(cycle.end - cycle.start);
  });

  it("steps a whole cycle back for the last-cycle preset", () => {
    const cycle = presetRange("lastCycle", NOW, 11);
    const prev = previousRange(cycle, 11, NOW);
    expect(new Date(prev.start).getMonth()).toBe(5); // June 11
    expect(prev.end).toBe(cycle.start);
  });

  it("is a derived window, not a preset the picker could select", () => {
    expect(previousRange(presetRange("today", NOW), 1, NOW).preset).toBe("custom");
  });
});
