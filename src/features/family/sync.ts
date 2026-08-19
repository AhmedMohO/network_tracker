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

/**
 * Every call in and out of the backend goes through here, which is why the
 * success/failure stamps live here rather than in a health module: one place
 * sees every push and every pull.
 *
 * These stamps are not telemetry. A Supabase free project **pauses after one
 * week of inactivity**, and every caller of this function swallows its errors
 * so a failed sync cannot cost the local result. Without a recorded failure
 * time, a paused project is indistinguishable from a quiet family: the parent
 * sees stale numbers forever and nothing ever says why.
 */
async function rpc(name: string, body: Record<string, unknown>): Promise<any> {
  if (!config?.url) throw new Error("family sync is not configured");
  try {
    const res = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: config.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    const text = await res.text();
    await saveSettings({ lastSyncOkAt: Date.now(), lastSyncErrorAt: null });
    return text ? JSON.parse(text) : null;
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
  at: number
) {
  return { ...dailyPayload(apps), totals, context, at };
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
    updatedAt: Date.parse(r.updated_at),
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

  const yesterday = presetRange("yesterday", now).start;
  await pushSnapshot(
    "daily",
    yesterday,
    dailyPayload(await readArchive(yesterday, yesterday + DAY, "ALL"))
  );

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
      now
    )
  );
}
