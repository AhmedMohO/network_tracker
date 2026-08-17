import { billingCycleRange, coverageNote, presetRange } from "./range";

// 2026-08-18T10:30:00 local time
const NOW = new Date(2026, 7, 18, 10, 30, 0).getTime();

describe("presetRange", () => {
  it("today starts at local midnight and ends now", () => {
    const r = presetRange("today", NOW);
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

describe("coverageNote", () => {
  const requested = { start: 1000, end: 2000, label: "x" };

  it("returns null when coverage matches the request", () => {
    expect(coverageNote(requested, 1000, 2000)).toBeNull();
  });

  it("tolerates sub-minute drift", () => {
    expect(coverageNote(requested, 1000 - 30_000, 2000)).toBeNull();
  });

  it("describes the real range when coverage is wider", () => {
    const note = coverageNote(requested, 0, 7_200_000);
    expect(note).toContain("system data");
  });
});
