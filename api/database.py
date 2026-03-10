import os
import sqlite3
from datetime import datetime, timezone
import hashlib
from typing import Any

# ── Persistent storage path ───────────────────────────────────────────────────
# On Railway: mount a Volume at /app/data to survive redeploys.
# Locally: falls back to ./usage.db in project root.
_DATA_DIR = os.getenv("DATA_DIR", "/app/data")
os.makedirs(_DATA_DIR, exist_ok=True)
DB_FILE = os.path.join(_DATA_DIR, "usage.db")


def _hash_key(api_key: str) -> str:
    return hashlib.sha256(api_key.encode()).hexdigest()


def init_db():
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS clients(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        api_key_hash TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS usage_logs(
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
    CREATE TABLE IF NOT EXISTS evaluation_runs(
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

    # Migrate: add missing columns if upgrading from older schema
    cur.execute("PRAGMA table_info(usage_logs)")
    existing_columns = {row[1] for row in cur.fetchall()}
    for col in ["client_id", "client_name", "dataset_id", "model_version", "evaluation_date"]:
        if col not in existing_columns:
            cur.execute(f"ALTER TABLE usage_logs ADD COLUMN {col} TEXT")

    conn.commit()
    conn.close()


def register_client(name: str, api_key: str):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute(
        "INSERT OR IGNORE INTO clients(name, api_key_hash, active, created_at) VALUES (?, ?, 1, ?)",
        (name, _hash_key(api_key), datetime.now(timezone.utc).isoformat()),
    )
    conn.commit()
    conn.close()


def get_client_by_api_key(api_key: str):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        "SELECT id, name, api_key_hash, active, created_at FROM clients WHERE api_key_hash = ? AND active = 1 LIMIT 1",
        (_hash_key(api_key),),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def log_usage(report_id, api_key, sample_count, client=None, dataset_id=None, model_version=None, evaluation_date=None):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO usage_logs(
            client_id, client_name, report_id, dataset_id, model_version,
            evaluation_date, api_key_hash, timestamp, sample_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            client.get("id") if client else None,
            client.get("name") if client else None,
            report_id,
            dataset_id,
            model_version,
            evaluation_date,
            _hash_key(api_key),
            datetime.now(timezone.utc).isoformat(),
            sample_count,
        ),
    )
    conn.commit()
    conn.close()


def get_usage_history(limit: int = 200) -> list[dict[str, Any]]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(
        """
        SELECT client_id, client_name, report_id, dataset_id, model_version,
               evaluation_date, timestamp, sample_count
        FROM usage_logs ORDER BY timestamp DESC LIMIT ?
        """,
        (int(limit),),
    )
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


def get_usage_summary(client_name: str | None = None) -> dict[str, Any]:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")

    def _query(extra_where="", params=()):
        cur.execute(
            f"""
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs WHERE 1=1 {extra_where}
            """,
            params,
        )
        return dict(cur.fetchone())

    if client_name:
        overall = _query("AND client_name = ?", (client_name,))
        today   = _query("AND client_name = ? AND timestamp LIKE ?", (client_name, f"{today_prefix}%"))
        month   = _query("AND client_name = ? AND timestamp LIKE ?", (client_name, f"{month_prefix}%"))
    else:
        overall = _query()
        today   = _query("AND timestamp LIKE ?", (f"{today_prefix}%",))
        month   = _query("AND timestamp LIKE ?", (f"{month_prefix}%",))

    conn.close()
    return {"today": today, "month": month, "overall": overall}


def log_evaluation_run(report_id, client_name, dataset_id, model_version, summary):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT OR REPLACE INTO evaluation_runs(
            report_id, client_name, dataset_id, model_version, timestamp,
            correctness, relevance, hallucination, overall
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            report_id, client_name, dataset_id, model_version,
            datetime.now(timezone.utc).isoformat(),
            float(summary.get("correctness", 0) or 0),
            float(summary.get("relevance", 0) or 0),
            float(summary.get("hallucination", 0) or 0),
            float(summary.get("overall", 0) or 0),
        ),
    )
    conn.commit()
    conn.close()


def get_latest_regression_baseline(client_name, dataset_id, current_model_version):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    where = ["client_name = ?"]
    params: list[Any] = [client_name]
    if dataset_id:
        where.append("dataset_id = ?")
        params.append(dataset_id)
    if current_model_version:
        where.append("(model_version IS NULL OR model_version != ?)")
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
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None