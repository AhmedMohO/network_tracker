import type { NetworkFilter } from "@modules/network-usage";
import * as SQLite from "expo-sqlite";

import type { AppUsage } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";

const DAY = 86_400_000;

let db: SQLite.SQLiteDatabase | null = null;

/**
 * One table, day-granular, per app and per network. That is enough for every
 * screen in this app once a range is older than Android's retention, and small
 * enough to keep for years.
 */
export async function openArchive(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("usage-archive.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      day_start     INTEGER NOT NULL,
      uid           INTEGER NOT NULL,
      network       TEXT    NOT NULL,
      app_name      TEXT,
      package_name  TEXT,
      download      INTEGER NOT NULL,
      upload        INTEGER NOT NULL,
      PRIMARY KEY (day_start, uid, network)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_usage(day_start);
  `);
  return db;
}

/**
 * Stores one complete day, straight from Android. Idempotent: re-running for
 * the same day replaces those rows rather than doubling them.
 */
export async function snapshotDay(dayStart: number): Promise<void> {
  const archive = await openArchive();
  for (const network of ["MOBILE", "WIFI"] as const) {
    // Always the live source: an archive that read itself would compound.
    const { apps } = await fetchUsage(
      { start: dayStart, end: dayStart + DAY, preset: "custom" },
      network
    );
    await archive.withTransactionAsync(async () => {
      for (const a of apps) {
        await archive.runAsync(
          `INSERT OR REPLACE INTO daily_usage
             (day_start, uid, network, app_name, package_name, download, upload)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          dayStart,
          a.uid,
          network,
          a.name,
          a.packageName,
          a.download,
          a.upload
        );
      }
    });
  }
}

export async function readArchive(
  start: number,
  end: number,
  network: NetworkFilter
): Promise<AppUsage[]> {
  const archive = await openArchive();
  const networkClause = network === "ALL" ? "" : "AND network = ?";
  const params: (number | string)[] = [start, end];
  if (network !== "ALL") params.push(network);

  const rows = await archive.getAllAsync<{
    uid: number;
    app_name: string | null;
    package_name: string | null;
    download: number;
    upload: number;
  }>(
    `SELECT uid,
            MAX(app_name)     AS app_name,
            MAX(package_name) AS package_name,
            SUM(download)     AS download,
            SUM(upload)       AS upload
       FROM daily_usage
      WHERE day_start >= ? AND day_start < ? ${networkClause}
      GROUP BY uid`,
    ...params
  );

  const grandTotal = rows.reduce((sum, r) => sum + r.download + r.upload, 0);
  return rows.map((r) => {
    const total = r.download + r.upload;
    return {
      uid: r.uid,
      name: r.app_name ?? `UID ${r.uid}`,
      packageName: r.package_name,
      download: r.download,
      upload: r.upload,
      total,
      // Daily snapshots do not preserve the state split, and inventing one
      // would be worse than reporting none.
      foreground: 0,
      background: 0,
      percentage: grandTotal === 0 ? 0 : (total / grandTotal) * 100,
    };
  });
}
