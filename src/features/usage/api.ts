import NetworkUsage, {
  type NetworkFilter,
  type SeriesResult,
} from "@modules/network-usage";
import i18n from "@/i18n";
import {
  TETHERING_UID,
  type AppUsage,
  sumUsage,
  toAppUsage,
} from "./aggregate";
import { coverageDrift, type Range } from "./range";

export type { NetworkFilter };

export type UsageResult = {
  apps: AppUsage[];
  totals: { download: number; upload: number; total: number };
  /** The window Android actually covered, when it is not the one requested. */
  coverage: { start: number; end: number } | null;
};

/**
 * Android's synthetic UIDs. The native side labels them in English; naming
 * them here instead keeps them in the user's language.
 */
const SPECIAL_NAMES: Record<number, string> = {
  [-1]: "app.allTraffic",
  [-4]: "app.removedApps",
  [TETHERING_UID]: "app.tethering",
  0: "app.root",
  1000: "app.androidSystem",
  1001: "app.telephony",
};

function specialName(uid: number): string | null {
  const key = SPECIAL_NAMES[uid];
  return key ? i18n.t(key) : null;
}

export function hasUsageAccess(): boolean {
  return NetworkUsage.hasUsageAccess();
}

export function openUsageAccessSettings(): void {
  NetworkUsage.openUsageAccessSettings();
}

/**
 * Opens the system App info screen for a package. Throws when the device has
 * no such activity, so callers handle that rather than letting it crash.
 */
export function openAppDataUsageSettings(packageName: string): void {
  NetworkUsage.openAppDataUsageSettings(packageName);
}

/** Base64 PNG of the app's launcher icon, or null when it has none. */
export function fetchAppIcon(packageName: string): Promise<string | null> {
  return NetworkUsage.getAppIcon(packageName);
}

export async function fetchUsage(
  range: Range,
  network: NetworkFilter
): Promise<UsageResult> {
  const rows = await NetworkUsage.getAppUsage({
    start: range.start,
    end: range.end,
    network,
  });
  const apps = toAppUsage(
    rows,
    (uid) => i18n.t("app.removed", { uid }),
    specialName
  );
  const covered = rows[0];
  return {
    apps,
    totals: sumUsage(apps),
    coverage: covered
      ? coverageDrift(range, covered.coveredStart, covered.coveredEnd)
      : null,
  };
}

export async function fetchSeries(
  range: Range,
  network: NetworkFilter,
  bucketMs: number,
  uid?: number
): Promise<SeriesResult> {
  return NetworkUsage.getSeries({
    start: range.start,
    end: range.end,
    network,
    bucketMs,
    uid: uid ?? null,
  });
}
