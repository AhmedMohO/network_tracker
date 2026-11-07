package com.anonymous.network_tracker.data.db

object ArchiveMigration {
    const val UPGRADE_SQL = """
        ALTER TABLE daily_usage ADD COLUMN foreground INTEGER;
        ALTER TABLE daily_usage ADD COLUMN background INTEGER;
        ALTER TABLE daily_usage ADD COLUMN day_end INTEGER;
        CREATE TABLE IF NOT EXISTS archived_days (
            day_start INTEGER NOT NULL PRIMARY KEY, captured_at INTEGER NOT NULL);
    """
    const val LEGACY_SQL = """
        ALTER TABLE daily_usage RENAME TO daily_usage_old;
        CREATE TABLE daily_usage (
            day_start INTEGER NOT NULL, uid INTEGER NOT NULL, network TEXT NOT NULL,
            ssid TEXT NOT NULL DEFAULT '', app_name TEXT, package_name TEXT,
            download INTEGER NOT NULL, upload INTEGER NOT NULL,
            PRIMARY KEY(day_start,uid,network,ssid));
        INSERT INTO daily_usage(day_start,uid,network,ssid,app_name,package_name,download,upload)
            SELECT day_start,uid,network,'',app_name,package_name,download,upload FROM daily_usage_old;
        DROP TABLE daily_usage_old;
        CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_usage(day_start);
    """
}
