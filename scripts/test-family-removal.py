"""Exercise the migration's DML in SQLite; Postgres deployment is a separate check."""
from pathlib import Path
import json
import re
import sqlite3
import unittest

sql = (Path(__file__).resolve().parents[1] / "docs/migrations/2026-11-08-family-remove-device.sql").read_text()
body = re.search(r"  delete from[\s\S]+?(?=end \$\$)", sql).group()


class FamilyRemovalTest(unittest.TestCase):
    def test_only_departing_device_is_deleted_and_parent_gets_tombstone(self):
        db = sqlite3.connect(":memory:")
        self.addCleanup(db.close)
        db.create_function("now", 0, lambda: 200)
        db.execute("CREATE TABLE family_snapshots(pair_token TEXT,device_id TEXT,device_label TEXT,kind TEXT,day INTEGER,payload TEXT,updated_at INTEGER DEFAULT 200,PRIMARY KEY(pair_token,device_id,kind,day))")
        db.execute("CREATE TABLE family_push_tokens(pair_token TEXT,device_id TEXT)")
        for token, device in [("family", "a"), ("family", "b"), ("another", "a")]:
            for kind in ["daily", "recent", "request", "grant"]:
                db.execute("INSERT INTO family_snapshots VALUES(?,?,?, ?,0,'{}',100)", (token, device, device, kind))
            db.execute("INSERT INTO family_push_tokens VALUES(?,?)", (token, device))
        statements = re.sub(r"\bp_token\b", ":token", re.sub(r"\bp_device\b", ":device", body.replace("::jsonb", "")))
        for _ in range(2):
            for statement in statements.split(";"):
                if statement.strip():
                    db.execute(statement, {"token": "family", "device": "a"})
        self.assertEqual(4, db.execute("SELECT COUNT(*) FROM family_snapshots WHERE pair_token='family' AND device_id='b'").fetchone()[0])
        self.assertEqual(4, db.execute("SELECT COUNT(*) FROM family_snapshots WHERE pair_token='another' AND device_id='a'").fetchone()[0])
        self.assertEqual(2, db.execute("SELECT COUNT(*) FROM family_push_tokens").fetchone()[0])
        gone = db.execute("SELECT kind,payload,updated_at FROM family_snapshots WHERE pair_token='family' AND device_id='a'").fetchall()
        self.assertEqual(1, len(gone))
        self.assertEqual(("recent", {"unpaired": True}, 200), (gone[0][0], json.loads(gone[0][1]), gone[0][2]))


if __name__ == "__main__":
    unittest.main()
