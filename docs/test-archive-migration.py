"""Exercise the actual Android migration SQL with SQLite, including rollback."""
import pathlib
import re
import sqlite3
import unittest

class ArchiveMigrationTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript("""CREATE TABLE daily_usage (day_start INTEGER NOT NULL,uid INTEGER NOT NULL,network TEXT NOT NULL,app_name TEXT,package_name TEXT,download INTEGER NOT NULL,upload INTEGER NOT NULL,PRIMARY KEY(day_start,uid,network)); CREATE INDEX idx_daily_day ON daily_usage(day_start); INSERT INTO daily_usage VALUES(123,10001,'WIFI','App','pkg',987654321,123);""")
        path = pathlib.Path(__file__).resolve().parents[1] / "app/src/main/java/com/anonymous/network_tracker/data/db/ArchiveMigration.kt"
        source = path.read_text()
        self.sql = re.search(r'const val LEGACY_SQL = """(.*?)"""', source, re.S).group(1)
    def test_preserves_every_byte_and_adds_empty_ssid(self):
        self.db.executescript("BEGIN;" + self.sql + "COMMIT;")
        self.assertEqual((123,10001,'WIFI','',987654321,123), self.db.execute("SELECT day_start,uid,network,ssid,download,upload FROM daily_usage").fetchone())
        self.assertEqual(4, next(row[5] for row in self.db.execute('PRAGMA table_info(daily_usage)') if row[1] == 'ssid'))
        self.assertEqual(1, len(self.db.execute("SELECT * FROM sqlite_master WHERE type='index' AND name='idx_daily_day'").fetchall()))
    def test_failure_rolls_back_original_table(self):
        with self.assertRaises(sqlite3.OperationalError):
            self.db.executescript("BEGIN;" + self.sql.replace("DROP TABLE daily_usage_old", "SELECT * FROM broken_table; DROP TABLE daily_usage_old") + "COMMIT;")
        self.db.rollback()
        self.assertEqual((987654321,123), self.db.execute('SELECT download,upload FROM daily_usage').fetchone())
        self.assertNotIn('ssid', [r[1] for r in self.db.execute('PRAGMA table_info(daily_usage)')])
    def test_archived_series_keeps_network_and_app_filters(self):
        self.db.executescript("BEGIN;" + self.sql + "COMMIT;")
        self.db.execute("INSERT INTO daily_usage VALUES(123,10001,'MOBILE','','App','pkg',10,20)")
        self.db.execute("INSERT INTO daily_usage VALUES(123,10002,'WIFI','','Other','other',100,200)")
        path = pathlib.Path(__file__).resolve().parents[1] / 'app/src/main/java/com/anonymous/network_tracker/data/db/DailyUsageDao.kt'
        sql = re.search(r'@Query\("""(.*?)"""\)\s*suspend fun getSeries', path.read_text(), re.S).group(1)
        all_rows = self.db.execute(sql, dict(start=0, end=124, network='ALL', uid=None)).fetchall()
        wifi_app = self.db.execute(sql, dict(start=0, end=124, network='WIFI', uid=10001)).fetchall()
        self.assertEqual([(123, 987654431, 343)], all_rows)
        self.assertEqual([(123, 987654321, 123)], wifi_app)
if __name__ == '__main__': unittest.main()
