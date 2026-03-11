"""
database.py — unified DB layer for Breaker Lab.

Strategy:
  - If DATABASE_URL env var is set (Railway Postgres), use psycopg2.
  - Otherwise fall back to SQLite (local dev / legacy).

All public functions share the same signature as before so routes.py
needs zero changes except for the new delete helpers at the bottom.
"""

from __future__ import annotations

import hashlib
import json
import os
import psycopg2
import psycopg2.extras
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

# ── Connection helpers ────────────────────────────────────────────────────────

if _USE_PG:
    

    @contextmanager
    def _get_conn() -> Generator:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

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
            # Indexes for common query patterns
            cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_logs_client_name ON usage_logs(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_usage_logs_timestamp   ON usage_logs(timestamp)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_client    ON evaluation_reports(client_name)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_eval_reports_created   ON evaluation_reports(created_at)")

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
            # Migrate: add missing columns to usage_logs
            cur.execute("PRAGMA table_info(usage_logs)")
            existing = {row[1] for row in cur.fetchall()}
            for col in ["client_id", "client_name", "dataset_id", "model_version", "evaluation_date"]:
                if col not in existing:
                    cur.execute(f"ALTER TABLE usage_logs ADD COLUMN {col} TEXT")
            # Migrate: add html_content to evaluation_reports if missing
            cur.execute("PRAGMA table_info(evaluation_reports)")
            existing = {row[1] for row in cur.fetchall()}
            if "html_content" not in existing:
                cur.execute("ALTER TABLE evaluation_reports ADD COLUMN html_content TEXT")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


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


def get_client_by_api_key(api_key: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT id, name, api_key_hash, active, created_at FROM clients WHERE api_key_hash = {_P} AND active = 1 LIMIT 1",
            (_hash_key(api_key),),
        )
        return _row_to_dict(cur.fetchone())


# ── Usage logging ─────────────────────────────────────────────────────────────

def log_usage(report_id, api_key, sample_count, client=None, dataset_id=None, model_version=None, evaluation_date=None):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO usage_logs(
                client_id, client_name, report_id, dataset_id, model_version,
                evaluation_date, api_key_hash, timestamp, sample_count
            ) VALUES ({_ph(9)})
            """,
            (
                client.get("id") if client else None,
                client.get("name") if client else None,
                report_id,
                dataset_id,
                model_version,
                evaluation_date,
                _hash_key(api_key),
                _utc_now(),
                sample_count,
            ),
        )


def get_usage_history(limit: int = 200) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT client_id, client_name, report_id, dataset_id, model_version,
                   evaluation_date, timestamp, sample_count
            FROM usage_logs ORDER BY timestamp DESC LIMIT {_P}
            """,
            (int(limit),),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def get_usage_summary(client_name: str | None = None) -> dict:
    with _get_conn() as conn:
        cur = conn.cursor()
        today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")

        def _q(extra_where="", params=()):
            cur.execute(
                f"SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count "
                f"FROM usage_logs WHERE 1=1 {extra_where}",
                params,
            )
            return _row_to_dict(cur.fetchone())

        if client_name:
            overall = _q(f"AND client_name = {_P}", (client_name,))
            today   = _q(f"AND client_name = {_P} AND timestamp LIKE {_P}", (client_name, f"{today_prefix}%"))
            month   = _q(f"AND client_name = {_P} AND timestamp LIKE {_P}", (client_name, f"{month_prefix}%"))
        else:
            overall = _q()
            today   = _q(f"AND timestamp LIKE {_P}", (f"{today_prefix}%",))
            month   = _q(f"AND timestamp LIKE {_P}", (f"{month_prefix}%",))

    return {"today": today, "month": month, "overall": overall}


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


# ── Report CRUD ───────────────────────────────────────────────────────────────

def insert_report(report_id, client_id, client_name, status, judge_model,
                  sample_count, dataset_id, model_version):
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO evaluation_reports(
                report_id, client_id, client_name, status, judge_model,
                sample_count, dataset_id, model_version, created_at, updated_at
            ) VALUES ({_ph(10)})
            """,
            (report_id, client_id, client_name, status, judge_model,
             sample_count, dataset_id, model_version, now, now),
        )


def get_report(report_id: str) -> dict | None:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT * FROM evaluation_reports WHERE report_id = {_P}",
            (report_id,),
        )
        return _row_to_dict(cur.fetchone())


def update_report_success(report_id, results_json, metrics_json, html_path, html_content,
                          total_tokens=None, total_cost_usd=None):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            UPDATE evaluation_reports SET
                status={_P}, results_json={_P}, metrics_json={_P},
                html_path={_P}, html_content={_P},
                total_tokens={_P}, total_cost_usd={_P}, updated_at={_P}
            WHERE report_id={_P}
            """,
            ("done", results_json, metrics_json, html_path, html_content,
             total_tokens, total_cost_usd, _utc_now(), report_id),
        )


def update_report_failure(report_id, error_message):
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE evaluation_reports SET status={_P}, error={_P}, updated_at={_P} WHERE report_id={_P}",
            ("failed", error_message, _utc_now(), report_id),
        )


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


def list_reports_for_client(client_name: str, limit: int = 50) -> list[dict]:
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT report_id, status, judge_model, sample_count, created_at, updated_at,
                   total_tokens, total_cost_usd
            FROM evaluation_reports
            WHERE client_name = {_P}
            ORDER BY created_at DESC LIMIT {_P}
            """,
            (client_name, int(limit)),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]