import type { AppUsageRow } from "@modules/network-usage";
import {
  compareUsage,
  displayName,
  partitionApps,
  sumUsage,
  toAppUsage,
} from "./aggregate";

const row = (over: Partial<AppUsageRow>): AppUsageRow => ({
  uid: 10001,
  packages: ["com.example"],
  label: "Example",
  rxBytes: 0,
  txBytes: 0,
  rxForegroundBytes: 0,
  txForegroundBytes: 0,
  coveredStart: 0,
  coveredEnd: 0,
  ...over,
});

describe("displayName", () => {
  it("prefers the label", () => {
    expect(displayName(row({ label: "YouTube" }))).toBe("YouTube");
  });

  it("falls back to the package name", () => {
    expect(displayName(row({ label: null, packages: ["com.foo.bar"] }))).toBe(
      "com.foo.bar"
    );
  });

  it("names an unresolvable uid rather than showing a blank row", () => {
    expect(displayName(row({ label: null, packages: [], uid: 10234 }))).toBe(
      "Removed app (UID 10234)"
    );
  });
});

describe("toAppUsage", () => {
  const rows = [
    row({ uid: 1, label: "Small", rxBytes: 100, txBytes: 0 }),
    row({ uid: 2, label: "Big", rxBytes: 800, txBytes: 100 }),
  ];

  it("sorts by total descending", () => {
    expect(toAppUsage(rows).map((a) => a.name)).toEqual(["Big", "Small"]);
  });

  it("computes percentages against the grand total", () => {
    const [big, small] = toAppUsage(rows);
    expect(big.percentage).toBeCloseTo(90);
    expect(small.percentage).toBeCloseTo(10);
  });

  it("derives background as total minus foreground", () => {
    const [app] = toAppUsage([
      row({ rxBytes: 1000, txBytes: 0, rxForegroundBytes: 400, txForegroundBytes: 0 }),
    ]);
    expect(app.foreground).toBe(400);
    expect(app.background).toBe(600);
  });

  it("returns no rows and no division by zero for empty input", () => {
    expect(toAppUsage([])).toEqual([]);
  });

  it("gives zero percent rather than NaN when nothing was used", () => {
    const [app] = toAppUsage([row({ rxBytes: 0, txBytes: 0 })]);
    expect(app.percentage).toBe(0);
  });
});

describe("sumUsage", () => {
  it("totals download and upload separately", () => {
    const apps = toAppUsage([
      row({ uid: 1, rxBytes: 100, txBytes: 10 }),
      row({ uid: 2, rxBytes: 200, txBytes: 20 }),
    ]);
    expect(sumUsage(apps)).toEqual({ download: 300, upload: 30, total: 330 });
  });
});

describe("compareUsage", () => {
  it("reports percent change against the previous period", () => {
    const current = toAppUsage([row({ uid: 1, label: "A", rxBytes: 150 })]);
    const previous = toAppUsage([row({ uid: 1, label: "A", rxBytes: 100 })]);
    expect(compareUsage(current, previous)[0].changePercent).toBeCloseTo(50);
  });

  it("marks a newly appearing app with a null change instead of Infinity", () => {
    const current = toAppUsage([row({ uid: 2, label: "New", rxBytes: 500 })]);
    expect(compareUsage(current, [])[0].changePercent).toBeNull();
  });

  it("includes apps that disappeared, as a full decrease", () => {
    const previous = toAppUsage([row({ uid: 3, label: "Gone", rxBytes: 400 })]);
    const delta = compareUsage([], previous);
    expect(delta[0].current).toBe(0);
    expect(delta[0].changePercent).toBeCloseTo(-100);
  });
});

describe("partitionApps", () => {
  const apps = toAppUsage([
    row({ uid: 10234, label: "Browser", rxBytes: 500 }),
    row({ uid: -5, label: "Tethering", rxBytes: 400 }),
    row({ uid: 1000, label: "Android System", rxBytes: 300 }),
  ]);

  it("keeps tethering visible even though its UID is not an app's", () => {
    const { visible, hidden } = partitionApps(apps, false);
    expect(visible.map((a) => a.uid)).toEqual([10234, -5]);
    expect(hidden.map((a) => a.uid)).toEqual([1000]);
  });

  it("hides nothing when system apps are turned on", () => {
    const { visible, hidden } = partitionApps(apps, true);
    expect(visible).toHaveLength(3);
    expect(hidden).toEqual([]);
  });
});
