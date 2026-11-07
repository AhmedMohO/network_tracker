"""Run the shipped archive SQL against real SQLite, without changing an installed archive."""
from pathlib import Path
import re
import sqlite3
import unittest

source = (Path(__file__).resolve().parents[1] / "app/src/main/java/com/anonymous/network_tracker/data/db/ArchiveMigration.kt").read_text()


def sql(name):
    match = re.search(r"const val " + name + r' = ("""[\s\S]*?"""|"[^"]*")', source)
    return match.group(1).strip('"')


class ArchiveMigrationTest(unittest.TestCase):
    def create_archive(self, legacy=False):
        db = sqlite3.connect(":memory:")
        ssid = "" if legacy else "ssid TEXT NOT NULL DEFAULT '',"
        key = "day_start,uid,network" + ("" if legacy else ",ssid")
        db.execute(f"CREATE TABLE daily_usage(day_start INTEGER NOT NULL,uid INTEGER NOT NULL,network TEXT NOT NULL,{ssid}app_name TEXT,package_name TEXT,download INTEGER NOT NULL,upload INTEGER NOT NULL,PRIMARY KEY({key}))")
        db.execute("INSERT INTO daily_usage(day_start,uid,network,app_name,download,upload) VALUES(0,10,'WIFI','Browser',123,45)")
        db.commit()
        if legacy:
            db.executescript(sql("LEGACY_SQL"))
        db.executescript(sql("UPGRADE_SQL"))
        self.addCleanup(db.close)
        return db

    def test_upgrade_preserves_bytes_and_does_not_invent_state_or_completion(self):
        db = self.create_archive()
        columns = {row[1] for row in db.execute("PRAGMA table_info(daily_usage)")}
        self.assertTrue({"foreground", "background", "day_end"} <= columns)
        self.assertEqual((123, 45, None, None), db.execute("SELECT download,upload,foreground,background FROM daily_usage").fetchone())
        self.assertEqual([], db.execute("SELECT * FROM archived_days").fetchall())

    def test_legacy_archive_can_upgrade_without_losing_its_rows(self):
        db = self.create_archive(legacy=True)
        columns = {row[1] for row in db.execute("PRAGMA table_info(daily_usage)")}
        self.assertTrue({"ssid", "foreground", "background"} <= columns)
        self.assertEqual((123, 45), db.execute("SELECT download,upload FROM daily_usage").fetchone())


if __name__ == "__main__":
    unittest.main()
