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
// `./cache` reaches expo-sqlite/kv-store at module scope, which jest-expo does
// not mock — same reasoning as the mocks above.
jest.mock("./cache", () => ({ readCache: jest.fn(), mergeCache: jest.fn() }));
// `syncFromChild` probes the device context itself, so `./sync` now imports
// the native module for its value and not only its type. `requireNativeModule`
// throws under jest; a stub keeps the push path exercisable, and returning
// `null` covers the branch where the probe found nothing to report.
jest.mock("@modules/network-usage", () => ({
  __esModule: true,
  default: { getDeviceContext: jest.fn(() => null) },
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
import { mergeCache, readCache } from "./cache";
import {
  dailyPayload,
  parseTimestamptz,
  pullFromParent,
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

  it("does not pull when there is no outstanding limit-increase request", async () => {
    (readArchive as jest.Mock).mockResolvedValue([]);
    await syncFromChild(1_700_000_000_000);
    const urls = (globalThis.fetch as jest.Mock).mock.calls.map(([url]: any[]) => String(url));
    expect(urls.some((u) => u.includes("family_pull"))).toBe(false);
  });

  it("applies a grant derived from the parent's own pushSnapshot call — producer/consumer round trip (review Finding I-2)", async () => {
    // The old version of this test hand-wrote a `family_pull` row stamped
    // with the child's own device id — a shape no code in this repo actually
    // produced, since the parent's unfixed `pushSnapshot` wrote its *own*
    // device id (review Finding C-1). That let this suite stay green over a
    // grant that could never reach a child on real hardware. This version
    // drives the actual producer call — `pushSnapshot('grant', ..., target)`,
    // the exact call `[deviceId].tsx`'s `answerRequest` makes — captures the
    // real request body it sends, and feeds *that* into the mocked
    // `family_pull` response, so a regression in either side breaks this test.
    const childDeviceId = "d".repeat(32);
    // Realistic and recent relative to the sync's own `now` (1_700_000_000_000)
    // below — a small epoch-relative number here would trip the I-3 TTL check
    // and take the "expired, clear without pulling" branch instead of this
    // test's intended "grant found and applied" one.
    const requestAt = 1_700_000_000_000 - 60_000;
    const grantedBytes = 2 * 1024 ** 3;

    let capturedBody: any = null;
    (loadSettings as jest.Mock).mockResolvedValueOnce({
      familyRole: "parent",
      pairToken: "t".repeat(32),
      // The parent's own id — deliberately different from `childDeviceId`,
      // so this fails loudly if `pushSnapshot` ever falls back to it again.
      deviceId: "p".repeat(32),
      deviceLabel: "Dad's phone",
    });
    (globalThis as any).fetch = jest.fn((_url: string, init: any) => {
      capturedBody = JSON.parse(init.body);
      return Promise.resolve(okResponse());
    });
    await pushSnapshot(
      "grant",
      0,
      { grantedBytes, at: 2_000, requestAt },
      { deviceId: childDeviceId, deviceLabel: "Child" }
    );
    // Sanity check on the producer side alone, independent of anything the
    // child does below: the row must be stamped with the child's id, not the
    // pushing (parent) device's own id.
    expect(capturedBody.p_device).toBe(childDeviceId);
    expect(capturedBody.p_device).not.toBe("p".repeat(32));

    (loadSettings as jest.Mock).mockResolvedValue({
      familyRole: "child",
      pairToken: "t".repeat(32),
      deviceId: childDeviceId,
      deviceLabel: "Child",
      lastSyncErrorAt: null,
      pendingLimitRequest: { askedBytes: grantedBytes, at: requestAt },
      appliedGrantRequestAt: null,
      mobileLimitBytes: 5 * 1024 ** 3,
    });
    (readArchive as jest.Mock).mockResolvedValue([]);
    (globalThis as any).fetch = jest.fn((url: string) => {
      if (String(url).includes("family_pull")) {
        return Promise.resolve({
          ok: true,
          // Derived from `capturedBody` — the producer's real output — not
          // hand-authored.
          text: async () =>
            JSON.stringify([
              {
                device_id: capturedBody.p_device,
                device_label: capturedBody.p_label,
                kind: capturedBody.p_kind,
                day: capturedBody.p_day,
                payload: capturedBody.p_payload,
                updated_at: "2026-08-19T00:00:00.000+00:00",
              },
            ]),
        });
      }
      return Promise.resolve(okResponse());
    });

    await syncFromChild(1_700_000_000_000);

    expect(saveSettings).toHaveBeenCalledWith({
      pendingLimitRequest: null,
      appliedGrantRequestAt: requestAt,
      mobileLimitBytes: 7 * 1024 ** 3,
    });
  });

  it("clears an expired pending request without pulling (review Finding I-3)", async () => {
    const now = 1_700_000_000_000;
    const requestAt = now - 4 * 24 * 60 * 60 * 1000; // 4 days ago, past the 3-day TTL
    (loadSettings as jest.Mock).mockResolvedValue({
      familyRole: "child",
      pairToken: "t".repeat(32),
      deviceId: "d".repeat(32),
      deviceLabel: "Child",
      lastSyncErrorAt: null,
      pendingLimitRequest: { askedBytes: 2 * 1024 ** 3, at: requestAt },
      appliedGrantRequestAt: null,
      mobileLimitBytes: 5 * 1024 ** 3,
    });
    (readArchive as jest.Mock).mockResolvedValue([]);

    await syncFromChild(now);

    const urls = (globalThis.fetch as jest.Mock).mock.calls.map(([url]: any[]) => String(url));
    expect(urls.some((u) => u.includes("family_pull"))).toBe(false);
    expect(saveSettings).toHaveBeenCalledWith({ pendingLimitRequest: null });
  });

  it("picks the newest grant row when more than one is returned for this device (review Finding M-6)", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({
      familyRole: "child",
      pairToken: "t".repeat(32),
      deviceId: "d".repeat(32),
      deviceLabel: "Child",
      lastSyncErrorAt: null,
      pendingLimitRequest: { askedBytes: 2 * 1024 ** 3, at: 1_700_000_000_000 - 60_000 },
      appliedGrantRequestAt: null,
      mobileLimitBytes: 5 * 1024 ** 3,
    });
    (readArchive as jest.Mock).mockResolvedValue([]);
    (globalThis as any).fetch = jest.fn((url: string) => {
      if (String(url).includes("family_pull")) {
        return Promise.resolve({
          ok: true,
          // `family_pull` orders ascending by `updated_at` — the older,
          // smaller grant is returned first. `find` (the pre-fix code) would
          // have picked this one; `.sort(...)[0]` must pick the newer one.
          text: async () =>
            JSON.stringify([
              {
                device_id: "d".repeat(32),
                device_label: "Child",
                kind: "grant",
                day: 0,
                payload: {
                  grantedBytes: 1 * 1024 ** 3,
                  at: 1_700_000_000_000 - 30_000,
                  requestAt: 1_700_000_000_000 - 60_000,
                },
                updated_at: "2026-08-19T00:00:00.000+00:00",
              },
              {
                device_id: "d".repeat(32),
                device_label: "Child",
                kind: "grant",
                day: 0,
                payload: {
                  grantedBytes: 9 * 1024 ** 3,
                  at: 1_700_000_000_000 - 10_000,
                  requestAt: 1_700_000_000_000 - 60_000,
                },
                updated_at: "2026-08-19T00:00:10.000+00:00",
              },
            ]),
        });
      }
      return Promise.resolve(okResponse());
    });

    await syncFromChild(1_700_000_000_000);

    expect(saveSettings).toHaveBeenCalledWith({
      pendingLimitRequest: null,
      appliedGrantRequestAt: 1_700_000_000_000 - 60_000,
      mobileLimitBytes: 14 * 1024 ** 3, // 5 + 9, not 5 + 1
    });
  });

  it("does not re-raise the limit on a later sync against the same (never-deleted) grant row", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({
      familyRole: "child",
      pairToken: "t".repeat(32),
      deviceId: "d".repeat(32),
      deviceLabel: "Child",
      lastSyncErrorAt: null,
      // Already applied on an earlier sync, and the request row itself
      // (never deleted server-side) is still there — but the pending
      // request was already cleared, so this sync does not even pull.
      pendingLimitRequest: null,
      appliedGrantRequestAt: 1_000,
      mobileLimitBytes: 7 * 1024 ** 3,
    });
    (readArchive as jest.Mock).mockResolvedValue([]);

    await syncFromChild(1_700_000_000_000);

    const urls = (globalThis.fetch as jest.Mock).mock.calls.map(([url]: any[]) => String(url));
    expect(urls.some((u) => u.includes("family_pull"))).toBe(false);
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ mobileLimitBytes: expect.anything() })
    );
  });
});

describe("pullFromParent", () => {
  beforeEach(() => {
    (globalThis as any).fetch = jest.fn();
    (readCache as jest.Mock).mockReset().mockResolvedValue([]);
    (mergeCache as jest.Mock).mockReset().mockResolvedValue([]);
    (saveSettings as jest.Mock).mockReset();
  });

  it("makes no network call and touches no cache when this device is not a parent", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ familyRole: "child", pairToken: "t".repeat(32) });
    await pullFromParent(1_700_000_000_000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(readCache).not.toHaveBeenCalled();
  });

  it("makes no network call when a parent has not paired yet", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ familyRole: "parent", pairToken: null });
    await pullFromParent(1_700_000_000_000);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(readCache).not.toHaveBeenCalled();
  });

  it("pulls with the cache's own newest row as the since-cursor, and merges the result", async () => {
    (loadSettings as jest.Mock)
      .mockResolvedValueOnce({ familyRole: "parent", pairToken: "t".repeat(32) }) // pullFromParent's own guard
      .mockResolvedValue({ pairToken: "t".repeat(32), lastSyncErrorAt: null }); // pullSnapshots' + syncRun's reads
    (readCache as jest.Mock).mockResolvedValue([
      { deviceId: "d1", deviceLabel: "Kid", kind: "recent", day: 0, payload: {}, updatedAt: 500 },
    ]);
    (globalThis.fetch as jest.Mock).mockResolvedValue({ ok: true, text: async () => "[]" });

    await pullFromParent(1_700_000_000_000);

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(init.body).p_since).toBe(new Date(500).toISOString());
    expect(mergeCache).not.toHaveBeenCalled(); // an empty pull has nothing new to merge
  });

  it("propagates a failed pull through syncRun so the sync-broken notice can see it", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({
      familyRole: "parent",
      pairToken: "t".repeat(32),
      lastSyncErrorAt: null,
    });
    (globalThis.fetch as jest.Mock).mockRejectedValue(new Error("offline"));
    await expect(pullFromParent(1_700_000_000_000)).rejects.toThrow("offline");
    expect(saveSettings).toHaveBeenCalledWith({ lastSyncErrorAt: expect.any(Number) });
  });
});
