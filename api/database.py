import sqlite3
from datetime import datetime, timezone
import hashlib
from typing import Any

DB_FILE = "usage.db"


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

    cur.execute("PRAGMA table_info(usage_logs)")
    existing_columns = {row[1] for row in cur.fetchall()}
    if "client_id" not in existing_columns:
        cur.execute("ALTER TABLE usage_logs ADD COLUMN client_id INTEGER")
    if "client_name" not in existing_columns:
        cur.execute("ALTER TABLE usage_logs ADD COLUMN client_name TEXT")
    if "dataset_id" not in existing_columns:
        cur.execute("ALTER TABLE usage_logs ADD COLUMN dataset_id TEXT")
    if "model_version" not in existing_columns:
        cur.execute("ALTER TABLE usage_logs ADD COLUMN model_version TEXT")
    if "evaluation_date" not in existing_columns:
        cur.execute("ALTER TABLE usage_logs ADD COLUMN evaluation_date TEXT")

    conn.commit()
    conn.close()


def register_client(name: str, api_key: str):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    cur.execute(
        """
        INSERT OR IGNORE INTO clients(name, api_key_hash, active, created_at)
        VALUES (?, ?, 1, ?)
        """,
        (name, _hash_key(api_key), datetime.now(timezone.utc).isoformat()),
    )

    conn.commit()
    conn.close()


def get_client_by_api_key(api_key: str):
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    cur.execute(
        """
        SELECT id, name, api_key_hash, active, created_at
        FROM clients
        WHERE api_key_hash = ? AND active = 1
        LIMIT 1
        """,
        (_hash_key(api_key),),
    )
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None


def log_usage(report_id, api_key, sample_count, client=None, dataset_id=None, model_version=None, evaluation_date=None):

    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()

    api_hash = _hash_key(api_key)
    client_id = client.get("id") if client else None
    client_name = client.get("name") if client else None

    cur.execute(
        """
        INSERT INTO usage_logs(
            client_id, client_name, report_id, dataset_id, model_version, evaluation_date,
            api_key_hash, timestamp, sample_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            client_id,
            client_name,
            report_id,
            dataset_id,
            model_version,
            evaluation_date,
            api_hash,
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
        SELECT client_id, client_name, report_id, dataset_id, model_version, evaluation_date, timestamp, sample_count
        FROM usage_logs
        ORDER BY timestamp DESC
        LIMIT ?
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

    if client_name:
        cur.execute(
            """
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs
            WHERE client_name = ?
            """,
            (client_name,),
        )
        overall = dict(cur.fetchone())

        cur.execute(
            """
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs
            WHERE client_name = ? AND timestamp LIKE ?
            """,
            (client_name, f"{today_prefix}%"),
        )
        today = dict(cur.fetchone())

        cur.execute(
            """
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs
            WHERE client_name = ? AND timestamp LIKE ?
            """,
            (client_name, f"{month_prefix}%"),
        )
        month = dict(cur.fetchone())
    else:
        cur.execute(
            """
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs
            """
        )
        overall = dict(cur.fetchone())
        cur.execute(
            """
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs
            WHERE timestamp LIKE ?
            """,
            (f"{today_prefix}%",),
        )
        today = dict(cur.fetchone())
        cur.execute(
            """
            SELECT COUNT(*) as req_count, COALESCE(SUM(sample_count), 0) as sample_count
            FROM usage_logs
            WHERE timestamp LIKE ?
            """,
            (f"{month_prefix}%",),
        )
        month = dict(cur.fetchone())

    conn.close()
    return {
        "today": today,
        "month": month,
        "overall": overall,
    }
