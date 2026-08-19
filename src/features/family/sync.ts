import Constants from "expo-constants";

import { readArchive } from "@/features/archive/db";
import type { AppUsage } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";
import { presetRange } from "@/features/usage/range";
import { loadSettings, saveSettings } from "@/features/usage/settings";

export type SnapshotKind = "daily" | "recent" | "request" | "grant";

export type DeviceContext = {
  foregroundPackage: string | null;
  batteryPercent: number | null;
  connection: "MOBILE" | "WIFI" | "NONE";
};

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

/**
 * Short keys (`dl`/`ul`/`pkg`) because this is written once per day per device
 * and read over a metered connection; the long names buy nothing on the wire.
 * Apps past `MAX_APPS` fold into `otherBytes` rather than being dropped, so the
 * parent's total still equals the child's.
 */
export function dailyPayload(apps: AppUsage[]) {
  const used = apps.filter((a) => a.total > 0).sort((a, b) => b.total - a.total);
  const kept = used.slice(0, MAX_APPS);
  return {
    apps: kept.map((a) => ({
      uid: a.uid, name: a.name, pkg: a.packageName, dl: a.download, ul: a.upload,
    })),
    otherBytes: used.slice(MAX_APPS).reduce((s, a) => s + a.total, 0),
  };
}

export function recentPayload(
  apps: AppUsage[],
  totals: { mobile: number; wifi: number },
  context: DeviceContext | null,
  at: number,
  coverage: { start: number; end: number } | null
) {
  return { ...dailyPayload(apps), totals, context, at, coverage };
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
 * The child's whole contribution: yesterday's completed day, and a `recent` row
 * for today so far. Both are idempotent — the RPC upserts — so a repeated run
 * costs a request and changes nothing.
 *
 * Yesterday comes from the archive rather than a fresh query, because
 * `snapshotDay` has just written it and Android is the slower of the two.
 */
export async function syncFromChild(now: number, context: DeviceContext | null = null) {
  const s = await loadSettings();
  if (s.familyRole !== "child" || !s.pairToken) return;

  await syncRun(async () => {
    // An empty archive means no data for that day, not zero data — the
    // realistic cause is Usage Access having been revoked, and a pushed
    // zero would read as a real quiet day rather than the gap it is. A day
    // that genuinely saw zero traffic across every UID still has rows, so
    // this only skips the case that would otherwise fabricate a figure.
    const yesterday = presetRange("yesterday", now).start;
    const archive = await readArchive(yesterday, yesterday + DAY, "ALL");
    if (archive.length > 0) {
      await pushSnapshot("daily", yesterday, dailyPayload(archive));
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
        all.coverage
      )
    );
  });
}
