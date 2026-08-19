import type { Snapshot } from "@/features/family/sync";

// backgroundCheck.ts imports `@/i18n` at module scope. It CAN be mocked
// (review Finding M-8 — jest.mock("@/i18n", ...) already stands up cleanly in
// useFamily.test.ts and sync.test.ts over the same import graph), it just
// never had been for this file. Mocked here the same way, plus every other
// native/expo-sqlite-touching dependency this module pulls in, so the real
// wiring in `checkChild`'s request-notification block — newest-row
// selection, `payload.at` vs `updatedAt`, the `typeof` guards, and
// `childRequestNotifiedAt` persistence — runs for real and is what these
// tests exercise, through the only exported entry point, `runUsageCheck`.
jest.mock("@/features/archive/db", () => ({ snapshotDay: jest.fn() }));
jest.mock("@/features/family/cache", () => ({ readCache: jest.fn() }));
jest.mock("@/features/family/sync", () => ({
  pullFromParent: jest.fn().mockResolvedValue(undefined),
  syncFromChild: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/features/usage/api", () => ({ fetchUsage: jest.fn() }));
jest.mock("@/features/usage/settings", () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));
jest.mock("expo-device", () => ({ deviceName: null }));
jest.mock("./notify", () => ({ notify: jest.fn() }));
// Identity-with-args mock: returns the key alone when there are no
// interpolation args, or `key:{"opt":"value"}` when there are — so a test can
// assert both *which* string fired and *what* real data (label, byte
// amounts, timestamps) flowed into it, without needing the real i18n runtime
// (which reaches `expo-sqlite/kv-store` at module scope and crashes under
// jest — the reason no test file existed for this module before).
jest.mock("@/i18n", () => ({
  __esModule: true,
  default: {
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  },
}));

import { readCache } from "@/features/family/cache";
import { fetchUsage } from "@/features/usage/api";
import { loadSettings, saveSettings } from "@/features/usage/settings";

import { notify } from "./notify";
import { runUsageCheck } from "./backgroundCheck";

const GB = 1024 ** 3;
const CHILD_ID = "d".repeat(32);
const NOW = 1_700_000_000_000;

const baseSettings = {
  familyRole: "parent",
  pairToken: "t".repeat(32),
  cycleStartDay: 1,
  mobileLimitBytes: null,
  mobileWarnAtPercent: 80,
  wifiLimitBytes: null,
  wifiWarnAtPercent: 80,
  alertedKeys: [],
  childLimits: {},
  childQuietNotifiedAt: {},
  childRequestNotifiedAt: {} as Record<string, number>,
  lastSyncErrorAt: null,
  syncErrorNotifiedAt: null,
};

const emptyUsage = { apps: [], totals: { download: 0, upload: 0, total: 0 }, coverage: null };

/** A child's `recent` row — a real check-in, so `lastSeen` stays fresh and neither the quiet notice nor the limit check has anything to say. */
function recentRow(updatedAt: number): Snapshot {
  return {
    deviceId: CHILD_ID,
    deviceLabel: "Kid",
    kind: "recent",
    day: 0,
    payload: { at: updatedAt },
    updatedAt,
  };
}

function requestRow(payload: unknown, updatedAt: number): Snapshot {
  return { deviceId: CHILD_ID, deviceLabel: "Kid", kind: "request", day: 0, payload, updatedAt };
}

function grantRow(payload: unknown, updatedAt: number): Snapshot {
  return { deviceId: CHILD_ID, deviceLabel: "Kid", kind: "grant", day: 0, payload, updatedAt };
}

/** The one call among possibly several to `notify` whose title is the request notice. */
function findRequestNotify() {
  return (notify as jest.Mock).mock.calls.find(([title]) =>
    String(title).startsWith("family.childRequestTitle")
  );
}

beforeEach(() => {
  (fetchUsage as jest.Mock).mockReset().mockResolvedValue(emptyUsage);
  (readCache as jest.Mock).mockReset();
  (loadSettings as jest.Mock).mockReset();
  (saveSettings as jest.Mock).mockReset().mockResolvedValue(undefined);
  (notify as jest.Mock).mockReset();
});

describe("runUsageCheck — checkChild's request-notification wiring", () => {
  it("notifies once for a new outstanding request, naming the real askedBytes and label", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 2 * GB, at: NOW - 60_000 }, NOW - 55_000),
    ]);

    await runUsageCheck(NOW);

    const call = findRequestNotify();
    expect(call).toBeDefined();
    const [title, body] = call!;
    expect(title).toBe("family.childRequestTitle:" + JSON.stringify({ label: "Kid" }));
    expect(body).toContain('"label":"Kid"');
    expect(body).toContain("2.0 GB"); // formatBytes(2 * GB) — real data reached the string.
  });

  it("uses the request's own payload.at as the notified key, not the row's updatedAt (they differ here)", async () => {
    const payloadAt = NOW - 60_000;
    const rowUpdatedAt = NOW - 55_000; // a few seconds of network latency later
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 2 * GB, at: payloadAt }, rowUpdatedAt),
    ]);

    await runUsageCheck(NOW);

    expect(saveSettings).toHaveBeenCalledWith({
      childRequestNotifiedAt: { [CHILD_ID]: payloadAt },
    });
    expect(saveSettings).not.toHaveBeenCalledWith(
      expect.objectContaining({ childRequestNotifiedAt: { [CHILD_ID]: rowUpdatedAt } })
    );
  });

  it("picks the newest request row when more than one exists for the same child", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 1 * GB, at: NOW - 120_000 }, NOW - 115_000), // older
      requestRow({ askedBytes: 9 * GB, at: NOW - 60_000 }, NOW - 55_000), // newer — should win
    ]);

    await runUsageCheck(NOW);

    const [, body] = findRequestNotify()!;
    expect(body).toContain("9.0 GB");
    expect(body).not.toContain("1.0 GB");
  });

  it("does not notify, and does not crash, when the request payload fails the typeof guards", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      // askedBytes as a string — a malformed or pre-Task-33 row.
      requestRow({ askedBytes: "lots", at: NOW - 60_000 }, NOW - 55_000),
    ]);

    await expect(runUsageCheck(NOW)).resolves.not.toThrow();
    expect(findRequestNotify()).toBeUndefined();
  });

  it("does not re-notify for a request already recorded in childRequestNotifiedAt", async () => {
    const at = NOW - 60_000;
    (loadSettings as jest.Mock).mockResolvedValue({
      ...baseSettings,
      childRequestNotifiedAt: { [CHILD_ID]: at },
    });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 2 * GB, at }, NOW - 55_000),
    ]);

    await runUsageCheck(NOW);

    expect(findRequestNotify()).toBeUndefined();
  });

  it("does not notify when a grant row already answers this exact request (M-7, wiring-level)", async () => {
    const at = NOW - 60_000;
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 2 * GB, at }, NOW - 55_000),
      grantRow({ grantedBytes: 2 * GB, at: NOW - 30_000, requestAt: at }, NOW - 30_000),
    ]);

    await runUsageCheck(NOW);

    expect(findRequestNotify()).toBeUndefined();
  });

  it("does not notify for a cancelled request (askedBytes: 0 — review Finding I-3 item a, fix wave 2)", async () => {
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 0, at: NOW - 60_000 }, NOW - 55_000),
    ]);

    await runUsageCheck(NOW);

    expect(findRequestNotify()).toBeUndefined();
  });

  it("still notifies when a grant exists but answers a different (older, superseded) request", async () => {
    const oldAt = NOW - 200_000;
    const newAt = NOW - 60_000;
    (loadSettings as jest.Mock).mockResolvedValue({ ...baseSettings });
    (readCache as jest.Mock).mockResolvedValue([
      recentRow(NOW - 5 * 60_000),
      requestRow({ askedBytes: 3 * GB, at: newAt }, NOW - 55_000),
      grantRow({ grantedBytes: 1 * GB, at: NOW - 190_000, requestAt: oldAt }, NOW - 190_000),
    ]);

    await runUsageCheck(NOW);

    expect(findRequestNotify()).toBeDefined();
    expect(saveSettings).toHaveBeenCalledWith({
      childRequestNotifiedAt: { [CHILD_ID]: newAt },
    });
  });
});
