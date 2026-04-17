"""
Phase 6: Audit Scheduling System

Simple, non-over-engineered scheduling for recurring audits.
Uses a database table for schedule definitions and a periodic async task
to check and execute due schedules.

No external scheduler (cron, celery-beat) needed — runs in-process.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

_log = logging.getLogger(__name__)

# Schedule intervals in minutes
SCHEDULE_INTERVALS = {
    "hourly": 60,
    "daily": 1440,
    "weekly": 10080,
    "monthly": 43200,
}


def init_schedules_table() -> None:
    """Create the scheduled_audits table if it doesn't exist."""
    try:
        from api.database import _get_conn
        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute("""
                CREATE TABLE IF NOT EXISTS scheduled_audits (
                    schedule_id    TEXT PRIMARY KEY,
                    client_name    TEXT,
                    url            TEXT NOT NULL,
                    site_description TEXT,
                    tier           TEXT NOT NULL DEFAULT 'deep',
                    schedule       TEXT NOT NULL DEFAULT 'daily',
                    active         BOOLEAN NOT NULL DEFAULT TRUE,
                    last_run_at    TEXT,
                    next_run_at    TEXT,
                    run_count      INTEGER NOT NULL DEFAULT 0,
                    last_audit_id  TEXT,
                    created_at     TEXT NOT NULL,
                    updated_at     TEXT NOT NULL
                )
            """)
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_scheduled_active "
                "ON scheduled_audits(active, next_run_at)"
            )
    except Exception as e:
        _log.warning(f"[Scheduler] Could not create table: {e}")


def create_schedule(
    *,
    client_name: str | None,
    url: str,
    site_description: str | None = None,
    tier: str = "deep",
    schedule: str = "daily",
) -> dict:
    """Create a new audit schedule."""
    from api.database import _get_conn, _utc_now, _P

    schedule_id = f"sched-{uuid.uuid4().hex[:12]}"
    now = _utc_now()

    interval_minutes = SCHEDULE_INTERVALS.get(schedule, 1440)
    next_run = (datetime.now(timezone.utc) + timedelta(minutes=interval_minutes)).isoformat()

    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            INSERT INTO scheduled_audits
                (schedule_id, client_name, url, site_description, tier, schedule,
                 active, next_run_at, run_count, created_at, updated_at)
            VALUES ({", ".join([_P] * 11)})
            """,
            (
                schedule_id, client_name, url, site_description, tier, schedule,
                True, next_run, 0, now, now,
            ),
        )

    return {
        "schedule_id": schedule_id,
        "url": url,
        "schedule": schedule,
        "tier": tier,
        "next_run_at": next_run,
    }


def list_schedules(client_name: str | None = None) -> list[dict]:
    """List all schedules, optionally filtered by client."""
    from api.database import _get_conn, _P, _row_to_dict

    with _get_conn() as conn:
        cur = conn.cursor()
        if client_name:
            cur.execute(
                f"""
                SELECT * FROM scheduled_audits
                WHERE client_name = {_P}
                ORDER BY created_at DESC
                """,
                (client_name,),
            )
        else:
            cur.execute("SELECT * FROM scheduled_audits ORDER BY created_at DESC")
        return [_row_to_dict(r) for r in cur.fetchall()]


def update_schedule(schedule_id: str, *, active: bool | None = None, schedule: str | None = None) -> bool:
    """Update a schedule's active status or interval."""
    from api.database import _get_conn, _utc_now, _P

    updates = []
    params: list[Any] = []

    if active is not None:
        updates.append(f"active = {_P}")
        params.append(active)
    if schedule is not None:
        updates.append(f"schedule = {_P}")
        params.append(schedule)

    if not updates:
        return False

    updates.append(f"updated_at = {_P}")
    params.append(_utc_now())
    params.append(schedule_id)

    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"UPDATE scheduled_audits SET {', '.join(updates)} WHERE schedule_id = {_P}",
            params,
        )
        return bool(cur.rowcount)


def delete_schedule(schedule_id: str) -> bool:
    """Delete a schedule."""
    from api.database import _get_conn, _P

    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"DELETE FROM scheduled_audits WHERE schedule_id = {_P}",
            (schedule_id,),
        )
        return bool(cur.rowcount)


def get_due_schedules() -> list[dict]:
    """Get all active schedules that are past their next_run_at."""
    from api.database import _get_conn, _P, _row_to_dict

    now = datetime.now(timezone.utc).isoformat()
    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"""
            SELECT * FROM scheduled_audits
            WHERE active = TRUE AND next_run_at <= {_P}
            ORDER BY next_run_at ASC
            LIMIT 10
            """,
            (now,),
        )
        return [_row_to_dict(r) for r in cur.fetchall()]


def mark_schedule_run(schedule_id: str, audit_id: str) -> None:
    """Mark a schedule as just-run and compute next_run_at."""
    from api.database import _get_conn, _utc_now, _P, _row_to_dict

    with _get_conn() as conn:
        cur = conn.cursor()
        cur.execute(
            f"SELECT schedule FROM scheduled_audits WHERE schedule_id = {_P}",
            (schedule_id,),
        )
        row = _row_to_dict(cur.fetchone())
        interval = SCHEDULE_INTERVALS.get((row or {}).get("schedule", "daily"), 1440)
        next_run = (datetime.now(timezone.utc) + timedelta(minutes=interval)).isoformat()

        cur.execute(
            f"""
            UPDATE scheduled_audits
            SET last_run_at = {_P},
                next_run_at = {_P},
                run_count = run_count + 1,
                last_audit_id = {_P},
                updated_at = {_P}
            WHERE schedule_id = {_P}
            """,
            (_utc_now(), next_run, audit_id, _utc_now(), schedule_id),
        )


async def run_scheduler_loop(check_interval_seconds: int = 60) -> None:
    """
    Background task that checks for due schedules and enqueues jobs.
    
    Called from main.py lifespan startup.
    """
    _log.info("[Scheduler] Starting scheduler loop (interval=%ds)", check_interval_seconds)

    while True:
        try:
            await asyncio.sleep(check_interval_seconds)
            due = get_due_schedules()
            if not due:
                continue

            _log.info("[Scheduler] Found %d due schedule(s)", len(due))

            for sched in due:
                try:
                    await _run_scheduled_audit(sched)
                except Exception as e:
                    _log.error("[Scheduler] Failed to run schedule %s: %s",
                               sched.get("schedule_id"), e)

        except asyncio.CancelledError:
            _log.info("[Scheduler] Scheduler loop cancelled")
            break
        except Exception as e:
            _log.error("[Scheduler] Unexpected error: %s", e)
            await asyncio.sleep(30)  # Back off on unexpected errors


async def _run_scheduled_audit(sched: dict) -> None:
    """Execute a single scheduled audit."""
    from api.job_queue import enqueue_job, JobQueue
    from api.database import insert_agentic_qa_report

    schedule_id = sched["schedule_id"]
    last_audit_id = sched.get("last_audit_id")
    
    # 🌟 OVERLAP PREVENTION 🌟
    if last_audit_id:
        prev_job = JobQueue.get_status(last_audit_id) or {}
        prev_status = prev_job.get("status")
        _log.warning(f"[Scheduler Debug] Checking overlap for {schedule_id}: last_audit_id={last_audit_id}, prev_status={prev_status}")
        if prev_status in ("enqueued", "running"):
            _log.warning("[Scheduler] Skipping schedule %s - previous run %s is still %s", schedule_id, last_audit_id, prev_status)
            # Bump timeline so we skip this exact window cleanly
            mark_schedule_run(schedule_id, last_audit_id)
            return

    audit_id = f"sched-run-{uuid.uuid4().hex[:12]}"
    url = sched["url"]
    tier = sched.get("tier", "deep")
    client_name = sched.get("client_name")
    description = sched.get("site_description")

    _log.info("[Scheduler] Running scheduled audit %s for %s", schedule_id, url)

    # Insert record
    try:
        insert_agentic_qa_report(
            audit_id=audit_id,
            client_name=client_name,
            url=url,
            site_description=description,
            tier=tier,
        )
    except Exception as e:
        _log.error("[Scheduler] DB insert failed: %s", e)
        return

    # Enqueue job
    try:
        from api.routes import _run_agentic_qa_job
        await enqueue_job(
            _run_agentic_qa_job,
            audit_id, url, tier,
            None,         # journeys (re-discover)
            description,  # site_description
            None,         # credentials
            client_name,
            job_id=audit_id,
            job_type="agentic_qa",
        )
    except ImportError:
        _log.warning("[Scheduler] _run_agentic_qa_job not available")
    except Exception as e:
        _log.error("[Scheduler] Enqueue failed: %s", e)
        return

    # Mark schedule as run
    mark_schedule_run(schedule_id, audit_id)
    _log.info("[Scheduler] Scheduled audit queued: %s -> %s", schedule_id, audit_id)
