// `cache.ts` writes through the real `expo-sqlite/kv-store` API surface, which
// jest-expo does not stub (see `fromPayload.ts`'s note on the same issue). A
// tiny in-memory fake stands in for it, same posture as `sync.test.ts` and
// `useFamily.test.ts` mocking their own expo-native dependencies.
const mockStore = new Map<string, string>();
jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
    setItem: (key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    },
  },
}));
jest.mock("@/features/usage/settings", () => ({ loadSettings: jest.fn() }));

import { loadSettings } from "@/features/usage/settings";

import { mergeCache, readCache } from "./cache";
import type { Snapshot } from "./sync";

const asMock = (fn: unknown) => fn as jest.Mock;

const row = (
  deviceId: string,
  kind: Snapshot["kind"],
  day: number,
  updatedAt: number
): Snapshot => ({ deviceId, deviceLabel: "Kid", kind, day, payload: { updatedAt }, updatedAt });

beforeEach(() => {
  mockStore.clear();
  asMock(loadSettings).mockReset().mockResolvedValue({ pairToken: "token1" });
});

describe("readCache", () => {
  it("returns [] when unpaired", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null });
    expect(await readCache()).toEqual([]);
  });

  it("returns [] before anything has ever been cached", async () => {
    expect(await readCache()).toEqual([]);
  });
});

describe("mergeCache", () => {
  it("does nothing and returns [] when unpaired", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null });
    expect(await mergeCache([row("d1", "daily", 0, 100)])).toEqual([]);
    expect(mockStore.size).toBe(0);
  });

  it("stores rows so a later readCache sees them", async () => {
    await mergeCache([row("d1", "daily", 0, 100)]);
    expect(await readCache()).toEqual([row("d1", "daily", 0, 100)]);
  });

  it("keeps distinct rows for different deviceId|kind|day keys", async () => {
    await mergeCache([row("d1", "daily", 0, 100)]);
    const merged = await mergeCache([row("d1", "recent", 0, 100), row("d2", "daily", 0, 100)]);
    expect(merged).toHaveLength(3);
  });

  it("a newer row for the same key replaces the older one", async () => {
    await mergeCache([row("d1", "daily", 0, 100)]);
    const merged = await mergeCache([row("d1", "daily", 0, 200)]);
    expect(merged).toEqual([row("d1", "daily", 0, 200)]);
  });

  it("an older row for the same key never overwrites a newer cached one", async () => {
    await mergeCache([row("d1", "daily", 0, 200)]);
    const merged = await mergeCache([row("d1", "daily", 0, 100)]);
    expect(merged).toEqual([row("d1", "daily", 0, 200)]);
  });

  it("keeps rows cached under a different pair token untouched", async () => {
    await mergeCache([row("d1", "daily", 0, 100)]);
    asMock(loadSettings).mockResolvedValue({ pairToken: "token2" });
    expect(await readCache()).toEqual([]);
    await mergeCache([row("d9", "daily", 0, 50)]);
    asMock(loadSettings).mockResolvedValue({ pairToken: "token1" });
    expect(await readCache()).toEqual([row("d1", "daily", 0, 100)]);
  });
});
