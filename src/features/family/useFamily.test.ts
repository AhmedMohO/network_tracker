// The hook itself needs React to render; this file exercises the plain
// transition functions it wraps, which is where the actual state-machine
// logic (idempotency, unpair ordering) lives. `@/features/usage/settings`
// pulls in expo-sqlite/kv-store, which jest-expo does not mock — mocked here
// the same way `sync.test.ts` mocks it.
jest.mock("@/features/usage/settings", () => ({
  loadSettings: jest.fn(),
  saveSettings: jest.fn(),
}));
jest.mock("./sync", () => ({ forgetPair: jest.fn(), pullSnapshots: jest.fn() }));
jest.mock("expo-device", () => ({ deviceName: null }));
jest.mock("@/i18n", () => ({ __esModule: true, default: { t: (key: string) => key } }));

import * as Device from "expo-device";

import { loadSettings, saveSettings } from "@/features/usage/settings";

import { newPairToken } from "./pair";
import { forgetPair } from "./sync";
import { becomeParent, defaultDeviceLabel, joinAsChild, summarizeChildren, unpair } from "./useFamily";

const asMock = (fn: unknown) => fn as jest.Mock;

beforeEach(() => {
  asMock(loadSettings).mockReset();
  asMock(saveSettings).mockReset().mockImplementation(async (patch: Record<string, unknown>) => patch);
  asMock(forgetPair).mockReset().mockResolvedValue(undefined);
});

describe("defaultDeviceLabel", () => {
  it("falls back to the translated placeholder when the OS reports no device name", () => {
    expect(defaultDeviceLabel()).toBe("family.defaultDeviceLabel");
  });

  it("prefers the OS-reported device name when there is one", () => {
    (Device as any).deviceName = "Pixel 8";
    expect(defaultDeviceLabel()).toBe("Pixel 8");
    (Device as any).deviceName = null;
  });
});

describe("becomeParent", () => {
  it("mints a token and device id for a fresh install", async () => {
    asMock(loadSettings).mockResolvedValue({ familyRole: null, pairToken: null });
    await becomeParent("Dad's phone");
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        familyRole: "parent",
        deviceLabel: "Dad's phone",
        pairToken: expect.stringMatching(/^[0-9a-f]{32}$/),
        deviceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      })
    );
  });

  it("is idempotent: an already-paired parent keeps its existing token rather than orphaning its children", async () => {
    const existing = { familyRole: "parent", pairToken: "t".repeat(32), deviceId: "d".repeat(32) };
    asMock(loadSettings).mockResolvedValue(existing);
    const result = await becomeParent("New label");
    expect(saveSettings).not.toHaveBeenCalled();
    expect(result).toBe(existing);
  });
});

describe("joinAsChild", () => {
  it("stores the token, mints a device id and records the parent's label", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null, deviceLabel: null });
    const token = newPairToken();
    await joinAsChild(token, "Dad's phone");
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        familyRole: "child",
        pairToken: token,
        pairedLabel: "Dad's phone",
        deviceId: expect.stringMatching(/^[0-9a-f]{32}$/),
      })
    );
  });

  it("is idempotent: retapping the same link makes no write and mints no second device id", async () => {
    const token = "a".repeat(32);
    asMock(loadSettings).mockResolvedValue({ pairToken: token, deviceId: "existing-device" });
    await joinAsChild(token, "Dad's phone");
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("keeps an existing device label rather than overwriting it with the default", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null, deviceLabel: "My phone" });
    await joinAsChild("b".repeat(32), "Mum's phone");
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ deviceLabel: "My phone" }));
  });

  it("refuses a different token when already paired as a child, rather than switching families", async () => {
    const oldToken = "a".repeat(32);
    const newToken = "b".repeat(32);
    asMock(loadSettings).mockResolvedValue({
      familyRole: "child",
      pairToken: oldToken,
      deviceId: "existing-device",
    });
    await expect(joinAsChild(newToken, "New parent")).rejects.toThrow();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("refuses a child link when this device is itself a parent, rather than demoting it", async () => {
    const parentToken = "c".repeat(32);
    const childToken = "d".repeat(32);
    asMock(loadSettings).mockResolvedValue({
      familyRole: "parent",
      pairToken: parentToken,
      deviceId: "parent-device",
    });
    await expect(joinAsChild(childToken, "Sibling's phone")).rejects.toThrow();
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("unpair", () => {
  it("deletes server-side before clearing local state", async () => {
    const calls: string[] = [];
    asMock(loadSettings).mockResolvedValue({ pairToken: "t".repeat(32) });
    asMock(forgetPair).mockImplementation(async () => {
      calls.push("forget");
    });
    asMock(saveSettings).mockImplementation(async () => {
      calls.push("save");
      return {};
    });
    await unpair();
    expect(calls).toEqual(["forget", "save"]);
    expect(forgetPair).toHaveBeenCalledWith("t".repeat(32));
    expect(saveSettings).toHaveBeenCalledWith({
      familyRole: null,
      pairToken: null,
      deviceId: null,
      deviceLabel: null,
      pairedLabel: null,
      lastSyncOkAt: null,
      lastSyncErrorAt: null,
      syncErrorNotifiedAt: null,
      backfillDoneUntil: null,
      pendingLimitRequest: null,
      appliedGrantRequestAt: null,
      // Without this, re-pairing would find `registerPushToken`'s
      // already-registered short-circuit still satisfied and never tell the
      // new family's server about this device.
      pushToken: null,
    });
  });

  it("does not clear local state when the RPC fails, so the user can retry", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: "t".repeat(32) });
    asMock(forgetPair).mockRejectedValue(new Error("network down"));
    await expect(unpair()).rejects.toThrow("network down");
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it("does nothing when already unpaired", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null });
    await unpair();
    expect(forgetPair).not.toHaveBeenCalled();
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

describe("summarizeChildren", () => {
  it("keeps one row per device, the most recent snapshot", () => {
    const rows = summarizeChildren([
      { deviceId: "d1", deviceLabel: "Kid A", kind: "daily", day: 0, payload: {}, updatedAt: 100 },
      { deviceId: "d1", deviceLabel: "Kid A", kind: "recent", day: 0, payload: {}, updatedAt: 200 },
      { deviceId: "d2", deviceLabel: "Kid B", kind: "recent", day: 0, payload: {}, updatedAt: 150 },
    ]);
    expect(rows).toEqual([
      { deviceId: "d1", label: "Kid A", lastSeen: 200 },
      { deviceId: "d2", label: "Kid B", lastSeen: 150 },
    ]);
  });

  it("returns an empty list rather than throwing on no snapshots", () => {
    expect(summarizeChildren([])).toEqual([]);
  });

  it("does not let a grant row (the parent's answer, written under the child's own deviceId) move lastSeen (review Finding N-1)", () => {
    const rows = summarizeChildren([
      { deviceId: "d1", deviceLabel: "Kid A", kind: "recent", day: 0, payload: {}, updatedAt: 200 },
      // The parent's grant lands *after* the child's last real check-in and
      // carries the parent's own cached label — must not win either field.
      { deviceId: "d1", deviceLabel: "Dad's phone", kind: "grant", day: 0, payload: {}, updatedAt: 9_999 },
    ]);
    expect(rows).toEqual([{ deviceId: "d1", label: "Kid A", lastSeen: 200 }]);
  });

  it("still counts a request row as a real check-in — only grant is skipped", () => {
    const rows = summarizeChildren([
      { deviceId: "d1", deviceLabel: "Kid A", kind: "recent", day: 0, payload: {}, updatedAt: 200 },
      { deviceId: "d1", deviceLabel: "Kid A", kind: "request", day: 0, payload: {}, updatedAt: 300 },
    ]);
    expect(rows).toEqual([{ deviceId: "d1", label: "Kid A", lastSeen: 300 }]);
  });

  it("a device with only a grant row (never itself pushed anything) does not appear at all", () => {
    expect(
      summarizeChildren([
        { deviceId: "d1", deviceLabel: "Dad's phone", kind: "grant", day: 0, payload: {}, updatedAt: 100 },
      ])
    ).toEqual([]);
  });
});
