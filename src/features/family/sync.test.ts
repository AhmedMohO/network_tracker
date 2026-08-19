import type { AppUsage } from "@/features/usage/aggregate";

// dailyPayload/recentPayload are pure; everything else `./sync` imports pulls
// in expo-sqlite (via readArchive/loadSettings/i18n), which jest-expo does not
// mock. Explicit factories keep those modules from ever loading for real.
jest.mock("@/features/archive/db", () => ({ readArchive: jest.fn() }));
jest.mock("@/features/usage/api", () => ({ fetchUsage: jest.fn() }));
jest.mock("@/features/usage/settings", () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));

import { dailyPayload, recentPayload } from "./sync";

const app = (uid: number, total: number): AppUsage => ({
  uid, name: `app${uid}`, packageName: `com.a${uid}`,
  download: total, upload: 0, total, foreground: 0, background: 0, percentage: 0,
});

describe("dailyPayload", () => {
  it("keeps app identity and bytes", () => {
    const p = dailyPayload([app(1, 100), app(2, 50)]);
    expect(p.apps).toHaveLength(2);
    expect(p.apps[0]).toEqual({ uid: 1, name: "app1", pkg: "com.a1", dl: 100, ul: 0 });
  });

  it("drops apps with no traffic rather than shipping empty rows", () => {
    expect(dailyPayload([app(1, 100), app(2, 0)]).apps).toHaveLength(1);
  });

  it("caps the app list so one payload cannot grow unbounded", () => {
    const many = Array.from({ length: 200 }, (_, i) => app(i, 200 - i));
    const p = dailyPayload(many);
    expect(p.apps.length).toBeLessThanOrEqual(50);
    // The cap keeps the biggest, not the first 50 in whatever order arrived.
    expect(p.apps[0].uid).toBe(0);
    // Everything trimmed is still counted, so the parent's total matches the
    // child's total. A silently dropped tail would be fabricated accuracy.
    expect(p.otherBytes).toBeGreaterThan(0);
    expect(p.apps.reduce((s, a) => s + a.dl + a.ul, 0) + p.otherBytes)
      .toBe(many.reduce((s, a) => s + a.total, 0));
  });

  it("handles an empty list without inventing a total", () => {
    expect(dailyPayload([])).toEqual({ apps: [], otherBytes: 0 });
  });
});

describe("recentPayload", () => {
  it("stamps the child's clock so the parent can render an 'as of'", () => {
    const p = recentPayload([app(1, 10)], { mobile: 10, wifi: 0 }, null, 1_700_000_000_000);
    expect(p.at).toBe(1_700_000_000_000);
  });

  it("carries context through when the probe returned some", () => {
    const ctx = { foregroundPackage: "com.x", batteryPercent: 42, connection: "MOBILE" as const };
    expect(recentPayload([], { mobile: 0, wifi: 0 }, ctx, 1).context).toEqual(ctx);
  });

  it("carries null context rather than inventing defaults", () => {
    expect(recentPayload([], { mobile: 0, wifi: 0 }, null, 1).context).toBeNull();
  });
});
