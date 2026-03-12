"""
database.py — unified DB layer for Breaker Lab.

Strategy:
  - If DATABASE_URL env var is set (Railway Postgres), use psycopg2.
  - Otherwise fall back to SQLite (local dev / legacy).

All public functions share the same signature as before so routes.py
needs zero changes except for the new delete + cache helpers at the bottom.
"""

from __future__ import annotations

import atexit
import hashlib
import json
import os
import os as _os  
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL: str | None = os.getenv("DATABASE_URL")  # e.g. postgresql://user:pass@host/db
_USE_PG = bool(DATABASE_URL)

# SQLite fallback path
_DATA_DIR = os.getenv("DATA_DIR", "/app/data")
os.makedirs(_DATA_DIR, exist_ok=True)
_SQLITE_FILE = os.path.join(_DATA_DIR, "usage.db")

# Backwards-compatibility alias — routes.py imports DB_FILE directly
DB_FILE = _SQLITE_FILE

# ── Connection helpers ────────────────────────────────────────────────────────

if _USE_PG:
    import psycopg2
    import psycopg2.extras
    from psycopg2.pool import ThreadedConnectionPool

    _PG_POOL: ThreadedConnectionPool | None = None
    _PG_MIN_CONN = int(os.getenv("PG_POOL_MIN_CONN", "1"))
    _PG_MAX_CONN = int(os.getenv("PG_POOL_MAX_CONN", "8"))

    def _get_pg_pool() -> ThreadedConnectionPool:
        global _PG_POOL
        if _PG_POOL is None:
            _PG_POOL = ThreadedConnectionPool(
                _PG_MIN_CONN,
                _PG_MAX_CONN,
                DATABASE_URL,
                cursor_factory=psycopg2.extras.RealDictCursor,
            )
        return _PG_POOL

    def _close_pg_pool() -> None:
        global _PG_POOL
        if _PG_POOL is not None:
            _PG_POOL.closeall()
            _PG_POOL = None

    atexit.register(_close_pg_pool)

    @contextmanager
    def _get_conn() -> Generator:
        pool = _get_pg_pool()
        conn = pool.getconn()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            pool.putconn(conn)

    # Postgres uses %s placeholders; SQLite uses ?
    _P = "%s"

else:
    @contextmanager
    def _get_conn() -> Generator:
        conn = sqlite3.connect(_SQLITE_FILE)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    _P = "?"


def _row_to_dict(row) -> dict | None:
    if row is None:
        return None
    if isinstance(row, dict):
        return row
    return dict(row)  # sqlite3.Row


def _ph(n: int = 1) -> str:
    """Return n comma-separated placeholders."""
    return ", ".join([_P] * n)


# ── Schema ────────────────────────────────────────────────────────────────────

def init_db():
    """Create all tables if they don't exist. Safe to call on every startup."""
    with _get_conn() as conn:
        cur = conn.cursor()

        if _USE_PG:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS clients (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    api_key_hash TEXT NOT NULL UNIQUE,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS usage_logs (
                    id SERIAL PRIMARY KEY,
                    client_id INTEGER,
                    client_name TEXT,
                    report_id TEXT,
                    dataset_id TEXT,
                    model_version TEXT,
                    evaluation_date TEXT,
                    api_key_hash TEXT,
                    timestamp TEXT,
                    sample_count INTEGER,
                    FOREIGN KEY (client_id) REFERENCES clients(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS evaluation_runs (
                    report_id TEXT PRIMARY KEY,
                    client_name TEXT,
                    dataset_id TEXT,
                    model_version TEXT,
                    timestamp TEXT NOT NULL,
                    correctness REAL,
                    relevance REAL,
                    hallucination REAL,
                    overall REAL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS evaluation_reports (
                    report_id TEXT PRIMARY KEY,
                    client_id INTEGER,
                    client_name TEXT,
                    share_token TEXT UNIQUE,
                    status TEXT NOT NULL,
                    judge_model TEXT,
                    sample_count INTEGER NOT NULL,
                    dataset_id TEXT,
                    model_version TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    results_json TEXT,
                    metrics_json TEXT,
                    html_path TEXT,
                    html_content TEXT,
                    total_tokens INTEGER,
                    total_cost_usd REAL,
                    error TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS human_reviews (
                    id SERIAL PRIMARY KEY,
                    report_id TEXT NOT NULL,
                    item_index INTEGER NOT NULL,
                    score REAL NOT NULL,
                    comment TEXT,
                    approved INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (report_id) REFERENCES evaluation_reports(report_id) ON DELETE CASCADE
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS demo_runs (
                    ip_hash TEXT NOT NULL,
                    run_date TEXT NOT NULL,
                    run_count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (ip_hash, run_date)
                )
            """)
            # ── Test suite cache ──────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS test_suite_cache (
                    cache_key    TEXT PRIMARY KEY,
                    description  TEXT NOT NULL,
                    num_tests    INTEGER NOT NULL,
                    tests_json   TEXT NOT NULL,
                    hit_count    INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT NOT NULL,
                    last_used_at TEXT NOT NULL
                )
            """)
            # Indexes for common query patterns
            cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_logs_client_name ON usage_logs(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp   ON usage_logs(timestamp)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_client    ON evaluation_reports(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_created   ON evaluation_reports(created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_test_cache_key         ON test_suite_cache(cache_key)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_demo_runs_date         ON demo_runs(run_date)")
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'evaluation_reports'
            """)
            existing = {row["column_name"] for row in cur.fetchall()}
            if "share_token" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN share_token TEXT UNIQUE")
            if "html_content" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN html_content TEXT")

        else:
            # --- SQLite DDL (unchanged from original) -------------------------
            cur.execute("""
                CREATE TABLE IF NOT EXISTS clients (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    api_key_hash TEXT NOT NULL UNIQUE,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS usage_logs (
                    client_id INTEGER,
                    client_name TEXT,
                    report_id TEXT,
                    dataset_id TEXT,
                    model_version TEXT,
                    evaluation_date TEXT,
                    api_key_hash TEXT,
                    timestamp TEXT,
                    sample_count INTEGER,
                    FOREIGN KEY(client_id) REFERENCES clients(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS evaluation_runs (
                    report_id TEXT PRIMARY KEY,
                    client_name TEXT,
                    dataset_id TEXT,
                    model_version TEXT,
                    timestamp TEXT NOT NULL,
                    correctness REAL,
                    relevance REAL,
                    hallucination REAL,
                    overall REAL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS evaluation_reports (
                    report_id TEXT PRIMARY KEY,
                    client_id INTEGER,
                    client_name TEXT,
                    share_token TEXT UNIQUE,
                    status TEXT NOT NULL,
                    judge_model TEXT,
                    sample_count INTEGER NOT NULL,
                    dataset_id TEXT,
                    model_version TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    results_json TEXT,
                    metrics_json TEXT,
                    html_path TEXT,
                    html_content TEXT,
                    total_tokens INTEGER,
                    total_cost_usd REAL,
                    error TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS human_reviews (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    report_id TEXT NOT NULL,
                    item_index INTEGER NOT NULL,
                    score REAL NOT NULL,
                    comment TEXT,
                    approved INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(report_id) REFERENCES evaluation_reports(report_id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS demo_runs (
                    ip_hash TEXT NOT NULL,
                    run_date TEXT NOT NULL,
                    run_count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (ip_hash, run_date)
                )
            """)
            # ── Test suite cache ──────────────────────────────────────────────
            cur.execute("""
                CREATE TABLE IF NOT EXISTS test_suite_cache (
                    cache_key    TEXT PRIMARY KEY,
                    description  TEXT NOT NULL,
                    num_tests    INTEGER NOT NULL,
                    tests_json   TEXT NOT NULL,
                    hit_count    INTEGER NOT NULL DEFAULT 0,
                    created_at   TEXT NOT NULL,
                    last_used_at TEXT NOT NULL
                )
            """)
            # Migrate: add missing columns to usage_logs
            cur.execute("PRAGMA table_info(usage_logs)")
            existing = {row[1] for row in cur.fetchall()}
            for col in ["client_id", "client_name", "dataset_id", "model_version", "evaluation_date"]:
                if col not in existing:
                    cur.execute(f"ALTER TABLE usage_logs ADD COLUMN {col} TEXT")
            # Migrate: add html_content to evaluation_reports if missing
            cur.execute("PRAGMA table_info(evaluation_reports)")
            existing = {row[1] for row in cur.fetchall()}
            if "share_token" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN share_token TEXT")
            if "html_content" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN html_content TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_demo_runs_date ON demo_runs(run_date)")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def hash_ip(ip_address: str) -> str:
    return hashlib.sha256(ip_address.encode()).hexdigest()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Client management ─────────────────────────────────────────────────────────

def register_client(name: str, api_key: str):
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "INSERT INTO clients(name, api_key_hash, active, created_at) VALUES (%s,%s,1,%s) ON CONFLICT DO NOTHING",
                (name, _hash_key(api_key), _utc_now()),
            )
        else:
            cur.execute(
                "INSERT OR IGNORE INTO clients(name, api_key_hash, active, created_at) VALUES (?,?,1,?)",
                (name, _hash_key(api_key), _utc_now()),
            )


def get_client_by_key(api_key: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, name, active FROM clients WHERE api_key_hash={_P}",
            (_hash_key(api_key),),
        )
        return _row_to_dict(cur.fetchone())


def get_client_by_api_key(api_key: str) -> dict | None:
    """Backward-compatible alias used by routes.py."""
    return get_client_by_key(api_key)


# ── Usage logging ─────────────────────────────────────────────────────────────

def log_usage(*, report_id, api_key, sample_count, client=None,
              dataset_id=None, model_version=None, evaluation_date=None):
    client_name = client.get("name") if isinstance(client, dict) else None
    client_id   = client.get("id")   if isinstance(client, dict) else None
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO usage_logs
                (client_id, client_name, report_id, dataset_id, model_version,
                 evaluation_date, api_key_hash, timestamp, sample_count)
            VALUES ({_ph(9)})
            """,
            (client_id, client_name, report_id, dataset_id, model_version,
             evaluation_date, _hash_key(api_key), _utc_now(), sample_count),
        )


def get_history_for_client(client_name: str, limit: int = 50) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT report_id, status, judge_model, sample_count, dataset_id,
                   model_version, created_at, updated_at, metrics_json, error
            FROM evaluation_reports
            WHERE client_name={_P}
            ORDER BY created_at DESC
            LIMIT {int(limit)}
            """,
            (client_name,),
        )
        rows = cur.fetchall()
    return [_row_to_dict(r) for r in rows]


def get_usage_slice(client_name: str, prefix: str | None) -> dict:
    with _get_conn() as conn:
        cur = conn.cursor()
        if prefix:
            cur.execute(
                f"SELECT COUNT(*) as runs, SUM(sample_count) as samples FROM usage_logs WHERE client_name={_P} AND timestamp LIKE {_P}",
                (client_name, f"{prefix}%"),
            )
        else:
            cur.execute(
                f"SELECT COUNT(*) as runs, SUM(sample_count) as samples FROM usage_logs WHERE client_name={_P}",
                (client_name,),
            )
        row = _row_to_dict(cur.fetchone()) or {}
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
        cur.execute(
            f"SELECT COUNT(*) as today_runs FROM usage_logs WHERE client_name={_P} AND timestamp LIKE {_P}",
            (client_name, f"{today}%",),
        )
        today_row = _row_to_dict(cur.fetchone()) or {}
        cur.execute(
            f"SELECT COUNT(*) as month_runs FROM usage_logs WHERE client_name={_P} AND timestamp LIKE {_P}",
            (client_name, f"{month_prefix}%",),
        )

    return {"today": today, "month": month_prefix, "overall": row}


# ── Evaluation runs ───────────────────────────────────────────────────────────

def log_evaluation_run(report_id, client_name, dataset_id, model_version, summary):
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                """
                INSERT INTO evaluation_runs(report_id, client_name, dataset_id, model_version, timestamp,
                    correctness, relevance, hallucination, overall)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (report_id) DO UPDATE SET
                    correctness=EXCLUDED.correctness, relevance=EXCLUDED.relevance,
                    hallucination=EXCLUDED.hallucination, overall=EXCLUDED.overall
                """,
                (report_id, client_name, dataset_id, model_version, _utc_now(),
                 float(summary.get("correctness", 0) or 0), float(summary.get("relevance", 0) or 0),
                 float(summary.get("hallucination", 0) or 0), float(summary.get("overall", 0) or 0)),
            )
        else:
            cur.execute(
                """
                INSERT OR REPLACE INTO evaluation_runs(report_id, client_name, dataset_id, model_version, timestamp,
                    correctness, relevance, hallucination, overall)
                VALUES (?,?,?,?,?,?,?,?,?)
                """,
                (report_id, client_name, dataset_id, model_version, _utc_now(),
                 float(summary.get("correctness", 0) or 0), float(summary.get("relevance", 0) or 0),
                 float(summary.get("hallucination", 0) or 0), float(summary.get("overall", 0) or 0)),
            )


def get_latest_regression_baseline(client_name, dataset_id, current_model_version):
    with _get_conn() as conn:
        cur = conn.cursor()
        where = [f"client_name = {_P}"]
        params: list = [client_name]
        if dataset_id:
            where.append(f"dataset_id = {_P}")
            params.append(dataset_id)
        if current_model_version:
            where.append(f"(model_version IS NULL OR model_version != {_P})")
            params.append(current_model_version)
        cur.execute(
            f"""
            SELECT report_id, client_name, dataset_id, model_version, timestamp,
                   correctness, relevance, hallucination, overall
            FROM evaluation_runs WHERE {" AND ".join(where)}
            ORDER BY timestamp DESC LIMIT 1
            """,
            params,
        )
        return _row_to_dict(cur.fetchone())


# ── Evaluation reports ────────────────────────────────────────────────────────

def insert_report(*, report_id, client_id, client_name, share_token, status, judge_model,
                  sample_count, dataset_id, model_version):
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO evaluation_reports(
                report_id, client_id, client_name, share_token, status, judge_model,
                sample_count, dataset_id, model_version, created_at, updated_at
            ) VALUES ({_ph(11)})
            """,
            (report_id, client_id, client_name, share_token, status, judge_model,
             sample_count, dataset_id, model_version, now, now),
        )


def finalize_report_success(report_id, results_json, metrics_json, html_path,
                             html_content, total_tokens, total_cost):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE evaluation_reports
            SET status={_P}, updated_at={_P}, results_json={_P}, metrics_json={_P},
                html_path={_P}, html_content={_P}, total_tokens={_P},
                total_cost_usd={_P}, error=NULL
            WHERE report_id={_P}
              AND status != {_P}
            """,
            ("done", _utc_now(), results_json, metrics_json,
             html_path, html_content, total_tokens, total_cost, report_id, "canceled"),
        )


def finalize_report_failure(report_id, error_message):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE evaluation_reports SET status={_P}, updated_at={_P}, error={_P} WHERE report_id={_P} AND status != {_P}",
            ("failed", _utc_now(), error_message[:2000], report_id, "canceled"),
        )


def cancel_report(report_id: str, reason: str, client_name: str | None = None) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        if client_name is None:
            cur.execute(
                f"SELECT report_id FROM evaluation_reports WHERE report_id={_P}",
                (report_id,),
            )
        else:
            cur.execute(
                f"SELECT report_id FROM evaluation_reports WHERE report_id={_P} AND client_name={_P}",
                (report_id, client_name),
            )
        if not cur.fetchone():
            return False
        cur.execute(
            f"""
            UPDATE evaluation_reports
               SET status={_P}, updated_at={_P}, error={_P}
             WHERE report_id={_P}
               AND status IN ({_P}, {_P})
            """,
            ("canceled", _utc_now(), reason[:2000], report_id, "processing", "stale"),
        )
        return cur.rowcount > 0


def get_report_row(report_id: str) -> dict | None:
    """Fetch a single report by ID (all columns)."""
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM evaluation_reports WHERE report_id=%s" % _P
            if _USE_PG else
            "SELECT * FROM evaluation_reports WHERE report_id=?",
            (report_id,),
        )
        return _row_to_dict(cur.fetchone())


def get_demo_run_count(ip_hash: str, run_date: str) -> int:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT run_count FROM demo_runs WHERE ip_hash={_P} AND run_date={_P}",
            (ip_hash, run_date),
        )
        row = _row_to_dict(cur.fetchone())
        return int((row or {}).get("run_count") or 0)


def upsert_demo_run(ip_hash: str, run_date: str) -> int:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT run_count FROM demo_runs WHERE ip_hash={_P} AND run_date={_P}",
            (ip_hash, run_date),
        )
        row = _row_to_dict(cur.fetchone())
        if row is None:
            cur.execute(
                f"INSERT INTO demo_runs(ip_hash, run_date, run_count) VALUES ({_ph(3)})",
                (ip_hash, run_date, 1),
            )
            return 1

        new_count = int(row["run_count"] or 0) + 1
        cur.execute(
            f"UPDATE demo_runs SET run_count={_P} WHERE ip_hash={_P} AND run_date={_P}",
            (new_count, ip_hash, run_date),
        )
        return new_count


def get_report_row_by_share_token(share_token: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM evaluation_reports WHERE share_token=%s" % _P
            if _USE_PG else
            "SELECT * FROM evaluation_reports WHERE share_token=?",
            (share_token,),
        )
        return _row_to_dict(cur.fetchone())


def set_report_share_token(report_id: str, share_token: str) -> None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE evaluation_reports SET share_token={_P} WHERE report_id={_P}",
            (share_token, report_id),
        )


def list_reports_for_client(client_name: str) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT report_id, share_token, status, judge_model, sample_count, dataset_id,
                   model_version, created_at, updated_at, error
            FROM evaluation_reports
            WHERE client_name={_P}
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (client_name,),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


# ── Human reviews ─────────────────────────────────────────────────────────────

def save_human_reviews(report_id: str, reviews: list[dict]):
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        for rev in reviews:
            cur.execute(
                f"""
                INSERT INTO human_reviews(report_id, item_index, score, comment, approved, created_at)
                VALUES ({_ph(6)})
                """,
                (report_id, rev.get("item_index", 0), float(rev.get("score", 0)),
                 rev.get("comment", ""), int(bool(rev.get("approved", False))), now),
            )


# ── Delete report ─────────────────────────────────────────────────────────────

def delete_report(report_id: str, client_name: str) -> bool:
    """
    Delete a report and its associated usage log rows.
    Returns True if a row was deleted, False if not found / unauthorized.
    """
    with _get_conn() as conn:
        cur = conn.cursor()
        # Ownership check
        cur.execute(
            f"SELECT report_id FROM evaluation_reports WHERE report_id={_P} AND client_name={_P}",
            (report_id, client_name),
        )
        if not cur.fetchone():
            return False

        # Cascade: human_reviews, usage_logs, then the report itself
        cur.execute(f"DELETE FROM human_reviews WHERE report_id={_P}", (report_id,))
        cur.execute(f"DELETE FROM usage_logs WHERE report_id={_P}", (report_id,))
        cur.execute(f"DELETE FROM evaluation_reports WHERE report_id={_P}", (report_id,))
        cur.execute(f"DELETE FROM evaluation_runs WHERE report_id={_P}", (report_id,))
        return True


# ── Test Suite Cache ──────────────────────────────────────────────────────────

def _suite_cache_key(description: str, num_tests: int) -> str:
    """Deterministic SHA-256 key from (normalised description, num_tests)."""
    raw = f"{description.strip().lower()}::{int(num_tests)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def get_cached_test_suite(description: str, num_tests: int) -> list[dict] | None:
    """
    Return a cached test suite for the given (description, num_tests) pair.

    On a hit:
      - Deserialises tests_json and returns the list.
      - Increments hit_count and updates last_used_at (best-effort).
    On a miss:
      - Returns None so the caller falls through to generation.
    """
    key = _suite_cache_key(description, num_tests)
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT tests_json FROM test_suite_cache WHERE cache_key={_P}",
            (key,),
        )
        row = _row_to_dict(cur.fetchone())
        if row is None:
            return None

        # Best-effort stat update — don't let this kill the request
        try:
            cur.execute(
                f"""
                UPDATE test_suite_cache
                   SET hit_count    = hit_count + 1,
                       last_used_at = {_P}
                 WHERE cache_key    = {_P}
                """,
                (_utc_now(), key),
            )
        except Exception:
            pass

        return json.loads(row["tests_json"])


def save_test_suite_cache(description: str, num_tests: int, tests: list[dict]) -> None:

    """
    Persist a freshly-generated test suite so future identical requests
    skip Groq generation entirely.

    Uses INSERT OR IGNORE / ON CONFLICT DO NOTHING so concurrent workers
    can both call this without raising.
    """
    key  = _suite_cache_key(description, num_tests)
    now  = _utc_now()
    data = json.dumps(tests, ensure_ascii=False)

    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                """
                INSERT INTO test_suite_cache
                    (cache_key, description, num_tests, tests_json, hit_count, created_at, last_used_at)
                VALUES (%s, %s, %s, %s, 0, %s, %s)
                ON CONFLICT (cache_key) DO NOTHING
                """,
                (key, description.strip(), int(num_tests), data, now, now),
            )
        else:
            cur.execute(
                """
                INSERT OR IGNORE INTO test_suite_cache
                    (cache_key, description, num_tests, tests_json, hit_count, created_at, last_used_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)
                """,
                (key, description.strip(), int(num_tests), data, now, now),
            )

  # already imported at top of file — this line is just for reference
 
STUCK_AFTER_MINUTES: int = int(_os.getenv("STUCK_REPORT_MINUTES", "15"))
 
 
def get_stuck_processing_reports(older_than_minutes: int = STUCK_AFTER_MINUTES) -> list[dict]:
    """
    Return reports stuck in 'processing' for longer than `older_than_minutes`.
 
    Also returns reports already marked 'stale' (older_than_minutes=0 trick
    used by /health to count them). Pass 0 to get all stale reports regardless
    of age.
 
    Logic:
      - older_than_minutes > 0  → find 'processing' rows where updated_at is old
      - older_than_minutes == 0 → find all 'stale' rows (for health/monitoring)
    """
    from datetime import timedelta
 
    with _get_conn() as conn:
        cur = conn.cursor()
 
        if older_than_minutes == 0:
            # Health check path: count already-marked stale reports
            cur.execute(
                f"SELECT report_id, client_name, updated_at FROM evaluation_reports WHERE status = {_P}",
                ("stale",),
            )
        else:
            cutoff = (
                datetime.now(timezone.utc) - timedelta(minutes=older_than_minutes)
            ).isoformat()
            cur.execute(
                f"""
                SELECT report_id, client_name, judge_model, sample_count,
                       dataset_id, model_version, created_at, updated_at
                FROM   evaluation_reports
                WHERE  status     = {_P}
                AND    updated_at < {_P}
                ORDER  BY updated_at ASC
                """,
                ("processing", cutoff),
            )
 
        return [_row_to_dict(r) for r in cur.fetchall()]
 
 
def mark_report_stale(report_id: str) -> None:
    """
    Transition a 'processing' report → 'stale'.
    Only acts if current status is exactly 'processing' (safe against races).
    """
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE evaluation_reports
               SET status     = {_P},
                   updated_at = {_P},
                   error      = {_P}
             WHERE report_id  = {_P}
               AND status     = {_P}
            """,
            (
                "stale",
                _utc_now(),
                (
                    "Report was in-flight when the server restarted. "
                    "Re-run via POST /report/{id}/retry."
                ).replace("{id}", report_id),
                report_id,
                "processing",
            ),
        )
 
 
def reset_report_for_retry(report_id: str, client_name: str) -> bool:
    """
    Reset a 'stale' report back to 'processing' so it can be re-enqueued.
    Ownership check: only the owning client can retry.
    Returns True if the row was reset, False if not found / wrong owner / wrong status.
    """
    with _get_conn() as conn:
        cur = conn.cursor()
        # Verify ownership and that it's actually stale
        cur.execute(
            f"""
            SELECT report_id FROM evaluation_reports
            WHERE  report_id   = {_P}
              AND  client_name = {_P}
              AND  status      = {_P}
            """,
            (report_id, client_name, "stale"),
        )
        if not cur.fetchone():
            return False
 
        cur.execute(
            f"""
            UPDATE evaluation_reports
               SET status     = {_P},
                   updated_at = {_P},
                   error      = NULL
             WHERE report_id  = {_P}
            """,
            ("processing", _utc_now(), report_id),
        )
        return True
