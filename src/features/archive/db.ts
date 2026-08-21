import type { NetworkFilter } from "@modules/network-usage";
import * as SQLite from "expo-sqlite";

import type { AppUsage } from "@/features/usage/aggregate";
import { fetchUsage } from "@/features/usage/api";
import {
  fetchWifiNetworkUsage,
  isWifiWatchEnabled,
} from "@/features/usage/wifiNetworks";
import type { WifiNetworkSlice } from "@/features/usage/wifiSlices";

const DAY = 86_400_000;

/**
 * The `ssid` value for a row that names no Wi-Fi network: every mobile row,
 * and the Wi-Fi bytes the transition log could not attribute. An empty string
 * rather than NULL because it is part of the primary key, and SQLite treats
 * every NULL as distinct — an `INSERT OR REPLACE` re-run for the same day
 * would have appended duplicates instead of replacing them.
 */
const NO_SSID = "";

let db: SQLite.SQLiteDatabase | null = null;

/**
 * One table, day-granular, per app, per network and per Wi-Fi network name.
 * That is enough for every screen in this app once a range is older than
 * Android's retention, and small enough to keep for years.
 */
export async function openArchive(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync("usage-archive.db");
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS daily_usage (
      day_start     INTEGER NOT NULL,
      uid           INTEGER NOT NULL,
      network       TEXT    NOT NULL,
      ssid          TEXT    NOT NULL DEFAULT '',
      app_name      TEXT,
      package_name  TEXT,
      download      INTEGER NOT NULL,
      upload        INTEGER NOT NULL,
      PRIMARY KEY (day_start, uid, network, ssid)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_usage(day_start);
  `);
  await migrateSsidColumn(db);
  return db;
}

/**
 * Adds `ssid` to an archive written before per-network tracking existed.
 *
 * The column is part of the primary key, and SQLite cannot add a column to
 * one, so this is a rebuild rather than an `ALTER TABLE`. Driven off
 * `PRAGMA table_info` rather than a version counter because the counter was
 * never written by the original schema: a device upgrading from it and a
 * fresh install both report `user_version = 0`, so asking the table what
 * shape it actually is, is the only question with a reliable answer.
 *
 * Existing rows keep every byte they had and land under `NO_SSID` — which is
 * the truth, since nothing was recording network names when they were written.
 */
async function migrateSsidColumn(archive: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await archive.getAllAsync<{ name: string }>(
    `PRAGMA table_info(daily_usage)`
  );
  if (columns.some((c) => c.name === "ssid")) return;

  await archive.execAsync(`
    BEGIN;
    ALTER TABLE daily_usage RENAME TO daily_usage_old;
    CREATE TABLE daily_usage (
      day_start     INTEGER NOT NULL,
      uid           INTEGER NOT NULL,
      network       TEXT    NOT NULL,
      ssid          TEXT    NOT NULL DEFAULT '',
      app_name      TEXT,
      package_name  TEXT,
      download      INTEGER NOT NULL,
      upload        INTEGER NOT NULL,
      PRIMARY KEY (day_start, uid, network, ssid)
    );
    INSERT INTO daily_usage
      (day_start, uid, network, ssid, app_name, package_name, download, upload)
    SELECT day_start, uid, network, '', app_name, package_name, download, upload
      FROM daily_usage_old;
    DROP TABLE daily_usage_old;
    CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_usage(day_start);
    COMMIT;
  `);
}

/** One `INSERT OR REPLACE` per app row. Shared by both snapshot paths. */
async function writeRows(
  archive: SQLite.SQLiteDatabase,
  dayStart: number,
  network: NetworkFilter,
  ssid: string,
  apps: AppUsage[]
) {
  for (const a of apps) {
    await archive.runAsync(
      `INSERT OR REPLACE INTO daily_usage
         (day_start, uid, network, ssid, app_name, package_name, download, upload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      dayStart,
      a.uid,
      network,
      ssid,
      a.name,
      a.packageName,
      a.download,
      a.upload
    );
  }
}

/**
 * Stores one complete day, straight from Android. Idempotent: re-running for
 * the same day replaces those rows rather than doubling them.
 *
 * Wi-Fi is written per network name when the watch is on, because the
 * transition log is the only place that split exists and Android's own stats
 * are gone in about 90 days — a day archived without it can never be split
 * again. When the watch is off it falls back to one undifferentiated Wi-Fi
 * row, exactly as before.
 */
export async function snapshotDay(dayStart: number): Promise<void> {
  const archive = await openArchive();
  const range = { start: dayStart, end: dayStart + DAY, preset: "custom" as const };
  const perNetwork = isWifiWatchEnabled();

  for (const network of ["MOBILE", "WIFI"] as const) {
    if (network === "WIFI" && perNetwork) {
      const { networks } = await fetchWifiNetworkUsage(range);
      // Replaces, never accumulates: a re-run for a day whose split has since
      // changed would otherwise leave the old network's rows behind alongside
      // the new ones, and both would be counted.
      await archive.withTransactionAsync(async () => {
        await archive.runAsync(
          `DELETE FROM daily_usage WHERE day_start = ? AND network = ?`,
          dayStart,
          network
        );
        for (const slice of networks) {
          await writeRows(archive, dayStart, network, slice.ssid ?? NO_SSID, slice.apps);
        }
      });
      continue;
    }

    // Always the live source: an archive that read itself would compound.
    const { apps } = await fetchUsage(range, network);
    await archive.withTransactionAsync(async () => {
      await writeRows(archive, dayStart, network, NO_SSID, apps);
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

/**
 * The archived Wi-Fi half of a range, split by network name.
 *
 * Days archived before per-network tracking was on come back under `ssid:
 * null` — the same unattributed bucket the live query uses — because that is
 * what they are: Wi-Fi bytes with no record of which network carried them.
 */
export async function readArchiveByWifiNetwork(
  start: number,
  end: number
): Promise<WifiNetworkSlice[]> {
  const archive = await openArchive();
  const rows = await archive.getAllAsync<{
    ssid: string;
    uid: number;
    app_name: string | null;
    package_name: string | null;
    download: number;
    upload: number;
  }>(
    `SELECT ssid,
            uid,
            MAX(app_name)     AS app_name,
            MAX(package_name) AS package_name,
            SUM(download)     AS download,
            SUM(upload)       AS upload
       FROM daily_usage
      WHERE day_start >= ? AND day_start < ? AND network = 'WIFI'
      GROUP BY ssid, uid`,
    start,
    end
  );

  const byName = new Map<string | null, AppUsage[]>();
  for (const r of rows) {
    const ssid = r.ssid === NO_SSID ? null : r.ssid;
    const total = r.download + r.upload;
    const list = byName.get(ssid) ?? [];
    list.push({
      uid: r.uid,
      name: r.app_name ?? `UID ${r.uid}`,
      packageName: r.package_name,
      download: r.download,
      upload: r.upload,
      total,
      foreground: 0,
      background: 0,
      // Set by `mergeSlices`, which is the only thing that knows the final
      // per-network total once the live half is folded in.
      percentage: 0,
    });
    byName.set(ssid, list);
  }

  return [...byName.entries()].map(([ssid, apps]) => ({
    ssid,
    apps: apps.sort((a, b) => b.total - a.total),
    totals: apps.reduce(
      (acc, a) => ({
        download: acc.download + a.download,
        upload: acc.upload + a.upload,
        total: acc.total + a.total,
      }),
      { download: 0, upload: 0, total: 0 }
    ),
  }));
}
