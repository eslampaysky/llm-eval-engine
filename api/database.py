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
import logging
import os
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Generator

_log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

_RAW_DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()

def _is_postgres_url(url: str) -> bool:
    return url.startswith("postgresql://") or url.startswith("postgres://")

_USE_PG = _is_postgres_url(_RAW_DATABASE_URL)

# Normalize scheme for compatibility (Railway commonly uses postgres://...).
DATABASE_URL: str | None = None
if _USE_PG:
    DATABASE_URL = (
        "postgresql://" + _RAW_DATABASE_URL[len("postgres://") :]
        if _RAW_DATABASE_URL.startswith("postgres://")
        else _RAW_DATABASE_URL
    )

# SQLite fallback path
_DATA_DIR = os.getenv("DATA_DIR")
_SQLITE_FILE = (
    os.path.join(_DATA_DIR, "usage.db")
    if _DATA_DIR
    else os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "usage.db"))
)

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
    def _ensure_sqlite_dir() -> None:
        db_dir = os.path.dirname(_SQLITE_FILE)
        if not db_dir:
            return
        try:
            os.makedirs(db_dir, exist_ok=True)
        except Exception:
            # If we can't create it here, sqlite will raise a clearer error on connect.
            pass

    @contextmanager
    def _get_conn() -> Generator:
        _ensure_sqlite_dir()
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
    if _USE_PG:
        _log.info("[DB] Initializing Postgres schema")
    else:
        _log.info("[DB] Initializing SQLite schema file=%s", _SQLITE_FILE)
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
                    shared BOOLEAN NOT NULL DEFAULT TRUE,
                    status TEXT NOT NULL,
                    judge_model TEXT,
                    sample_count INTEGER NOT NULL,
                    dataset_id TEXT,
                    model_version TEXT,
                    target_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    results_json TEXT,
                    metrics_json TEXT,
                    html_path TEXT,
                    html_content TEXT,
                    total_tokens INTEGER,
                    total_cost_usd REAL,
                    esg_metrics TEXT,
                    error TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS web_audit_reports (
                    audit_id     TEXT PRIMARY KEY,
                    client_name  TEXT,
                    url          TEXT,
                    description  TEXT,
                    status       TEXT NOT NULL DEFAULT 'queued',
                    health       TEXT,
                    confidence   INTEGER,
                    issues_json  TEXT,
                    passed_json  TEXT,
                    summary      TEXT,
                    video_path   TEXT,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS targets (
                    target_id TEXT PRIMARY KEY,
                    client_id INTEGER,
                    client_name TEXT,
                    name TEXT NOT NULL,
                    description TEXT,
                    base_url TEXT,
                    model_name TEXT,
                    api_key_enc TEXT,
                    repo_id TEXT,
                    endpoint_url TEXT,
                    payload_template TEXT,
                    headers_json TEXT,
                    chain_import_path TEXT,
                    invoke_key TEXT,
                    target_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (client_id) REFERENCES clients(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    user_id TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    plan TEXT NOT NULL DEFAULT 'free',
                    plan_expires_at TEXT,
                    paddle_customer_id TEXT,
                    paddle_subscription_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    used BOOLEAN NOT NULL DEFAULT FALSE
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
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sales_leads (
                    id SERIAL PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    company TEXT NOT NULL,
                    use_case TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    contacted BOOLEAN NOT NULL DEFAULT FALSE
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
            cur.execute("""
                CREATE TABLE IF NOT EXISTS feature_monitors (
                    monitor_id    TEXT PRIMARY KEY,
                    client_name   TEXT,
                    feature_name  TEXT,
                    description   TEXT,
                    target_json   TEXT,
                    test_inputs_json TEXT,
                    schedule      TEXT DEFAULT 'daily',
                    alert_webhook TEXT,
                    baseline_json TEXT,
                    last_run_at   TEXT,
                    last_status   TEXT DEFAULT 'pending',
                    created_at    TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS monitor_runs (
                    run_id        TEXT PRIMARY KEY,
                    monitor_id    TEXT,
                    client_name   TEXT,
                    ran_at        TEXT,
                    regression_detected INTEGER DEFAULT 0,
                    severity      TEXT,
                    results_json  TEXT,
                    FOREIGN KEY(monitor_id) REFERENCES feature_monitors(monitor_id)
                )
            """)
            # Indexes for common query patterns
            cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_logs_client_name ON usage_logs(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp   ON usage_logs(timestamp)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_client    ON evaluation_reports(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_created   ON evaluation_reports(created_at)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_test_cache_key         ON test_suite_cache(cache_key)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_demo_runs_date         ON demo_runs(run_date)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_targets_client         ON targets(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id  ON password_reset_tokens(user_id)")
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'evaluation_reports'
            """)
            existing = {row["column_name"] for row in cur.fetchall()}
            if "share_token" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN share_token TEXT UNIQUE")
            if "shared" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN shared BOOLEAN NOT NULL DEFAULT TRUE")
            if "html_content" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN html_content TEXT")
            if "target_id" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN target_id TEXT")
                existing.add("target_id")
            if "esg_metrics" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS esg_metrics TEXT")
            if "target_id" in existing:
                cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_target ON evaluation_reports(target_id)")

            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'web_audit_reports'
            """)
            existing_web_audit = {row["column_name"] for row in cur.fetchall()}
            if "share_token" not in existing_web_audit:
                cur.execute("ALTER TABLE web_audit_reports ADD COLUMN share_token TEXT UNIQUE")

            # Users table migrations
            cur.execute("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'users'
            """)
            existing_users = {row["column_name"] for row in cur.fetchall()}
            if "plan" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'")
            if "plan_expires_at" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN plan_expires_at TEXT")
            if "paddle_customer_id" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN paddle_customer_id TEXT")
            if "paddle_subscription_id" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN paddle_subscription_id TEXT")

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
                    shared INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL,
                    judge_model TEXT,
                    sample_count INTEGER NOT NULL,
                    dataset_id TEXT,
                    model_version TEXT,
                    target_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    results_json TEXT,
                    metrics_json TEXT,
                    html_path TEXT,
                    html_content TEXT,
                    total_tokens INTEGER,
                    total_cost_usd REAL,
                    esg_metrics TEXT,
                    error TEXT
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS web_audit_reports (
                    audit_id     TEXT PRIMARY KEY,
                    client_name  TEXT,
                    url          TEXT,
                    description  TEXT,
                    status       TEXT NOT NULL DEFAULT 'queued',
                    health       TEXT,
                    confidence   INTEGER,
                    issues_json  TEXT,
                    passed_json  TEXT,
                    summary      TEXT,
                    video_path   TEXT,
                    created_at   TEXT NOT NULL,
                    updated_at   TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS targets (
                    target_id TEXT PRIMARY KEY,
                    client_id INTEGER,
                    client_name TEXT,
                    name TEXT NOT NULL,
                    description TEXT,
                    base_url TEXT,
                    model_name TEXT,
                    api_key_enc TEXT,
                    repo_id TEXT,
                    endpoint_url TEXT,
                    payload_template TEXT,
                    headers_json TEXT,
                    chain_import_path TEXT,
                    invoke_key TEXT,
                    target_type TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(client_id) REFERENCES clients(id)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    is_active INTEGER NOT NULL DEFAULT 1,
                    plan TEXT NOT NULL DEFAULT 'free',
                    plan_expires_at TEXT,
                    paddle_customer_id TEXT,
                    paddle_subscription_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS password_reset_tokens (
                    token TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0
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
            cur.execute("""
                CREATE TABLE IF NOT EXISTS sales_leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    company TEXT NOT NULL,
                    use_case TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    contacted INTEGER NOT NULL DEFAULT 0
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
            cur.execute("""
                CREATE TABLE IF NOT EXISTS feature_monitors (
                    monitor_id    TEXT PRIMARY KEY,
                    client_name   TEXT,
                    feature_name  TEXT,
                    description   TEXT,
                    target_json   TEXT,
                    test_inputs_json TEXT,
                    schedule      TEXT DEFAULT 'daily',
                    alert_webhook TEXT,
                    baseline_json TEXT,
                    last_run_at   TEXT,
                    last_status   TEXT DEFAULT 'pending',
                    created_at    TEXT NOT NULL
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS monitor_runs (
                    run_id        TEXT PRIMARY KEY,
                    monitor_id    TEXT,
                    client_name   TEXT,
                    ran_at        TEXT,
                    regression_detected INTEGER DEFAULT 0,
                    severity      TEXT,
                    results_json  TEXT,
                    FOREIGN KEY(monitor_id) REFERENCES feature_monitors(monitor_id)
                )
            """)
            # Migrate: add missing columns to usage_logs
            cur.execute("PRAGMA table_info(usage_logs)")
            existing = {row[1] for row in cur.fetchall()}
            for col in ["client_id", "client_name", "dataset_id", "model_version", "evaluation_date"]:
                if col not in existing:
                    cur.execute(f"ALTER TABLE usage_logs ADD COLUMN {col} TEXT")
            # Migrate: add extra columns to evaluation_reports if missing
            cur.execute("PRAGMA table_info(evaluation_reports)")
            existing = {row[1] for row in cur.fetchall()}
            if "share_token" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN share_token TEXT")
            if "shared" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN shared INTEGER NOT NULL DEFAULT 1")
            if "html_content" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN html_content TEXT")
            if "target_id" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN target_id TEXT")
                existing.add("target_id")
            if "esg_metrics" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN esg_metrics TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_demo_runs_date ON demo_runs(run_date)")
            if "target_id" in existing:
                cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_target ON evaluation_reports(target_id)")

            cur.execute("PRAGMA table_info(web_audit_reports)")
            existing_web_audit = {row[1] for row in cur.fetchall()}
            if "share_token" not in existing_web_audit:
                cur.execute("ALTER TABLE web_audit_reports ADD COLUMN share_token TEXT")

            # Migrate: add billing columns to users if missing
            cur.execute("PRAGMA table_info(users)")
            existing_users = {row[1] for row in cur.fetchall()}
            if "plan" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'")
            if "plan_expires_at" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN plan_expires_at TEXT")
            if "paddle_customer_id" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN paddle_customer_id TEXT")
            if "paddle_subscription_id" not in existing_users:
                cur.execute("ALTER TABLE users ADD COLUMN paddle_subscription_id TEXT")
            # Migrate: add missing columns to targets
            cur.execute("PRAGMA table_info(targets)")
            existing_targets = {row[1] for row in cur.fetchall()}
            for col in ["repo_id", "endpoint_url", "payload_template", "headers_json", "chain_import_path", "invoke_key"]:
                if col not in existing_targets:
                    cur.execute(f"ALTER TABLE targets ADD COLUMN {col} TEXT")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_targets_client ON targets(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id)")


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
                f"""
                SELECT
                    COUNT(*) as req_count,
                    COALESCE(SUM(u.sample_count), 0) as sample_count,
                    COALESCE(SUM(r.total_tokens), 0) as total_tokens,
                    COALESCE(SUM(r.total_cost_usd), 0) as total_cost_usd
                FROM usage_logs u
                LEFT JOIN evaluation_reports r ON r.report_id = u.report_id
                WHERE u.client_name={_P} AND u.timestamp LIKE {_P}
                """,
                (client_name, f"{prefix}%"),
            )
        else:
            cur.execute(
                f"""
                SELECT
                    COUNT(*) as req_count,
                    COALESCE(SUM(u.sample_count), 0) as sample_count,
                    COALESCE(SUM(r.total_tokens), 0) as total_tokens,
                    COALESCE(SUM(r.total_cost_usd), 0) as total_cost_usd
                FROM usage_logs u
                LEFT JOIN evaluation_reports r ON r.report_id = u.report_id
                WHERE u.client_name={_P}
                """,
                (client_name,),
            )
        row = _row_to_dict(cur.fetchone()) or {}

    return {
        "req_count": int(row.get("req_count") or 0),
        "sample_count": int(row.get("sample_count") or 0),
        "total_tokens": int(row.get("total_tokens") or 0),
        "total_cost_usd": float(row.get("total_cost_usd") or 0),
    }


def get_usage_count(client_name: str, prefix: str | None) -> int:
    """Return number of runs for the given client and optional timestamp prefix."""
    return int(get_usage_slice(client_name, prefix).get("req_count", 0))


# ── Drift / model score helpers ────────────────────────────────────────────────


def get_model_scores(
    model_version: str | None,
    cutoff_iso: str | None = None,
) -> list[dict]:
    """
    Return per-report scores for a given model_version, ordered by created_at ASC.

    Each row is a dict with keys:
      - created_at: ISO timestamp string
      - score: float average_score from metrics_json (0.0 if missing)
    Optionally filters to created_at >= cutoff_iso when provided.
    """
    with _get_conn() as conn:
        cur = conn.cursor()
        params: list[Any] = []
        where = [f"status = {_P}"]
        params.append("done")
        if model_version:
            where.append(f"model_version = {_P}")
            params.append(model_version)
        if cutoff_iso:
            where.append(f"created_at >= {_P}")
            params.append(cutoff_iso)
        cur.execute(
            f"""
            SELECT created_at, metrics_json
            FROM evaluation_reports
            WHERE {" AND ".join(where)}
            ORDER BY created_at ASC
            """,
            params,
        )
        rows = cur.fetchall()

    result: list[dict] = []
    for row in rows:
        data = _row_to_dict(row) or {}
        created_at = data.get("created_at")
        raw_metrics = data.get("metrics_json")
        score_val: float = 0.0
        if isinstance(raw_metrics, str) and raw_metrics:
            try:
                metrics = json.loads(raw_metrics)
                score_val = float(metrics.get("average_score", 0.0) or 0.0)
            except Exception:
                score_val = 0.0
        result.append(
            {
                "created_at": created_at,
                "score": score_val,
            }
        )
    return result


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
                  sample_count, dataset_id, model_version, target_id=None, shared: bool = True):
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO evaluation_reports(
                report_id, client_id, client_name, share_token, shared, status, judge_model,
                sample_count, dataset_id, model_version, target_id, created_at, updated_at
            ) VALUES ({_ph(13)})
            """,
            (report_id, client_id, client_name, share_token, int(bool(shared)) if not _USE_PG else bool(shared),
             status, judge_model, sample_count, dataset_id, model_version, target_id, now, now),
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


def update_report_esg_metrics(report_id: str, esg_metrics: dict | None) -> None:
    """
    Persist ESG metrics JSON for a completed report.

    Stores a JSON-encoded string in the esg_metrics column for both Postgres and SQLite.
    """
    if not esg_metrics:
        return
    payload = json.dumps(esg_metrics, ensure_ascii=False)
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE evaluation_reports
               SET esg_metrics={_P},
                   updated_at={_P}
             WHERE report_id={_P}
            """,
            (payload, _utc_now(), report_id),
        )


def finalize_report_failure(report_id, error_message):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE evaluation_reports SET status={_P}, updated_at={_P}, error={_P} WHERE report_id={_P} AND status != {_P}",
            ("failed", _utc_now(), error_message[:2000], report_id, "canceled"),
        )


# ── Web audit reports ─────────────────────────────────────────────────────────

def insert_web_audit_report(*, audit_id, client_name, url, description, status="queued"):
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO web_audit_reports(
                audit_id, client_name, url, description, status, created_at, updated_at
            ) VALUES ({_ph(7)})
            """,
            (audit_id, client_name, url, description, status, now, now),
        )


def update_web_audit_status(audit_id: str, status: str) -> None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE web_audit_reports
               SET status={_P}, updated_at={_P}
             WHERE audit_id={_P}
            """,
            (status, _utc_now(), audit_id),
        )


def finalize_web_audit_success(
    *,
    audit_id: str,
    health: str | None,
    confidence: int | None,
    issues_json: str | None,
    passed_json: str | None,
    summary: str | None,
    video_path: str | None,
) -> None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE web_audit_reports
               SET status={_P},
                   health={_P},
                   confidence={_P},
                   issues_json={_P},
                   passed_json={_P},
                   summary={_P},
                   video_path={_P},
                   updated_at={_P}
             WHERE audit_id={_P}
            """,
            (
                "done",
                health,
                confidence,
                issues_json,
                passed_json,
                summary,
                video_path,
                _utc_now(),
                audit_id,
            ),
        )


def finalize_web_audit_failure(audit_id: str) -> None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE web_audit_reports
               SET status={_P},
                   updated_at={_P}
             WHERE audit_id={_P}
            """,
            ("failed", _utc_now(), audit_id),
        )


def get_web_audit_row(audit_id: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM web_audit_reports WHERE audit_id=%s" % _P
            if _USE_PG else
            "SELECT * FROM web_audit_reports WHERE audit_id=?",
            (audit_id,),
        )
        return _row_to_dict(cur.fetchone())


def add_share_token_to_web_audit(audit_id: str, client_name: str, token: str) -> None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE web_audit_reports
               SET share_token={_P}
             WHERE audit_id={_P}
               AND client_name={_P}
            """,
            (token, audit_id, client_name),
        )


def get_web_audit_by_share_token(token: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM web_audit_reports WHERE share_token=%s" % _P
            if _USE_PG else
            "SELECT * FROM web_audit_reports WHERE share_token=?",
            (token,),
        )
        return _row_to_dict(cur.fetchone())


# ── Feature monitors ─────────────────────────────────────────────────────────

def create_feature_monitor(
    *,
    monitor_id: str,
    client_name: str,
    feature_name: str,
    description: str,
    target_json: str,
    test_inputs_json: str,
    schedule: str,
    alert_webhook: str | None,
) -> None:
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO feature_monitors(
                monitor_id, client_name, feature_name, description, target_json,
                test_inputs_json, schedule, alert_webhook, baseline_json,
                last_run_at, last_status, created_at
            ) VALUES ({_ph(12)})
            """,
            (
                monitor_id,
                client_name,
                feature_name,
                description,
                target_json,
                test_inputs_json,
                schedule,
                alert_webhook,
                None,
                None,
                "pending",
                now,
            ),
        )


def update_feature_monitor_baseline(monitor_id: str, baseline_json: str, status: str = "ready") -> None:
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE feature_monitors
               SET baseline_json={_P},
                   last_run_at={_P},
                   last_status={_P}
             WHERE monitor_id={_P}
            """,
            (baseline_json, now, status, monitor_id),
        )


def update_feature_monitor_status(monitor_id: str, status: str) -> None:
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE feature_monitors
               SET last_run_at={_P},
                   last_status={_P}
             WHERE monitor_id={_P}
            """,
            (now, status, monitor_id),
        )


def get_feature_monitor(monitor_id: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT * FROM feature_monitors WHERE monitor_id=%s" % _P
            if _USE_PG else
            "SELECT * FROM feature_monitors WHERE monitor_id=?",
            (monitor_id,),
        )
        return _row_to_dict(cur.fetchone())


def list_monitors_for_client(client_name: str) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT monitor_id, client_name, feature_name, description, target_json,
                   test_inputs_json, schedule, alert_webhook, baseline_json,
                   last_run_at, last_status, created_at
            FROM feature_monitors
            WHERE client_name={_P}
            ORDER BY created_at DESC
            """,
            (client_name,),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def insert_monitor_run(
    *,
    run_id: str,
    monitor_id: str,
    client_name: str,
    ran_at: str,
    regression_detected: bool,
    severity: str | None,
    results_json: str,
) -> None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO monitor_runs(
                run_id, monitor_id, client_name, ran_at,
                regression_detected, severity, results_json
            ) VALUES ({_ph(7)})
            """,
            (
                run_id,
                monitor_id,
                client_name,
                ran_at,
                1 if regression_detected else 0,
                severity,
                results_json,
            ),
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


def set_report_shared(report_id: str, client_name: str, shared: bool) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE evaluation_reports SET shared=%s WHERE report_id=%s AND client_name=%s",
                (bool(shared), report_id, client_name),
            )
        else:
            cur.execute(
                "UPDATE evaluation_reports SET shared=? WHERE report_id=? AND client_name=?",
                (1 if shared else 0, report_id, client_name),
            )
        return (cur.rowcount or 0) > 0


def list_reports_for_client(client_name: str) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT report_id, share_token, shared, status, judge_model, sample_count, dataset_id,
                   model_version, target_id, created_at, updated_at, metrics_json, total_cost_usd, esg_metrics, error
            FROM evaluation_reports
            WHERE client_name={_P}
            ORDER BY created_at DESC
            LIMIT 200
            """,
            (client_name,),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def list_all_audits_for_client(client_name: str, limit: int = 100) -> list[dict]:
    web_rows: list[dict] = []
    monitor_rows: list[dict] = []
    with _get_conn() as conn:
        cur = conn.cursor()
        try:
            cur.execute(
                f"""
                SELECT audit_id as id, 'web_audit' as type, url as title,
                       status, health, issues_json, created_at
                FROM web_audit_reports
                WHERE client_name={_P}
                ORDER BY created_at DESC
                LIMIT {_P}
                """,
                (client_name, int(limit)),
            )
            web_rows = [_row_to_dict(r) for r in cur.fetchall()]
        except Exception:
            web_rows = []

        try:
            cur.execute(
                f"""
                SELECT run_id as id, 'monitor_check' as type, monitor_id as title,
                       ran_at as created_at,
                       CASE WHEN regression_detected=1 THEN 'critical' ELSE 'good' END as health,
                       results_json as issues_json,
                       'done' as status
                FROM monitor_runs
                WHERE client_name={_P}
                ORDER BY ran_at DESC
                LIMIT {_P}
                """,
                (client_name, int(limit)),
            )
            monitor_rows = [_row_to_dict(r) for r in cur.fetchall()]
        except Exception:
            monitor_rows = []

    combined = (web_rows or []) + (monitor_rows or [])
    combined.sort(key=lambda r: r.get("created_at") or "", reverse=True)
    combined = combined[: int(limit)]
    for row in combined:
        issues_raw = row.get("issues_json") or "[]"
        try:
            issues = json.loads(issues_raw) if isinstance(issues_raw, str) else issues_raw
            issues_count = len(issues or [])
        except Exception:
            issues_count = 0
        row["issues_count"] = issues_count
        if row.get("type") == "web_audit":
            row["detail_url"] = f"/app/web-audit"
        elif row.get("type") == "monitor_check":
            row["detail_url"] = f"/app/monitors"
        else:
            row["detail_url"] = "/app"
    return combined


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
 
STUCK_AFTER_MINUTES: int = int(os.getenv("STUCK_REPORT_MINUTES", "15"))
 
 
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


# -- Targets ---------------------------------------------------------------

def create_target(
    *,
    client,
    name,
    description,
    base_url,
    model_name,
    api_key_enc,
    target_type,
    repo_id=None,
    endpoint_url=None,
    payload_template=None,
    headers=None,
    chain_import_path=None,
    invoke_key=None,
) -> dict:
    target_id = str(uuid.uuid4())
    now = _utc_now()
    client_name = client.get("name") if isinstance(client, dict) else None
    client_id = client.get("id") if isinstance(client, dict) else None
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO targets(
                target_id, client_id, client_name, name, description, base_url,
                model_name, api_key_enc, repo_id, endpoint_url, payload_template,
                headers_json, chain_import_path, invoke_key, target_type, created_at, updated_at
            ) VALUES ({_ph(17)})
            """,
            (
                target_id,
                client_id,
                client_name,
                name,
                description,
                base_url,
                model_name,
                api_key_enc,
                repo_id,
                endpoint_url,
                payload_template,
                json.dumps(headers or {}) if headers else None,
                chain_import_path,
                invoke_key,
                target_type,
                now,
                now,
            ),
        )
    return {
        "target_id": target_id,
        "name": name,
        "description": description,
        "base_url": base_url,
        "model_name": model_name,
        "repo_id": repo_id,
        "endpoint_url": endpoint_url,
        "payload_template": payload_template,
        "headers": headers,
        "chain_import_path": chain_import_path,
        "invoke_key": invoke_key,
        "target_type": target_type,
        "created_at": now,
    }


def list_targets_for_client(client_name: str) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT target_id, name, description, base_url, model_name,
                   repo_id, endpoint_url, payload_template, headers_json,
                   chain_import_path, invoke_key, target_type, created_at, updated_at
            FROM targets
            WHERE client_name={_P}
            ORDER BY created_at DESC
            """,
            (client_name,),
        )
        targets = []
        for row in cur.fetchall():
            data = _row_to_dict(row)
            headers_json = data.get("headers_json")
            if headers_json:
                try:
                    data["headers"] = json.loads(headers_json)
                except Exception:
                    data["headers"] = None
            data.pop("headers_json", None)
            targets.append(data)
        return targets


def get_target_by_id(target_id: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT * FROM targets WHERE target_id={_P}",
            (target_id,),
        )
        row = _row_to_dict(cur.fetchone())
        if not row:
            return None
        headers_json = row.get("headers_json")
        if headers_json:
            try:
                row["headers"] = json.loads(headers_json)
            except Exception:
                row["headers"] = None
        row.pop("headers_json", None)
        return row


def list_report_ids_for_target(target_id: str, client_name: str) -> list[str]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT report_id
            FROM evaluation_reports
            WHERE target_id={_P} AND client_name={_P}
            ORDER BY created_at DESC
            """,
            (target_id, client_name),
        )
        rows = cur.fetchall()
        report_ids: list[str] = []
        for row in rows:
            if isinstance(row, dict):
                report_ids.append(str(row.get("report_id")))
            else:
                report_ids.append(str(row[0]))
        return report_ids


def associate_report_with_target(report_id: str, target_id: str, client_name: str) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE evaluation_reports
               SET target_id={_P}, updated_at={_P}
             WHERE report_id={_P} AND client_name={_P}
            """,
            (target_id, _utc_now(), report_id, client_name),
        )
        return cur.rowcount > 0


def delete_target(target_id: str, client_name: str) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT target_id FROM targets WHERE target_id={_P} AND client_name={_P}",
            (target_id, client_name),
        )
        if not cur.fetchone():
            return False
        cur.execute(
            f"UPDATE evaluation_reports SET target_id=NULL WHERE target_id={_P} AND client_name={_P}",
            (target_id, client_name),
        )
        cur.execute(
            f"DELETE FROM targets WHERE target_id={_P} AND client_name={_P}",
            (target_id, client_name),
        )
        return True


# -- User account helpers --------------------------------------------------

def create_user(name: str, email: str, password_hash: str) -> dict:
    """Insert a new user row. Raises ValueError if email already exists."""
    user_id = str(uuid.uuid4())
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        try:
            if _USE_PG:
                cur.execute(
                    """
                    INSERT INTO users
                        (user_id, name, email, password_hash, is_active, created_at, updated_at)
                    VALUES (%s, %s, %s, %s, TRUE, %s, %s)
                    """,
                    (user_id, name, email.lower().strip(), password_hash, now, now),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO users
                        (user_id, name, email, password_hash, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, ?, ?)
                    """,
                    (user_id, name, email.lower().strip(), password_hash, now, now),
                )
        except Exception as exc:
            if "unique" in str(exc).lower() or "UNIQUE" in str(exc):
                raise ValueError(f"Email already registered: {email}") from exc
            raise
    return {"user_id": user_id, "name": name, "email": email.lower().strip(), "created_at": now}


def get_user_by_email(email: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, user_id, name, email, password_hash, is_active, created_at FROM users WHERE email = {_P}",
            (email.lower().strip(),),
        )
        return _row_to_dict(cur.fetchone())


def get_user_by_id(user_id: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, user_id, name, email, is_active, created_at FROM users WHERE user_id = {_P}",
            (user_id,),
        )
        return _row_to_dict(cur.fetchone())


def get_user_by_paddle_customer_id(customer_id: str) -> dict | None:
    if not customer_id:
        return None
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT id, user_id, name, email, is_active, created_at,
                   plan, plan_expires_at, paddle_customer_id, paddle_subscription_id
            FROM users
            WHERE paddle_customer_id = {_P}
            """,
            (customer_id,),
        )
        return _row_to_dict(cur.fetchone())


def get_user_plan(user_id: str) -> dict:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT plan, plan_expires_at FROM users WHERE user_id = {_P}",
            (user_id,),
        )
        row = _row_to_dict(cur.fetchone()) or {}
    return {
        "plan": row.get("plan") or "free",
        "plan_expires_at": row.get("plan_expires_at"),
    }


def set_user_plan(user_id: str, plan: str, expires_at: str | None) -> bool:
    now = _utc_now()
    plan_value = (plan or "free").strip().lower() or "free"
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE users SET plan=%s, plan_expires_at=%s, updated_at=%s WHERE user_id=%s",
                (plan_value, expires_at, now, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET plan=?, plan_expires_at=?, updated_at=? WHERE user_id=?",
                (plan_value, expires_at, now, user_id),
            )
        return (cur.rowcount or 0) > 0


def set_user_billing_ids(
    user_id: str,
    customer_id: str | None,
    subscription_id: str | None,
) -> bool:
    if not user_id:
        return False
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                """
                UPDATE users
                   SET paddle_customer_id=%s,
                       paddle_subscription_id=%s,
                       updated_at=%s
                 WHERE user_id=%s
                """,
                (customer_id, subscription_id, now, user_id),
            )
        else:
            cur.execute(
                """
                UPDATE users
                   SET paddle_customer_id=?,
                       paddle_subscription_id=?,
                       updated_at=?
                 WHERE user_id=?
                """,
                (customer_id, subscription_id, now, user_id),
            )
        return (cur.rowcount or 0) > 0


def update_user_profile(user_id: str, name: str, email: str) -> dict | None:
    """Update name and email. Returns updated user or None if not found."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        try:
            if _USE_PG:
                cur.execute(
                    "UPDATE users SET name=%s, email=%s, updated_at=%s WHERE user_id=%s",
                    (name, email.lower().strip(), now, user_id),
                )
            else:
                cur.execute(
                    "UPDATE users SET name=?, email=?, updated_at=? WHERE user_id=?",
                    (name, email.lower().strip(), now, user_id),
                )
            if (cur.rowcount or 0) == 0:
                return None
        except Exception as exc:
            # Both SQLite and Postgres will throw on UNIQUE(email) constraint violations.
            if "unique" in str(exc).lower():
                raise ValueError("That email is already in use by another account.") from exc
            raise
    return get_user_by_id(user_id)


def update_user_password(user_id: str, new_password_hash: str) -> bool:
    """Update password hash. Returns True on success."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE users SET password_hash=%s, updated_at=%s WHERE user_id=%s",
                (new_password_hash, now, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET password_hash=?, updated_at=? WHERE user_id=?",
                (new_password_hash, now, user_id),
            )
        return (cur.rowcount or 0) > 0


def deactivate_user(user_id: str) -> bool:
    """Soft-delete: mark account inactive. Returns True on success."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE users SET is_active=FALSE, updated_at=%s WHERE user_id=%s",
                (now, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET is_active=0, updated_at=? WHERE user_id=?",
                (now, user_id),
            )
        return (cur.rowcount or 0) > 0


def create_password_reset_token(user_id: str, token: str) -> None:
    """Store a password reset token for a user."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "INSERT INTO password_reset_tokens (token, user_id, created_at, used) VALUES (%s, %s, %s, FALSE)",
                (token, user_id, now),
            )
        else:
            cur.execute(
                "INSERT INTO password_reset_tokens (token, user_id, created_at, used) VALUES (?, ?, ?, 0)",
                (token, user_id, now),
            )


def get_password_reset_token(token: str) -> dict | None:
    """Fetch a password reset token row."""
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT token, user_id, created_at, used FROM password_reset_tokens WHERE token = {_P}",
            (token,),
        )
        return _row_to_dict(cur.fetchone())


def mark_password_reset_token_used(token: str) -> bool:
    """Mark a password reset token as used."""
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE password_reset_tokens SET used=TRUE WHERE token=%s",
                (token,),
            )
        else:
            cur.execute(
                "UPDATE password_reset_tokens SET used=1 WHERE token=?",
                (token,),
            )
        return (cur.rowcount or 0) > 0


# -- Sales leads -----------------------------------------------------------

def create_lead(*, name: str, email: str, company: str, use_case: str) -> dict:
    lead = {
        "name": (name or "").strip(),
        "email": (email or "").strip(),
        "company": (company or "").strip(),
        "use_case": (use_case or "").strip(),
    }
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                """
                INSERT INTO sales_leads (name, email, company, use_case, created_at, contacted)
                VALUES (%s, %s, %s, %s, %s, FALSE)
                RETURNING id
                """,
                (lead["name"], lead["email"], lead["company"], lead["use_case"], now),
            )
            row = _row_to_dict(cur.fetchone()) or {}
            lead_id = row.get("id")
        else:
            cur.execute(
                """
                INSERT INTO sales_leads (name, email, company, use_case, created_at, contacted)
                VALUES (?, ?, ?, ?, ?, 0)
                """,
                (lead["name"], lead["email"], lead["company"], lead["use_case"], now),
            )
            lead_id = cur.lastrowid
    return {
        "id": lead_id,
        **lead,
        "created_at": now,
        "contacted": False,
    }


def list_leads(contacted: bool | None = None) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        if contacted is None:
            cur.execute(
                """
                SELECT id, name, email, company, use_case, created_at, contacted
                FROM sales_leads
                ORDER BY created_at DESC
                """,
            )
        else:
            if _USE_PG:
                cur.execute(
                    """
                    SELECT id, name, email, company, use_case, created_at, contacted
                    FROM sales_leads
                    WHERE contacted = %s
                    ORDER BY created_at DESC
                    """,
                    (bool(contacted),),
                )
            else:
                cur.execute(
                    """
                    SELECT id, name, email, company, use_case, created_at, contacted
                    FROM sales_leads
                    WHERE contacted = ?
                    ORDER BY created_at DESC
                    """,
                    (1 if contacted else 0,),
                )
        return [_row_to_dict(r) for r in cur.fetchall()]


def mark_lead_contacted(lead_id: int) -> bool:
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE sales_leads SET contacted=TRUE WHERE id=%s",
                (lead_id,),
            )
        else:
            cur.execute(
                "UPDATE sales_leads SET contacted=1 WHERE id=?",
                (lead_id,),
            )
        return (cur.rowcount or 0) > 0
