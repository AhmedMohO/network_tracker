import Storage from "expo-sqlite/kv-store";

import { historyCutoff } from '@/features/archive/utils/retention';
import { loadSettings } from "@/features/usage/services/settings";

import type { Snapshot } from "./sync";

/**
 * Keyed by pair token rather than a single fixed key: unpairing and pairing
 * again (a different token) must not resurrect a stale cache from a previous
 * family, and a leftover entry under an old token is simply never read again.
 */
const keyFor = (token: string) => `family.cache.${token}`;

/** One device's one kind's one day is the unit a newer push replaces. */
function mergeKey(row: Snapshot): string {
  return `${row.deviceId}|${row.kind}|${row.day}`;
}

function retainedRows(rows: Snapshot[]): Snapshot[] {
  const cutoff = historyCutoff();
  return rows.filter((r) => (r.kind === 'daily' ? r.day : r.updatedAt) >= cutoff);
}

/**
 * Plain functions, no React: `useChildren` (this device's screens) and
 * Task 30's headless background pull both write and read this same cache,
 * and the background task has no React tree to hook into.
 */
export async function readCache(): Promise<Snapshot[]> {
  const s = await loadSettings();
  if (!s.pairToken) return [];
  const raw = await Storage.getItem(keyFor(s.pairToken));
  if (!raw) return [];
  let saved: Snapshot[];
  let retained: Snapshot[];
  try {
    saved = JSON.parse(raw) as Snapshot[];
    retained = retainedRows(saved);
  } catch {
    // Corrupt value is not worth crashing over; the next pull repopulates it.
    return [];
  }
  if (retained.length < saved.length) {
    await Storage.setItem(keyFor(s.pairToken), JSON.stringify(retained));
  }
  return retained;
}

/**
 * Merges `rows` into the cache for the current pair token — newest
 * `updatedAt` wins per `deviceId|kind|day` — and returns the merged set, so a
 * caller that just pulled fresh rows does not need a second `readCache` to
 * see the result.
 */
export async function mergeCache(rows: Snapshot[]): Promise<Snapshot[]> {
  const s = await loadSettings();
  if (!s.pairToken) return [];

  const existing = await readCache();
  const byKey = new Map(existing.map((r) => [mergeKey(r), r]));
  for (const row of rows) {
    const key = mergeKey(row);
    const current = byKey.get(key);
    if (!current || row.updatedAt >= current.updatedAt) byKey.set(key, row);
  }

  const merged = retainedRows(Array.from(byKey.values()));
  await Storage.setItem(keyFor(s.pairToken), JSON.stringify(merged));
  return merged;
}
