import Constants from "expo-constants";

import type { NetworkUsageModule } from "@modules/network-usage";

import { readArchive, snapshotDay } from "@/features/archive/db";
import type { AppUsage } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";
import { presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";

import { mergeCache, readCache } from "./cache";

export type SnapshotKind = "daily" | "recent" | "request" | "grant";

/**
 * `import type` only — erased at compile time, so this never pulls the native
 * module into scope at runtime (same pattern `fromPayload.ts`/`dailySeries.ts`
 * already use for `NetworkFilter`). Derived from `NetworkUsageModule` itself
 * rather than hand-copied, so the wire type and the native return type cannot
 * drift apart the way they did until this task.
 */
export type DeviceContext = ReturnType<NetworkUsageModule["getDeviceContext"]>;

export type Snapshot = {
  deviceId: string;
  deviceLabel: string;
  kind: SnapshotKind;
  day: number;
  payload: any;
  updatedAt: number;
};

/** More than this and the payload stops being a few KB. */
const MAX_APPS = 50;
const DAY = 86_400_000;

const config = (Constants.expoConfig?.extra as any)?.family as
  | { url: string; anonKey: string }
  | undefined;

/** The transport for one RPC call. No stamping here — see `syncRun`. */
async function rpc(name: string, body: Record<string, unknown>): Promise<any> {
  if (!config?.url) throw new Error("family sync is not configured");
  const res = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Stamps a whole sync *run* — one or more `rpc` calls treated as a unit —
 * rather than any single call inside it. `syncFromChild` makes two pushes per
 * run; stamping per-call let one call's success paper over the other's
 * failure, since a `daily` success cleared `lastSyncErrorAt` moments before a
 * `recent` failure re-set it to ~now. `lastSyncErrorAt` never aged past one
 * background interval and the two-day sync-broken notice could never fire.
 * A run now counts as successful only if every call inside `fn` does.
 *
 * Exported so a future parent-side pull (Phase 9) wraps itself in the same
 * function instead of re-deriving this.
 */
export async function syncRun(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    await saveSettings({ lastSyncOkAt: Date.now(), lastSyncErrorAt: null });
  } catch (e) {
    // Only the *first* failure of a run of failures is stamped, so the age of
    // this value answers "how long has sync been broken" rather than "when did
    // it last retry".
    const s = await loadSettings();
    if (s.lastSyncErrorAt === null) await saveSettings({ lastSyncErrorAt: Date.now() });
    throw e;
  }
}

/** Compresses an `AppUsage[]` into the short-key wire format, capping at `MAX_APPS`. */
function compressApps(apps: AppUsage[]) {
  const used = apps.filter((a) => a.total > 0).sort((a, b) => b.total - a.total);
  const kept = used.slice(0, MAX_APPS);
  return {
    list: kept.map((a) => ({
      uid: a.uid, name: a.name, pkg: a.packageName, dl: a.download, ul: a.upload,
    })),
    otherBytes: used.slice(MAX_APPS).reduce((s, a) => s + a.total, 0),
  };
}

/**
 * Short keys (`dl`/`ul`/`pkg`) because this is written once per day per device
 * and read over a metered connection; the long names buy nothing on the wire.
 * Apps past `MAX_APPS` fold into `otherBytes` rather than being dropped, so the
 * parent's total still equals the child's.
 *
 * `mobileApps`/`wifiApps`, when supplied, let the parent filter the child's
 * app list by network type — matching the `NetworkFilterTabs` the user already
 * has on their own dashboard.
 */
export function dailyPayload(
  allApps: AppUsage[],
  extras?: {
    mobileApps?: AppUsage[];
    wifiApps?: AppUsage[];
    totals?: { mobile: number; wifi: number };
  }
) {
  const all = compressApps(allApps);
  const m = extras?.mobileApps && compressApps(extras.mobileApps);
  const w = extras?.wifiApps && compressApps(extras.wifiApps);
  return {
    apps: all.list,
    otherBytes: all.otherBytes,
    ...(extras?.totals ? { totals: extras.totals } : {}),
    ...(m ? { mobileApps: m.list, mobileOtherBytes: m.otherBytes } : {}),
    ...(w ? { wifiApps: w.list, wifiOtherBytes: w.otherBytes } : {}),
  };
}

/**
 * Today so far. Carries the same `mobileApps`/`wifiApps` lists a `daily` row
 * does — `syncFromChild` already queries all three networks to build the
 * scalar `totals`, so keeping the per-network lists it was throwing away
 * costs no extra native query, and it is the only way the parent's
 * `NetworkFilterTabs` can filter today at all.
 */
export function recentPayload(
  apps: AppUsage[],
  totals: { mobile: number; wifi: number },
  context: DeviceContext | null,
  at: number,
  coverage: { start: number; end: number } | null,
  perNetwork?: { mobileApps: AppUsage[]; wifiApps: AppUsage[] }
) {
  return { ...dailyPayload(apps, perNetwork), totals, context, at, coverage };
}

/** No-ops when unpaired. Every caller relies on that; do not add a throw. */
export async function pushSnapshot(kind: SnapshotKind, day: number, payload: unknown) {
  const s = await loadSettings();
  if (!s.pairToken || !s.deviceId) return;
  await rpc("family_push", {
    p_token: s.pairToken,
    p_device: s.deviceId,
    p_label: s.deviceLabel ?? "",
    p_kind: kind,
    p_day: day,
    p_payload: payload,
  });
}

/**
 * PostgREST renders a `timestamptz` with however many fractional-second
 * digits Postgres kept after trimming trailing zeros — six on a fresh write,
 * fewer once it happens to end in zero, none on an exact second. The
 * ECMAScript Date Time String Format specifies exactly three; more is
 * implementation-defined, and Hermes is not V8. Truncating to three before
 * `Date.parse` means every row parses the same way regardless of how many
 * digits Postgres happened to keep, instead of a hand test passing on one row
 * and returning `NaN` on the next.
 */
export function parseTimestamptz(iso: string): number {
  return Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
}

export async function pullSnapshots(since = 0): Promise<Snapshot[]> {
  const s = await loadSettings();
  if (!s.pairToken) return [];
  const rows: any[] = await rpc("family_pull", {
    p_token: s.pairToken,
    p_since: new Date(since).toISOString(),
  });
  return (rows ?? []).map((r) => ({
    deviceId: r.device_id,
    deviceLabel: r.device_label,
    kind: r.kind,
    day: r.day,
    payload: r.payload,
    updatedAt: parseTimestamptz(r.updated_at),
  }));
}

export async function forgetPair(token: string) {
  await rpc("family_forget", { p_token: token });
}

/**
 * Loads a day's per-network usage: tries the local archive first (populated
 * by `snapshotDay`), falls back to live `fetchUsage` from Android when the
 * archive is empty. This is the critical fix for immediate sync after
 * pairing, where `snapshotDay` has not yet run.
 */
async function loadDayUsage(dayStart: number) {
  const range = { start: dayStart, end: dayStart + DAY, preset: "custom" as const };

  let allApps = await readArchive(dayStart, dayStart + DAY, "ALL");
  let mobileApps = await readArchive(dayStart, dayStart + DAY, "MOBILE");
  let wifiApps = await readArchive(dayStart, dayStart + DAY, "WIFI");

  // Archive empty → fall back to live query (Android retains ~30 days).
  if (allApps.length === 0) {
    const all = await fetchUsage(range, "ALL");
    allApps = all.apps;
  }
  if (mobileApps.length === 0) {
    const mob = await fetchUsage(range, "MOBILE");
    mobileApps = mob.apps;
  }
  if (wifiApps.length === 0) {
    const wif = await fetchUsage(range, "WIFI");
    wifiApps = wif.apps;
  }

  const mobile = mobileApps.reduce((s, a) => s + a.total, 0);
  const wifi = wifiApps.reduce((s, a) => s + a.total, 0);
  const totals = mobile > 0 || wifi > 0 ? { mobile, wifi } : undefined;

  return { allApps, mobileApps, wifiApps, totals };
}

/**
 * The child's whole contribution: yesterday's completed day, and a `recent` row
 * for today so far. Both are idempotent — the RPC upserts — so a repeated run
 * costs a request and changes nothing.
 */
export async function syncFromChild(now: number, context: DeviceContext | null = null) {
  const s = await loadSettings();
  if (s.familyRole !== "child" || !s.pairToken) return;

  await syncRun(async () => {
    const yesterday = presetRange("yesterday", now).start;
    const day = await loadDayUsage(yesterday);

    if (day.allApps.length > 0) {
      await pushSnapshot(
        "daily",
        yesterday,
        dailyPayload(day.allApps, {
          mobileApps: day.mobileApps,
          wifiApps: day.wifiApps,
          totals: day.totals,
        })
      );
    }

    const today = presetRange("today", now);
    const mobile = await fetchUsage(today, "MOBILE");
    const wifi = await fetchUsage(today, "WIFI");
    const all = await fetchUsage(today, "ALL");
    await pushSnapshot(
      "recent",
      0,
      recentPayload(
        all.apps,
        { mobile: mobile.totals.total, wifi: wifi.totals.total },
        context,
        now,
        all.coverage,
        { mobileApps: mobile.apps, wifiApps: wifi.apps }
      )
    );
  });
}

/**
 * `readCache` → the cache's own newest row as the pull cursor → `pullSnapshots`
 * → `mergeCache`. Shared by `useChildren.ts` (a failed pull there falls back
 * to the cached rows already on screen — see its own wrapper) and
 * `pullFromParent` below (a failed pull there must propagate, so `syncRun`
 * can stamp it) — each wraps this in the error handling its caller needs
 * rather than re-deriving the since-cursor logic.
 */
export async function refreshCache(): Promise<Snapshot[]> {
  const cached = await readCache();
  const since = cached.reduce((max, r) => Math.max(max, r.updatedAt), 0);
  const fresh = await pullSnapshots(since);
  return fresh.length > 0 ? await mergeCache(fresh) : cached;
}

/**
 * The parent's mirror of `syncFromChild`: pulls whatever every paired child
 * has pushed since this device's cache last saw, on the same 15-minute
 * `USAGE_CHECK_TASK` both roles already run on. `since` is not an
 * optimisation — a parent re-pulling 90 days of rows every 15 minutes is
 * ~3.3 GB/month against a 5 GB free-tier egress cap; pulling deltas is
 * ~42 MB. Wrapped in `syncRun` so a paused Supabase project surfaces through
 * the same two-day sync-broken notice the child already has.
 */
export async function pullFromParent(now: number): Promise<void> {
  const s = await loadSettings();
  if (s.familyRole !== "parent" || !s.pairToken) return;
  await syncRun(async () => {
    await refreshCache();
  });
}

/** Maximum number of days to backfill on first pair. */
const BACKFILL_DAYS = 30;

/**
 * Pushes up to `BACKFILL_DAYS` of daily data to the server, so the parent has
 * history for "Last 7 days"/"Last 30 days" instead of only the single day
 * `syncFromChild` pushes per run. Each push is an upsert, so re-running is
 * safe. Populates the local archive via `snapshotDay` first (if empty), then
 * pushes. Best-effort per day: failures skip silently.
 *
 * **Resumable, and that is the point.** This is ~30 iterations of five
 * sequential NetworkStatsManager queries plus an HTTP POST — minutes of work,
 * far longer than the JS context is guaranteed to live. It used to be started
 * fire-and-forget on the line before `reloadAppAsync()`, which tore the
 * context down mid-loop and left the parent holding one day of history
 * forever. `backfillDoneUntil` records the oldest day already pushed, so a
 * killed run resumes from where it stopped on the next app start rather than
 * restarting from day 1 and dying in the same place again.
 */
export async function backfillFromChild(now: number): Promise<void> {
  const s = await loadSettings();
  if (s.familyRole !== "child" || !s.pairToken) return;

  const todayStart = presetRange("today", now).start;
  const oldestWanted = todayStart - BACKFILL_DAYS * DAY;
  if (s.backfillDoneUntil !== null && s.backfillDoneUntil <= oldestWanted) return;

  for (let i = 1; i <= BACKFILL_DAYS; i++) {
    const dayStart = todayStart - i * DAY;
    // Resume: everything at or below this was pushed by an earlier run.
    if (s.backfillDoneUntil !== null && dayStart >= s.backfillDoneUntil) continue;
    try {
      // Ensure the archive is populated for this day (idempotent).
      const existing = await readArchive(dayStart, dayStart + DAY, "ALL");
      if (existing.length === 0) {
        try { await snapshotDay(dayStart); } catch { /* Android may not have data this old */ }
      }

      const day = await loadDayUsage(dayStart);
      if (day.allApps.length === 0) continue;
      await pushSnapshot(
        "daily",
        dayStart,
        dailyPayload(day.allApps, {
          mobileApps: day.mobileApps,
          wifiApps: day.wifiApps,
          totals: day.totals,
        })
      );
    } catch {
      // Best-effort per day: skip failures silently.
    }
    // Stamped after every day, not once at the end: a run killed halfway
    // must not lose the days it did push.
    await saveSettings({ backfillDoneUntil: dayStart });
  }
}
