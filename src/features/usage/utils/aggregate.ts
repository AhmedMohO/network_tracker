import type { AppUsageRow } from "@modules/network-usage";

export type AppUsage = {
  uid: number;
  name: string;
  packageName: string | null;
  download: number;
  upload: number;
  total: number;
  foreground: number;
  background: number;
  percentage: number;
};

export type UsageDelta = {
  uid: number;
  name: string;
  current: number;
  previous: number;
  changePercent: number | null;
};

/** Fallback for a UID Android no longer has a package or label for. */
export type UnknownName = (uid: number) => string;

const defaultUnknown: UnknownName = (uid) => `Removed app (UID ${uid})`;

export function displayName(
  row: AppUsageRow,
  unknown: UnknownName = defaultUnknown
): string {
  if (row.label) return row.label;
  if (row.packages.length > 0) return row.packages[0];
  // Happens when the app was uninstalled after the traffic was recorded.
  return unknown(row.uid);
}

/**
 * `unknown` and `rename` let the caller supply translated text without this
 * module — which is pure and unit-tested — reaching for the i18n instance.
 */
export function toAppUsage(
  rows: AppUsageRow[],
  unknown: UnknownName = defaultUnknown,
  rename: (uid: number) => string | null = () => null
): AppUsage[] {
  const grandTotal = rows.reduce((sum, r) => sum + r.rxBytes + r.txBytes, 0);

  return rows
    .map((r) => {
      const total = r.rxBytes + r.txBytes;
      const foreground = r.rxForegroundBytes + r.txForegroundBytes;
      return {
        uid: r.uid,
        name: rename(r.uid) ?? displayName(r, unknown),
        packageName: r.packages[0] ?? null,
        download: r.rxBytes,
        upload: r.txBytes,
        total,
        foreground,
        background: Math.max(0, total - foreground),
        percentage: grandTotal === 0 ? 0 : (total / grandTotal) * 100,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Android assigns app UIDs from 10000 up; anything below is platform-owned. */
export const FIRST_APP_UID = 10000;
/** `NetworkStats.Bucket.UID_TETHERING` — hotspot and USB tethering traffic. */
export const TETHERING_UID = -5;

/**
 * Splits the rows into the ones the list shows and the ones only the totals
 * card discloses. Tethering is never hidden: hotspot traffic is a line item
 * users go looking for, and Android's own Data usage screen shows it.
 */
export function partitionApps(
  apps: AppUsage[],
  showSystemApps: boolean
): { visible: AppUsage[]; hidden: AppUsage[] } {
  if (showSystemApps) return { visible: apps, hidden: [] };
  const shown = (a: AppUsage) =>
    a.uid >= FIRST_APP_UID || a.uid === TETHERING_UID;
  return {
    visible: apps.filter(shown),
    hidden: apps.filter((a) => !shown(a)),
  };
}

export function sumUsage(apps: AppUsage[]) {
  return apps.reduce(
    (acc, a) => ({
      download: acc.download + a.download,
      upload: acc.upload + a.upload,
      total: acc.total + a.total,
    }),
    { download: 0, upload: 0, total: 0 }
  );
}

export function compareUsage(
  current: AppUsage[],
  previous: AppUsage[]
): UsageDelta[] {
  const previousByUid = new Map(previous.map((a) => [a.uid, a]));
  const uids = new Set([
    ...current.map((a) => a.uid),
    ...previous.map((a) => a.uid),
  ]);

  return [...uids]
    .map((uid) => {
      const now = current.find((a) => a.uid === uid);
      const before = previousByUid.get(uid);
      const currentTotal = now?.total ?? 0;
      const previousTotal = before?.total ?? 0;
      return {
        uid,
        name: now?.name ?? before?.name ?? `UID ${uid}`,
        current: currentTotal,
        previous: previousTotal,
        // No previous data means the change is undefined, not infinite.
        changePercent:
          previousTotal === 0
            ? null
            : ((currentTotal - previousTotal) / previousTotal) * 100,
      };
    })
    .sort((a, b) => b.current - a.current);
}
