import Constants from "expo-constants";

import NetworkUsage, { type NetworkUsageModule } from "@modules/network-usage";

import { readArchive, snapshotDay } from "@/features/archive/db";
import type { AppUsage } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";
import { presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";
import {
  fetchWifiNetworkUsage,
  isWifiWatchEnabled,
} from "@/features/usage/wifiNetworks";
import type { WifiNetworkSlice } from "@/features/usage/wifiSlices";

import { mergeCache, readCache } from "./cache";
import { applyGrant, isRequestExpired, type GrantPayload } from "./request";

export type SnapshotKind = "daily" | "recent" | "request" | "grant";

/**
 * Derived from `NetworkUsageModule` itself rather than hand-copied, so the
 * wire type and the native return type cannot drift apart.
 *
 * The module is now imported for its value too (`syncFromChild` probes the
 * context itself — see there). That adds no module-scope native surface this
 * file did not already have: `@/features/usage/api`, imported two lines up,
 * has the same default import at *its* line 1. The object is inert on import
 * on every platform — the Android entry point only calls `requireNativeModule`,
 * and the iOS/web entry points export the `unavailable` stub, which throws on
 * invocation and not before.
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
/** A device on more than this many Wi-Fi networks in one day is an outlier. */
const MAX_NETWORKS = 20;
const DAY = 86_400_000;

/**
 * Safety margin subtracted from `pendingLimitRequest.at` before using it as
 * the pull cursor for an answered grant. `at` is the *child's own* clock, not
 * verified by anything (same caveat `checkInAt` in `features/family/context.ts`
 * documents at length) — a clock running fast would set a cursor after the
 * grant's real server timestamp and silently miss it forever. An hour is far
 * more than any believable clock drift while still keeping the pull to a
 * handful of rows, not the family's whole history.
 */
const GRANT_LOOKBACK_MS = 60 * 60 * 1000;

const config = (Constants.expoConfig?.extra as any)?.family as
  | { url: string; anonKey: string }
  | undefined;

/**
 * The transport for one RPC call. No stamping here — see `syncRun`.
 *
 * Exported for `pushToken.ts`, which registers this device's push token
 * through the same `/rest/v1/rpc` endpoint and must not re-derive the config
 * lookup, the header set or the error handling.
 */
export async function rpc(name: string, body: Record<string, unknown>): Promise<any> {
  if (!config?.url) throw new Error("family sync is not configured");
  const res = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: config.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    console.warn(`[family] rpc ${name} failed: ${res.status}`, errBody);
    throw new Error(`${name}: ${res.status}`);
  }
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
    wifiNetworks?: WifiNetworkSlice[];
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
    ...(extras?.wifiNetworks
      ? { wifiNetworks: compressWifiNetworks(extras.wifiNetworks) }
      : {}),
  };
}

/**
 * The Wi-Fi split as network *name* and byte totals — no app list per network.
 *
 * The per-app breakdown already ships twice (combined and per transport);
 * adding a third copy per network would multiply the payload by however many
 * networks the child has been on, for a screen the parent reads as "how much
 * at home, how much elsewhere". Names only, totals only.
 *
 * This is the one field in the whole payload that says something about *where*
 * the child was — a home SSID identifies a home — which is why it ships only
 * when the child has switched per-network tracking on for themselves, and why
 * `family.whatIsShared` names it explicitly. A child who never enabled it
 * sends nothing here and the parent's screen falls back to the plain Wi-Fi
 * total, exactly as before.
 */
function compressWifiNetworks(networks: WifiNetworkSlice[]) {
  return networks
    .filter((n) => n.totals.total > 0)
    .sort((a, b) => b.totals.total - a.totals.total)
    .slice(0, MAX_NETWORKS)
    .map((n) => ({ ssid: n.ssid, dl: n.totals.download, ul: n.totals.upload }));
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
  perNetwork?: {
    mobileApps: AppUsage[];
    wifiApps: AppUsage[];
    wifiNetworks?: WifiNetworkSlice[];
  }
) {
  return { ...dailyPayload(apps, perNetwork), totals, context, at, coverage };
}

/**
 * No-ops when unpaired. Every caller relies on that; do not add a throw.
 *
 * `target`, when given, writes the row under a *different* device's id/label
 * than this device's own — the one case that needs it is the parent writing
 * a `grant` row: `family_snapshots`' primary key is
 * `(pair_token, device_id, kind, day)`, and both readers (`syncFromChild`
 * below, and `[deviceId].tsx`'s own `snapshots` filter) look a `grant` up by
 * the *child's* `device_id`, not the pusher's. Writing it under the parent's
 * own id (the pre-Task-33-review-fix behaviour) meant the predicate the child
 * checks could never match, and collapsed every child's grant into one row.
 * `family_push`'s `p_device`/`p_label` are plain parameters with no
 * server-side pinning to the caller (`docs/family-schema.sql`), so this is a
 * client-only change — confirmed against the RPC definition, no migration.
 */
export async function pushSnapshot(
  kind: SnapshotKind,
  day: number,
  payload: unknown,
  target?: { deviceId: string; deviceLabel: string }
) {
  const s = await loadSettings();
  if (!s.pairToken || !s.deviceId) return;
  await rpc("family_push", {
    p_token: s.pairToken,
    p_device: target?.deviceId ?? s.deviceId,
    p_label: target?.deviceLabel ?? (s.deviceLabel ?? ""),
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

  // Live rather than from the archive: `snapshotDay` writes the archive's
  // per-network rows from this same source, and reading them back here would
  // report `null` for a day whose snapshot has not run yet — which a parent
  // would read as "we don't know", not "not archived yet".
  const wifiNetworks = isWifiWatchEnabled()
    ? (await fetchWifiNetworkUsage(range)).networks
    : undefined;

  return { allApps, mobileApps, wifiApps, totals, wifiNetworks };
}

/**
 * The child's whole contribution: yesterday's completed day, and a `recent` row
 * for today so far. Both are idempotent — the RPC upserts — so a repeated run
 * costs a request and changes nothing.
 */
export async function syncFromChild(now: number) {
  const s = await loadSettings();
  if (s.familyRole !== "child" || !s.pairToken) return;

  // Probed here rather than passed in by the caller, for three reasons. The
  // `recent` row is upserted whole (`payload = excluded.payload`), so a push
  // that carried no context erased whatever the last one sent — with the probe
  // here, all four push paths carry one and the disclosure's "with each of
  // today's more frequent updates" is true. It sits after the role guard, so a
  // parent or unpaired device never reads its own foreground app for a value
  // nothing will transmit. And it is its own `try`: a throw — an old APK
  // without the native method after a JS-only OTA, an absent system service —
  // must cost the push nothing. Evaluated as a call argument it skipped
  // `syncRun` entirely, so `lastSyncErrorAt` was never stamped and the
  // two-day sync-broken notice could not fire on a sync that had stopped dead.
  let context: DeviceContext | null = null;
  try {
    context = NetworkUsage.getDeviceContext();
  } catch (e) {
    console.warn('[family] getDeviceContext failed (non-fatal):', e);
  }

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
          wifiNetworks: day.wifiNetworks,
        })
      );
    }

    const today = presetRange("today", now);
    const mobile = await fetchUsage(today, "MOBILE");
    const wifi = await fetchUsage(today, "WIFI");
    const all = await fetchUsage(today, "ALL");
    const todayNetworks = isWifiWatchEnabled()
      ? (await fetchWifiNetworkUsage(today)).networks
      : undefined;
    await pushSnapshot(
      "recent",
      0,
      recentPayload(
        all.apps,
        { mobile: mobile.totals.total, wifi: wifi.totals.total },
        context,
        now,
        all.coverage,
        {
          mobileApps: mobile.apps,
          wifiApps: wifi.apps,
          wifiNetworks: todayNetworks,
        }
      )
    );

    // Task 33: check whether the parent has answered an outstanding "ask for
    // more data" request. Gated on `pendingLimitRequest` so a device with
    // nothing outstanding makes no extra call. Kept inside this same
    // `syncRun` call so a failed pull marks the run failed like any other
    // network step here.
    if (s.pendingLimitRequest) {
      // ponytail: `family_pull` (docs/family-schema.sql) has no per-device or
      // per-kind filter, so every call here downloads every family member's
      // rows updated since the cursor below — every sibling's `recent`
      // payload (up to 50 apps, names, package names) included, on this
      // device's own connection, for as long as a request stays outstanding.
      // Bounded by `REQUEST_TTL_MS`, not eliminated — and the bound is worse
      // than "a handful": the cursor below is fixed at the *request's* own
      // timestamp and does not advance between calls, so this is not a
      // sliding ~`GRANT_LOOKBACK_MS` window — every 15-minute cycle re-pulls
      // the *entire* span since the request was made, larger call over call,
      // for up to `REQUEST_TTL_MS` / 15 min ≈ 288 calls before this gives up
      // (review Finding I-4; corrected from an earlier, wrong "handful of
      // pulls" claim — the disposition to accept this without a migration is
      // unchanged, only the estimate was). A real fix needs a narrower RPC
      // (filtered by device/kind) or a cursor that advances between calls —
      // either is more than a one-line change — raise it if this ever bites
      // a real metered plan.
      const rows = await pullSnapshots(s.pendingLimitRequest.at - GRANT_LOOKBACK_MS);
      const grantRow = rows
        .filter((r) => r.kind === "grant" && r.deviceId === s.deviceId)
        // Newest first — matches `[deviceId].tsx` and `backgroundCheck.ts`'s
        // identical tie-break (review Finding M-6). Harmless while the PK
        // guarantees one grant row per child, but it is the correct
        // tie-break if that ever stops being true.
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];
      // Known edge case (review Finding I-3, item b), not fixed: if this
      // device cancelled a request and then re-asked within
      // `GRANT_LOOKBACK_MS`, a grant answering the *cancelled* request can
      // still be pulled in here and applied — `applyGrant` only checks
      // `requestAt` against what has already been applied, not against
      // whether the request it answers is the one currently pending. The
      // parent really did grant a real ask the child made, so the limit
      // rising is not "wrong" so much as surprising to a child who thought
      // cancelling ended the story. Narrow window (within one
      // `GRANT_LOOKBACK_MS` of a cancel-then-re-ask) and low stakes (the
      // limit only ever rises, never falls, from an amount the child did
      // ask for at some point) — left as documented behaviour, not fixed.
      const grant: GrantPayload | undefined =
        grantRow &&
        typeof grantRow.payload?.grantedBytes === "number" &&
        typeof grantRow.payload?.requestAt === "number"
          ? grantRow.payload
          : undefined;

      if (grant) {
        const outcome = applyGrant(
          grant,
          s.pendingLimitRequest.at,
          s.appliedGrantRequestAt,
          s.mobileLimitBytes
        );
        await saveSettings({
          ...(outcome.clearPending ? { pendingLimitRequest: null } : {}),
          appliedGrantRequestAt: outcome.appliedRequestAt,
          ...(outcome.apply ? { mobileLimitBytes: outcome.newLimitBytes } : {}),
        });
      } else if (isRequestExpired(s.pendingLimitRequest.at, now)) {
        // Review Finding I-3: an unanswered request cannot wait forever —
        // clear it so the child's card gets its "Ask for more data" button
        // back, and so this block stops pulling on every future sync. Checked
        // *after* the pull above (review Finding I-3, item c) rather than
        // before, so a grant that lands in the same cycle a request finally
        // expires is still applied instead of silently dropped — this costs
        // at most one extra pull over the request's whole lifetime, not one
        // per cycle, since `pendingLimitRequest` is cleared here either way.
        await saveSettings({ pendingLimitRequest: null });
      }
    }
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
          wifiNetworks: day.wifiNetworks,
        })
      );
    } catch (e) {
      console.warn(`[family] backfill day ${dayStart} failed:`, e);
    }
    // Stamped after every day, not once at the end: a run killed halfway
    // must not lose the days it did push.
    await saveSettings({ backfillDoneUntil: dayStart });
  }
}
