// `cache.ts` writes through the real `expo-sqlite/kv-store` API surface, which
// jest-expo does not stub (see `fromPayload.ts`'s note on the same issue). A
// tiny in-memory fake stands in for it, same posture as `sync.test.ts` and
// `useFamily.test.ts` mocking their own expo-native dependencies.
import { loadSettings } from "@/features/usage/services/settings";
import Storage from 'expo-sqlite/kv-store';

import { mergeCache, readCache } from "./cache";
import type { Snapshot } from "./sync";

const mockStore = new Map<string, string>();
jest.mock("expo-sqlite/kv-store", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => Promise.resolve(mockStore.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      mockStore.set(key, value);
      return Promise.resolve();
    }),
  },
}));
jest.mock("@/features/usage/services/settings", () => ({ loadSettings: jest.fn() }));

const asMock = (fn: unknown) => fn as jest.Mock;

const row = (
  deviceId: string,
  kind: Snapshot["kind"],
  day: number,
  updatedAt: number
): Snapshot => ({ deviceId, deviceLabel: "Kid", kind, day, payload: { updatedAt }, updatedAt });

beforeEach(() => {
  mockStore.clear();
  jest.spyOn(Date, 'now').mockReturnValue(1000);
  asMock(loadSettings).mockReset().mockResolvedValue({ pairToken: "token1" });
});

afterEach(() => jest.restoreAllMocks());

describe("readCache", () => {
  it('does not treat a cleanup write failure as an empty or corrupt cache', async () => {
    jest.mocked(Date.now).mockReturnValue(new Date(2026, 10, 4).getTime());
    const saved = [row('d1', 'daily', 0, 1), row('d1', 'daily', Date.now(), Date.now())];
    mockStore.set('family.cache.token1', JSON.stringify(saved));
    jest.mocked(Storage.setItem).mockRejectedValueOnce(new Error('database busy'));
    await expect(readCache()).rejects.toThrow('database busy');
    expect(JSON.parse(mockStore.get('family.cache.token1')!)).toEqual(saved);
  });
  it('removes daily history older than seven months even without a fresh pull', async () => {
    jest.mocked(Date.now).mockReturnValue(new Date(2026, 10, 4).getTime());
    const cutoff = new Date(2026, 3, 4).getTime();
    const retained = row('d1', 'daily', cutoff, 1);
    mockStore.set('family.cache.token1', JSON.stringify([
      row('d1', 'daily', cutoff - 1, Date.now()), retained,
    ]));
    expect(await readCache()).toEqual([retained]);
    expect(JSON.parse(mockStore.get('family.cache.token1')!)).toEqual([retained]);
  });

  it('ages non-daily snapshots by update time rather than their zero day', async () => {
    jest.mocked(Date.now).mockReturnValue(new Date(2026, 10, 4).getTime());
    const cutoff = new Date(2026, 3, 4).getTime();
    const retained = row('d1', 'recent', 0, Date.now());
    mockStore.set('family.cache.token1', JSON.stringify([
      row('d1', 'request', 0, cutoff - 1), retained,
    ]));
    expect(await readCache()).toEqual([retained]);
  });
  it("returns [] when unpaired", async () => {
    asMock(loadSettings).mockResolvedValue({ pairToken: null });
    expect(await readCache()).toEqual([]);
  });

  it("returns [] before anything has ever been cached", async () => {
    expect(await readCache()).toEqual([]);
  });
});

describe("mergeCache", () => {
  it('does not reintroduce expired rows received from the server', async () => {
    jest.mocked(Date.now).mockReturnValue(new Date(2026, 10, 4).getTime());
    expect(await mergeCache([row('d1', 'daily', new Date(2026, 3, 3).getTime(), Date.now())])).toEqual([]);
  });
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

  it('refreshes a payload whose server timestamp rounded to the cached millisecond', async () => {
    await mergeCache([row('d1', 'recent', 0, 100)]);
    const fresh = { ...row('d1', 'recent', 0, 100), payload: { total: 200 } };
    expect(await mergeCache([fresh])).toEqual([fresh]);
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
