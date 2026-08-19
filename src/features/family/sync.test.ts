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
// jest-expo does not populate Constants.expoConfig from app.json, so `rpc`'s
// `!config?.url` guard would short-circuit every network-call assertion below
// before `fetch` is ever reached. A fixed fake stands in for it.
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { family: { url: "https://test.example", anonKey: "anon" } } } },
}));

import { readArchive } from "@/features/archive/db";
import { fetchUsage } from "@/features/usage/api";
import { loadSettings, saveSettings } from "@/features/usage/settings";
import {
  dailyPayload,
  parseTimestamptz,
  pushSnapshot,
  recentPayload,
  syncFromChild,
  syncRun,
} from "./sync";

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
    const p = recentPayload([app(1, 10)], { mobile: 10, wifi: 0 }, null, 1_700_000_000_000, null);
    expect(p.at).toBe(1_700_000_000_000);
  });

  it("carries context through when the probe returned some", () => {
    const ctx = { foregroundPackage: "com.x", batteryPercent: 42, connection: "MOBILE" as const };
    expect(recentPayload([], { mobile: 0, wifi: 0 }, ctx, 1, null).context).toEqual(ctx);
  });

  it("carries null context rather than inventing defaults", () => {
    expect(recentPayload([], { mobile: 0, wifi: 0 }, null, 1, null).context).toBeNull();
  });

  it("carries the coverage window so the parent can render the same caption the child does", () => {
    // TotalsCard/LimitCard already render this caption from `fetchUsage`'s
    // own `coverage` field; dropping it here would let the parent show the
    // same figure with no such caption — precision the transport fabricated.
    const coverage = { start: 1, end: 2 };
    expect(recentPayload([], { mobile: 0, wifi: 0 }, null, 1, coverage).coverage).toEqual(coverage);
  });

  it("carries a null coverage rather than inventing one when the request was met exactly", () => {
    expect(recentPayload([], { mobile: 0, wifi: 0 }, null, 1, null).coverage).toBeNull();
  });
});

describe("parseTimestamptz", () => {
  // PostgREST trims trailing zeros off a timestamptz's fractional seconds, so
  // the digit count varies row to row. All of these name the same instant.
  const variants: [string, string][] = [
    ["2026-08-19T03:39:06.485569+00:00", "6 fractional digits (real family_pull sample)"],
    ["2026-08-19T03:39:06.48556+00:00", "5 fractional digits"],
    ["2026-08-19T03:39:06.4855+00:00", "4 fractional digits"],
    ["2026-08-19T03:39:06.485+00:00", "3 fractional digits (already ECMA-legal)"],
  ];

  it.each(variants)("parses %s (%s) to the same finite timestamp", (iso) => {
    const expected = Date.parse("2026-08-19T03:39:06.485+00:00");
    expect(parseTimestamptz(iso)).toBe(expected);
  });

  it("parses an exact second with no fractional part at all", () => {
    const iso = "2026-08-19T03:39:06+00:00";
    expect(parseTimestamptz(iso)).toBe(Date.parse(iso));
    expect(Number.isFinite(parseTimestamptz(iso))).toBe(true);
  });
});

describe("pushSnapshot", () => {
  // Global Constraint: an unpaired install makes zero network calls. Nothing
  // upstream of `pushSnapshot` enforces this — it is the one guard `rpc`
  // itself relies on.
  beforeEach(() => {
    (globalThis as any).fetch = jest.fn();
  });

  it("makes no network call without a pair token", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ pairToken: null, deviceId: "device1" });
    await pushSnapshot("recent", 0, {});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("makes no network call without a device id", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ pairToken: "token1", deviceId: null });
    await pushSnapshot("recent", 0, {});
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe("syncRun", () => {
  beforeEach(() => {
    (saveSettings as jest.Mock).mockClear();
  });

  it("stamps success only once the whole run has completed", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ lastSyncErrorAt: null });
    await syncRun(async () => {});
    expect(saveSettings).toHaveBeenCalledWith({
      lastSyncOkAt: expect.any(Number),
      lastSyncErrorAt: null,
    });
  });

  it("stamps a failure and rethrows, without a success stamp for the same run", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ lastSyncErrorAt: null });
    await expect(syncRun(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(saveSettings).toHaveBeenCalledWith({ lastSyncErrorAt: expect.any(Number) });
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncOkAt: expect.anything() })
    );
  });

  it("does not re-stamp an error already recorded, so its age reflects the first failure", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ lastSyncErrorAt: 123 });
    await expect(syncRun(async () => { throw new Error("boom"); })).rejects.toThrow();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("regression: a run where an earlier step succeeded and a later one failed never clears a real error", async () => {
    // This is the exact shape of the bug: `daily` succeeds, `recent` fails.
    // Stamping per-call cleared `lastSyncErrorAt` on the `daily` half before
    // the `recent` half re-set it, so it never aged. Wrapping both in one
    // `syncRun` call means only the outcome of the whole run is stamped.
    (loadSettings as jest.Mock).mockResolvedValue({ lastSyncErrorAt: null });
    await expect(
      syncRun(async () => {
        /* pretend the first call ("daily") already succeeded here */
        throw new Error("recent failed");
      })
    ).rejects.toThrow();
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ lastSyncOkAt: expect.anything() })
    );
  });
});

describe("syncFromChild", () => {
  const okResponse = () => ({ ok: true, text: async () => "" });
  const usage = { apps: [], totals: { download: 0, upload: 0, total: 0 }, coverage: null };
  const archiveRow = (): AppUsage => app(1, 10);

  const pushedKinds = () =>
    (globalThis.fetch as jest.Mock).mock.calls.map(([, init]: any[]) => JSON.parse(init.body).p_kind);

  beforeEach(() => {
    (globalThis as any).fetch = jest.fn().mockResolvedValue(okResponse());
    (loadSettings as jest.Mock).mockResolvedValue({
      familyRole: "child",
      pairToken: "t".repeat(32),
      deviceId: "d".repeat(32),
      deviceLabel: "Child",
      lastSyncErrorAt: null,
    });
    (saveSettings as jest.Mock).mockClear();
    (readArchive as jest.Mock).mockReset();
    (fetchUsage as jest.Mock).mockReset().mockResolvedValue(usage);
  });

  it("omits the daily push when the archive has no rows for that day", async () => {
    (readArchive as jest.Mock).mockResolvedValue([]);
    await syncFromChild(1_700_000_000_000);
    expect(pushedKinds()).toEqual(["recent"]);
  });

  it("pushes the daily row when the archive has real rows", async () => {
    (readArchive as jest.Mock).mockResolvedValue([archiveRow()]);
    await syncFromChild(1_700_000_000_000);
    expect(pushedKinds()).toEqual(expect.arrayContaining(["daily", "recent"]));
  });
});
