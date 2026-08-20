import type { NetworkFilter } from "@modules/network-usage";

import type { AppUsage } from "@/features/usage/aggregate";

type WireApp = { uid: number; name: string; pkg: string | null; dl: number; ul: number };

/** Shape `dailyPayload`/`recentPayload` (in `./sync`) write to the wire. */
type WirePayload = {
  apps: WireApp[];
  otherBytes: number;
  /** Added by the child's `dailyPayload` when mobile/wifi archive data exists. */
  totals?: { mobile: number; wifi: number };
  /** Per-network app lists, present when the child pushed them. */
  mobileApps?: WireApp[];
  mobileOtherBytes?: number;
  wifiApps?: WireApp[];
  wifiOtherBytes?: number;
  /** `recent` rows only: the child's own clock when the row was built. */
  at?: number;
};

/**
 * A UID Android never assigns (app UIDs start at `FIRST_APP_UID` = 10000;
 * platform UIDs are >= 0), so the synthetic "other apps" row can never
 * collide with a real one.
 */
const OTHER_UID = -100;

/** Converts a wire app list + otherBytes into AppUsage[]. */
function appsFromList(
  apps: WireApp[] | undefined,
  otherBytes: number,
  otherAppsLabel: string
): AppUsage[] {
  if (!Array.isArray(apps)) return [];

  const grandTotal = apps.reduce((sum, a) => sum + a.dl + a.ul, 0) + otherBytes;
  const percentage = (total: number) => (grandTotal === 0 ? 0 : (total / grandTotal) * 100);

  const rows: AppUsage[] = apps.map((a) => {
    const total = a.dl + a.ul;
    return {
      uid: a.uid,
      name: a.name,
      packageName: a.pkg,
      download: a.dl,
      upload: a.ul,
      total,
      foreground: 0,
      background: 0,
      percentage: percentage(total),
    };
  });

  if (otherBytes > 0) {
    rows.push({
      uid: OTHER_UID,
      name: otherAppsLabel,
      packageName: null,
      download: 0,
      upload: 0,
      total: otherBytes,
      foreground: 0,
      background: 0,
      percentage: percentage(otherBytes),
    });
  }

  return rows;
}

/**
 * Inverse of `dailyPayload`: turns a synced payload back into the
 * `AppUsage[]` shape `TotalsCard`, `AppRow` and `UsageChart` already render.
 *
 * When `network` is `"MOBILE"` or `"WIFI"`, returns the per-network app list
 * if it exists in the payload; falls back to the combined `apps` list when
 * the payload predates per-network support. `"ALL"` always returns the
 * combined list.
 *
 * `otherAppsLabel` is the translated name for the trimmed-tail row, supplied
 * by the caller — same reason `toAppUsage` in `features/usage/aggregate`
 * takes an `unknown`/`rename` callback instead of importing `@/i18n`
 * directly: that pulls in `expo-sqlite/kv-store` at module scope (see
 * `src/i18n/index.ts`'s `Storage.getItemSync`), which jest-expo does not
 * stub, and would crash this module's own unmocked unit tests.
 */
export function fromPayload(
  payload: WirePayload | null | undefined,
  otherAppsLabel = "Other apps",
  network: NetworkFilter = "ALL"
): AppUsage[] {
  if (!payload) return [];

  if (network === "MOBILE" && payload.mobileApps) {
    return appsFromList(payload.mobileApps, payload.mobileOtherBytes ?? 0, otherAppsLabel);
  }
  if (network === "WIFI" && payload.wifiApps) {
    return appsFromList(payload.wifiApps, payload.wifiOtherBytes ?? 0, otherAppsLabel);
  }
  // "ALL" or fallback when per-network data is not available.
  return appsFromList(payload.apps, payload.otherBytes ?? 0, otherAppsLabel);
}

/** Sum of one wire list plus its trimmed tail. */
function listTotal(apps: WireApp[], otherBytes: number | undefined): number {
  return apps.reduce((s, a) => s + a.dl + a.ul, 0) + (otherBytes ?? 0);
}

/**
 * Extracts the mobile/wifi network split from a payload, or `null` if the
 * payload does not carry one.
 *
 * Two sources, in order: the explicit `totals` a child writes alongside the
 * lists, and — for a payload that has the per-network *lists* but no
 * `totals` (`loadDayUsage` omits `totals` when both sides read zero) — the
 * sum of those lists. Both lists must be present: deriving `wifi: 0` from a
 * payload that only ever carried `mobileApps` would invent a fact the child
 * never sent, which is the one thing this feature must not do.
 */
export function extractNetworkTotals(
  payload: WirePayload | null | undefined
): { mobile: number; wifi: number } | null {
  if (payload?.totals) {
    const { mobile, wifi } = payload.totals;
    if (typeof mobile === "number" && typeof wifi === "number") return { mobile, wifi };
  }
  if (Array.isArray(payload?.mobileApps) && Array.isArray(payload?.wifiApps)) {
    return {
      mobile: listTotal(payload.mobileApps, payload.mobileOtherBytes),
      wifi: listTotal(payload.wifiApps, payload.wifiOtherBytes),
    };
  }
  return null;
}
