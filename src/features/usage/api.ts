import NetworkUsage, {
  type NetworkFilter,
  type SeriesResult,
} from "@modules/network-usage";
import { type AppUsage, sumUsage, toAppUsage } from "./aggregate";
import { coverageNote, type Range } from "./range";

export type { NetworkFilter };

export type UsageResult = {
  apps: AppUsage[];
  totals: { download: number; upload: number; total: number };
  note: string | null;
};

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

export async function fetchUsage(
  range: Range,
  network: NetworkFilter
): Promise<UsageResult> {
  const rows = await NetworkUsage.getAppUsage({
    start: range.start,
    end: range.end,
    network,
  });
  const apps = toAppUsage(rows);
  const covered = rows[0];
  return {
    apps,
    totals: sumUsage(apps),
    note: covered
      ? coverageNote(range, covered.coveredStart, covered.coveredEnd)
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
