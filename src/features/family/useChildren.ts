import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { loadSettings } from "@/features/usage/settings";

import { readCache } from "./cache";
import { recentPayload, refreshCache as pullAndMergeCache, type Snapshot } from "./sync";
import { summarizeChildren } from "./useFamily";

/** The shape `recentPayload` (in `./sync`) builds — see its own doc comment. */
export type RecentPayload = ReturnType<typeof recentPayload>;

export type ChildDevice = {
  deviceId: string;
  label: string;
  lastSeen: number;
  /** This device's newest `recent` heartbeat, or null if it has never pushed one. */
  recent: RecentPayload | null;
  /**
   * `updated_at` of the row `recent` came from — the server's own stamp, which
   * `checkInAt` needs to keep a child's unverified clock from deciding whether
   * a foreground app name is still honest. Null when there is no `recent`.
   */
  recentServerAt: number | null;
};

/**
 * Wraps `sync.ts`'s `refreshCache` (the shared readCache → since → pull →
 * mergeCache logic, also used by Task 30's `pullFromParent`) with the error
 * handling this screen needs: a failed pull is not fatal here, since the
 * caller already has the cached rows on screen with their real "as of" time,
 * and the screen-level "not synced" banner (driven by `lastSyncErrorAt`, set
 * elsewhere) is what tells the user the pull itself is broken.
 */
async function refreshCache(): Promise<Snapshot[]> {
  try {
    return await pullAndMergeCache();
  } catch {
    return readCache();
  }
}

function toChildDevices(snapshots: Snapshot[], ownDeviceId: string | null): ChildDevice[] {
  const rows = ownDeviceId ? snapshots.filter((s) => s.deviceId !== ownDeviceId) : snapshots;

  const newestRecent = new Map<string, { payload: RecentPayload; at: number }>();
  for (const row of rows) {
    if (row.kind !== "recent") continue;
    const existing = newestRecent.get(row.deviceId);
    if (!existing || row.updatedAt > existing.at) {
      newestRecent.set(row.deviceId, { payload: row.payload, at: row.updatedAt });
    }
  }

  return summarizeChildren(rows).map((s) => ({
    deviceId: s.deviceId,
    label: s.label,
    lastSeen: s.lastSeen,
    recent: newestRecent.get(s.deviceId)?.payload ?? null,
    recentServerAt: newestRecent.get(s.deviceId)?.at ?? null,
  }));
}

/**
 * One row per paired child device. Pulls on focus, no interval — the same
 * posture as `useLiveApps` — and reads the cache first so an offline parent
 * still sees the last known state with its real "as of" time rather than an
 * empty screen while the pull is (still) failing.
 *
 * Guarded on `familyRole === 'parent'` before any network call, per this
 * feature's global constraint that an unpaired or non-parent install makes
 * zero network calls.
 */
export function useChildren(): { children: ChildDevice[]; refresh: () => void; loading: boolean } {
  const [children, setChildren] = useState<ChildDevice[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await loadSettings();
      if (s.familyRole !== "parent" || !s.pairToken) {
        setChildren([]);
        setLoading(false);
        return;
      }

      const cached = await readCache();
      setChildren(toChildDevices(cached, s.deviceId));
      setLoading(false);

      const merged = await refreshCache();
      setChildren(toChildDevices(merged, s.deviceId));
    } catch {
      // A cache read failure is not worth crashing the screen over — whatever
      // was already rendered (possibly nothing) stays as the last known
      // state. Also what keeps this an always-resolving promise: `load()` is
      // called bare inside `useFocusEffect` below, which neither awaits nor
      // catches it.
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { children, refresh: load, loading };
}

/**
 * The raw snapshot history for one child device — every kind, not just the
 * summarized `ChildDevice` — for the per-child detail screen's range-based
 * chart and app list. Same cache-first-then-pull posture as `useChildren`.
 */
export function useChildSnapshots(deviceId: string): { snapshots: Snapshot[]; loading: boolean } {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const s = await loadSettings();
      if (s.familyRole !== "parent" || !s.pairToken) {
        setSnapshots([]);
        setLoading(false);
        return;
      }

      const cached = await readCache();
      setSnapshots(cached.filter((r) => r.deviceId === deviceId));
      setLoading(false);

      const merged = await refreshCache();
      setSnapshots(merged.filter((r) => r.deviceId === deviceId));
    } catch {
      // See `useChildren`'s `load` above: same failure posture, same reason.
      setLoading(false);
    }
  }, [deviceId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return { snapshots, loading };
}
