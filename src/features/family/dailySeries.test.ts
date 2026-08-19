import { buildDailySeries } from "./dailySeries";
import type { Snapshot } from "./sync";

// Local midnights, fixed well in the past so none of these tests accidentally
// land on the machine's real "today" (which would trip the today-exclusion
// rule under test further down).
const day0 = new Date(2024, 0, 1).getTime();
const DAY = 86_400_000;
const day1 = day0 + DAY;
const day2 = day0 + 2 * DAY;
const rangeStart = day0;
const rangeEnd = day0 + 3 * DAY; // covers day0, day1, day2

const dailySnap = (day: number, payload: unknown, updatedAt = day, deviceId = "d1"): Snapshot => ({
  deviceId,
  deviceLabel: "Kid",
  kind: "daily",
  day,
  payload,
  updatedAt,
});

const payload = (apps: { uid: number; name: string; pkg: string | null; dl: number; ul: number }[], otherBytes = 0) => ({
  apps,
  otherBytes,
});

describe("buildDailySeries", () => {
  it("emits one bin per day that has a daily row, and counts the rest as missing", () => {
    const result = buildDailySeries(
      [dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }]))],
      rangeStart,
      rangeEnd
    );
    expect(result.daysInRange).toBe(3);
    expect(result.bins).toHaveLength(1);
    expect(result.missingDays).toBe(2);
  });

  it("renders a gap as no bin, never as a zero-value bin", () => {
    const result = buildDailySeries(
      [dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }]))],
      rangeStart,
      rangeEnd
    );
    // day1 and day2 have no snapshot at all: no bin claims to know they were 0.
    expect(result.bins.some((b) => b.start === day1)).toBe(false);
    expect(result.bins.some((b) => b.start === day2)).toBe(false);
  });

  it("returns every day missing when there are no snapshots at all", () => {
    const result = buildDailySeries([], rangeStart, rangeEnd);
    expect(result.bins).toEqual([]);
    expect(result.missingDays).toBe(3);
    expect(result.daysInRange).toBe(3);
  });

  it("ignores rows of other kinds when building the daily chart", () => {
    const recent: Snapshot = { deviceId: "d1", deviceLabel: "Kid", kind: "recent", day: 0, payload: payload([{ uid: 1, name: "A", pkg: "a", dl: 999, ul: 0 }]), updatedAt: 1 };
    const result = buildDailySeries([recent], rangeStart, rangeEnd);
    expect(result.bins).toEqual([]);
    expect(result.missingDays).toBe(3);
  });

  it("a duplicate push for the same day keeps only the newest updatedAt", () => {
    const stale = dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }]), 1);
    const fresh = dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 500, ul: 0 }]), 2);
    const result = buildDailySeries([stale, fresh], rangeStart, rangeEnd);
    expect(result.bins).toHaveLength(1);
    expect(result.totals.download).toBe(500);
  });

  it("sums totals across days, including each day's trimmed tail", () => {
    const result = buildDailySeries(
      [
        dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 900, ul: 100 }], 200)),
        dailySnap(day1, payload([{ uid: 2, name: "B", pkg: "b", dl: 300, ul: 0 }])),
      ],
      rangeStart,
      rangeEnd
    );
    // day0: 1000 kept + 200 trimmed = 1200. day1: 300. Grand total: 1500.
    expect(result.totals.total).toBe(1500);
    // Known direction split excludes the untracked trimmed tail.
    expect(result.totals.download).toBe(1200);
    expect(result.totals.upload).toBe(100);
  });

  it("merges the same app across days into one summed row", () => {
    const result = buildDailySeries(
      [
        dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }])),
        dailySnap(day1, payload([{ uid: 1, name: "A", pkg: "a", dl: 50, ul: 0 }])),
      ],
      rangeStart,
      rangeEnd
    );
    expect(result.apps).toHaveLength(1);
    expect(result.apps[0]).toMatchObject({ uid: 1, total: 150, percentage: 100 });
  });

  it("recomputes percentage against the merged grand total rather than averaging per-day percentages", () => {
    const result = buildDailySeries(
      [
        dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }, { uid: 2, name: "B", pkg: "b", dl: 900, ul: 0 }])),
        dailySnap(day1, payload([{ uid: 1, name: "A", pkg: "a", dl: 900, ul: 0 }])),
      ],
      rangeStart,
      rangeEnd
    );
    // uid 1: 100 + 900 = 1000 of a 1900 grand total.
    const a = result.apps.find((x) => x.uid === 1);
    expect(a?.percentage).toBeCloseTo((1000 / 1900) * 100);
  });

  it("forwards otherAppsLabel to fromPayload so the trimmed-tail row is translated", () => {
    const result = buildDailySeries(
      [dailySnap(day0, payload([{ uid: 1, name: "A", pkg: "a", dl: 10, ul: 0 }], 50))],
      rangeStart,
      rangeEnd,
      "Autres applis"
    );
    expect(result.apps.find((a) => a.uid === -100)?.name).toBe("Autres applis");
  });

  // I-6: a `daily` row's `day` is the *child's own* day key. Selecting rows
  // by `day >= start && day < end` must not require that key to line up with
  // a calendar slot generated from the parent's own local midnight — that
  // was the cross-timezone bug (every row from a child in a different time
  // zone missed every lookup and rendered as a gap).
  it("selects a row by its own day key within [start, end), not by a locally-generated calendar slot", () => {
    const offsetDay = rangeStart + 3 * 60 * 60 * 1000; // 3h in: not a local midnight
    const result = buildDailySeries(
      [dailySnap(offsetDay, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }]))],
      rangeStart,
      rangeEnd
    );
    expect(result.bins).toHaveLength(1);
    expect(result.bins[0].start).toBe(offsetDay);
    expect(result.missingDays).toBe(2);
  });

  it("excludes a row whose day falls outside [start, end)", () => {
    const result = buildDailySeries(
      [dailySnap(rangeEnd + DAY, payload([{ uid: 1, name: "A", pkg: "a", dl: 100, ul: 0 }]))],
      rangeStart,
      rangeEnd
    );
    expect(result.bins).toHaveLength(0);
    expect(result.missingDays).toBe(3);
  });

  // C-1: a child never pushes a `daily` row for the day still in progress
  // (only a `recent` one) — counting that day as missing would flag the
  // feature's own design as an outage.
  it("does not count the day still in progress (per `now`) as missing", () => {
    const now = day1 + 5 * 60 * 60 * 1000; // partway through day1
    const result = buildDailySeries([], rangeStart, rangeEnd, undefined, now);
    // day0 and day2 are genuinely missing; day1 ("today", per `now`) is not.
    expect(result.missingDays).toBe(2);
  });

  it("counts every day as missing when `now` falls outside the range entirely", () => {
    const now = rangeEnd + 10 * DAY;
    const result = buildDailySeries([], rangeStart, rangeEnd, undefined, now);
    expect(result.missingDays).toBe(3);
  });

});
