"""
tests/test_recovery.py
======================
Unit tests for stuck-report recovery:
  - mark_report_stale()
  - reset_report_for_retry()
  - get_stuck_processing_reports()
  - startup _recover_stuck_reports() sweep logic

All run in-memory SQLite — no real DB or network needed.

Run:
    python tests/test_recovery.py
"""
from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

# ── Inline DB layer (mirrors api/database.py exactly) ─────────────────────────

_USE_PG = False
_P = "?"
_conn: sqlite3.Connection | None = None


def _get_test_conn():
    global _conn
    if _conn is None:
        _conn = sqlite3.connect(":memory:")
        _conn.row_factory = sqlite3.Row
        _bootstrap(_conn)
    return _conn


@contextmanager
def _get_conn():
    conn = _get_test_conn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise


def _bootstrap(conn):
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS evaluation_reports (
            report_id    TEXT PRIMARY KEY,
            client_name  TEXT,
            status       TEXT NOT NULL,
            judge_model  TEXT,
            sample_count INTEGER NOT NULL DEFAULT 20,
            dataset_id   TEXT,
            model_version TEXT,
            created_at   TEXT NOT NULL,
            updated_at   TEXT NOT NULL,
            results_json TEXT,
            metrics_json TEXT,
            html_path    TEXT,
            html_content TEXT,
            total_tokens INTEGER,
            total_cost_usd REAL,
            error        TEXT
        );
    """)
    conn.commit()


def _row_to_dict(row):
    return dict(row) if row else None


def _utc_now():
    return datetime.now(timezone.utc).isoformat()


def _insert_report(report_id, client_name, status, updated_at=None):
    now = updated_at or _utc_now()
    with _get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO evaluation_reports "
            "(report_id, client_name, status, sample_count, created_at, updated_at) "
            "VALUES (?,?,?,20,?,?)",
            (report_id, client_name, status, now, now),
        )


def get_stuck_processing_reports(older_than_minutes=15):
    from datetime import timedelta
    with _get_conn() as conn:
        cur = conn.cursor()
        if older_than_minutes == 0:
            cur.execute(
                "SELECT report_id, client_name, updated_at FROM evaluation_reports WHERE status=?",
                ("stale",),
            )
        else:
            cutoff = (datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)).isoformat()
            cur.execute(
                "SELECT report_id, client_name, updated_at FROM evaluation_reports "
                "WHERE status=? AND updated_at < ?",
                ("processing", cutoff),
            )
        return [_row_to_dict(r) for r in cur.fetchall()]


def mark_report_stale(report_id):
    with _get_conn() as conn:
        conn.execute(
            "UPDATE evaluation_reports SET status=?, updated_at=?, error=? "
            "WHERE report_id=? AND status=?",
            ("stale", _utc_now(),
             f"In-flight when server restarted. Retry via POST /report/{report_id}/retry.",
             report_id, "processing"),
        )


def reset_report_for_retry(report_id, client_name):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT report_id FROM evaluation_reports "
            "WHERE report_id=? AND client_name=? AND status=?",
            (report_id, client_name, "stale"),
        )
        if not cur.fetchone():
            return False
        cur.execute(
            "UPDATE evaluation_reports SET status=?, updated_at=?, error=NULL WHERE report_id=?",
            ("processing", _utc_now(), report_id),
        )
        return True


def _get_status(report_id):
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT status, error FROM evaluation_reports WHERE report_id=?", (report_id,)
        ).fetchone()
        return _row_to_dict(row)


# ── Tests ─────────────────────────────────────────────────────────────────────

OLD_TS = (datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat()
RECENT_TS = (datetime.now(timezone.utc) - timedelta(minutes=2)).isoformat()


class TestGetStuckReports(unittest.TestCase):
    def setUp(self):
        # Fresh state per test
        global _conn
        _conn = None
        _get_test_conn()

    def test_finds_old_processing_report(self):
        _insert_report("stuck-old", "acme", "processing", OLD_TS)
        stuck = get_stuck_processing_reports(older_than_minutes=15)
        ids = [r["report_id"] for r in stuck]
        self.assertIn("stuck-old", ids)

    def test_ignores_recent_processing_report(self):
        _insert_report("stuck-recent", "acme", "processing", RECENT_TS)
        stuck = get_stuck_processing_reports(older_than_minutes=15)
        ids = [r["report_id"] for r in stuck]
        self.assertNotIn("stuck-recent", ids)

    def test_ignores_done_reports(self):
        _insert_report("done-report", "acme", "done", OLD_TS)
        stuck = get_stuck_processing_reports(older_than_minutes=15)
        ids = [r["report_id"] for r in stuck]
        self.assertNotIn("done-report", ids)

    def test_returns_empty_when_none_stuck(self):
        stuck = get_stuck_processing_reports(older_than_minutes=15)
        self.assertEqual(stuck, [])

    def test_zero_minutes_returns_stale_not_processing(self):
        _insert_report("proc", "acme", "processing", OLD_TS)
        _insert_report("stal", "acme", "stale", OLD_TS)
        result = get_stuck_processing_reports(older_than_minutes=0)
        ids = [r["report_id"] for r in result]
        self.assertIn("stal", ids)
        self.assertNotIn("proc", ids)


class TestMarkReportStale(unittest.TestCase):
    def setUp(self):
        global _conn
        _conn = None
        _get_test_conn()

    def test_transitions_processing_to_stale(self):
        _insert_report("r1", "acme", "processing", OLD_TS)
        mark_report_stale("r1")
        self.assertEqual(_get_status("r1")["status"], "stale")

    def test_error_message_contains_report_id(self):
        _insert_report("r2", "acme", "processing", OLD_TS)
        mark_report_stale("r2")
        row = _get_status("r2")
        self.assertIn("r2", row["error"])

    def test_does_not_transition_done_report(self):
        _insert_report("r3", "acme", "done", OLD_TS)
        mark_report_stale("r3")
        self.assertEqual(_get_status("r3")["status"], "done")

    def test_does_not_transition_failed_report(self):
        _insert_report("r4", "acme", "failed", OLD_TS)
        mark_report_stale("r4")
        self.assertEqual(_get_status("r4")["status"], "failed")

    def test_idempotent_on_already_stale(self):
        _insert_report("r5", "acme", "stale", OLD_TS)
        mark_report_stale("r5")  # should not crash
        self.assertEqual(_get_status("r5")["status"], "stale")


class TestResetReportForRetry(unittest.TestCase):
    def setUp(self):
        global _conn
        _conn = None
        _get_test_conn()

    def test_stale_resets_to_processing(self):
        _insert_report("retry-ok", "acme", "stale", OLD_TS)
        result = reset_report_for_retry("retry-ok", "acme")
        self.assertTrue(result)
        self.assertEqual(_get_status("retry-ok")["status"], "processing")

    def test_wrong_client_cannot_retry(self):
        _insert_report("retry-auth", "acme", "stale", OLD_TS)
        result = reset_report_for_retry("retry-auth", "evil-corp")
        self.assertFalse(result)
        self.assertEqual(_get_status("retry-auth")["status"], "stale")

    def test_non_stale_cannot_retry(self):
        _insert_report("retry-done", "acme", "done", OLD_TS)
        result = reset_report_for_retry("retry-done", "acme")
        self.assertFalse(result)
        self.assertEqual(_get_status("retry-done")["status"], "done")

    def test_missing_report_returns_false(self):
        result = reset_report_for_retry("does-not-exist", "acme")
        self.assertFalse(result)

    def test_error_cleared_on_retry(self):
        _insert_report("retry-err", "acme", "stale", OLD_TS)
        # Manually set an error on it
        with _get_conn() as conn:
            conn.execute(
                "UPDATE evaluation_reports SET error='some error' WHERE report_id=?",
                ("retry-err",),
            )
        reset_report_for_retry("retry-err", "acme")
        self.assertIsNone(_get_status("retry-err")["error"])


class TestStartupRecoverySweep(unittest.TestCase):
    """Simulate what _recover_stuck_reports() in main.py does."""

    def setUp(self):
        global _conn
        _conn = None
        _get_test_conn()

    def _recover_stuck_reports(self, older_than_minutes=15):
        stuck = get_stuck_processing_reports(older_than_minutes=older_than_minutes)
        recovered = 0
        for row in stuck:
            mark_report_stale(row["report_id"])
            recovered += 1
        return recovered

    def test_recovers_multiple_stuck_reports(self):
        _insert_report("s1", "acme", "processing", OLD_TS)
        _insert_report("s2", "globex", "processing", OLD_TS)
        _insert_report("s3", "acme", "processing", RECENT_TS)  # too recent
        _insert_report("s4", "acme", "done", OLD_TS)           # already done

        count = self._recover_stuck_reports()
        self.assertEqual(count, 2)
        self.assertEqual(_get_status("s1")["status"], "stale")
        self.assertEqual(_get_status("s2")["status"], "stale")
        self.assertEqual(_get_status("s3")["status"], "processing")  # untouched
        self.assertEqual(_get_status("s4")["status"], "done")         # untouched

    def test_no_stuck_reports_returns_zero(self):
        _insert_report("clean", "acme", "done", OLD_TS)
        count = self._recover_stuck_reports()
        self.assertEqual(count, 0)

    def test_already_stale_not_counted_again(self):
        _insert_report("already-stale", "acme", "stale", OLD_TS)
        count = self._recover_stuck_reports()
        self.assertEqual(count, 0)  # stale != processing, so not picked up


if __name__ == "__main__":
    unittest.main(verbosity=2)