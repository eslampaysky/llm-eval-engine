"""
Phase 4C: Observability Dashboard API

Single endpoint that aggregates all system health data into one response.
Frontend can consume this to build a real-time dashboard.
"""

from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, Query
import logging

_log = logging.getLogger(__name__)

phase_4c_router = APIRouter(prefix="/api/v1/dashboard", tags=["phase-4c-dashboard"])


@phase_4c_router.get("")
def get_dashboard(
    request: Request,
    hours: int = Query(24, ge=1, le=168),
) -> dict:
    """
    Phase 4C: Aggregated system dashboard.
    
    Returns everything a dashboard UI needs in one call:
    - System health & capacity
    - Recent audit stats
    - Top failing URLs
    - Active schedules summary
    """
    from api.concurrency_control import get_concurrency_manager
    from api.job_queue import JobQueue
    from api.database import _get_conn, _P, _row_to_dict

    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=hours)).isoformat()

    # 1. System health
    manager = get_concurrency_manager()
    concurrency = manager.get_status()
    total_running = sum(v.get("current_concurrent", 0) for v in concurrency.values())
    total_max = sum(v.get("max_concurrent", 0) for v in concurrency.values())

    system_health = {
        "status": "healthy" if total_running < total_max else "at_capacity",
        "utilization_percent": round(total_running / total_max * 100, 1) if total_max else 0,
        "jobs_running": total_running,
        "capacity": total_max,
        "queue_size": JobQueue.queue_size,
        "queue_healthy": JobQueue.is_healthy,
    }

    # 2. Audit stats from DB
    audit_stats = _get_audit_stats(cutoff)

    # 3. Top failing URLs
    top_failures = _get_top_failures(cutoff)

    # 4. Recent audits
    recent_audits = _get_recent_audits(limit=10)

    # 5. Schedules summary
    schedules_summary = _get_schedules_summary()

    return {
        "timestamp": now.isoformat(),
        "period_hours": hours,
        "system_health": system_health,
        "audit_stats": audit_stats,
        "top_failures": top_failures,
        "recent_audits": recent_audits,
        "schedules": schedules_summary,
    }


def _get_audit_stats(cutoff: str) -> dict:
    """Get aggregate audit statistics."""
    try:
        from api.database import _get_conn, _P, _row_to_dict
        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE status = 'done') as done,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed,
                    COUNT(*) FILTER (WHERE status = 'processing') as processing,
                    COUNT(*) FILTER (WHERE status = 'queued') as queued,
                    AVG(score) FILTER (WHERE score IS NOT NULL) as avg_score,
                    COUNT(DISTINCT app_type) as unique_app_types,
                    COUNT(DISTINCT url) as unique_urls
                FROM agentic_qa_reports
                WHERE created_at >= {_P}
                """,
                (cutoff,),
            )
            row = _row_to_dict(cur.fetchone()) or {}

        total = int(row.get("total") or 0)
        done = int(row.get("done") or 0)
        failed = int(row.get("failed") or 0)

        return {
            "total_audits": total,
            "done": done,
            "failed": failed,
            "processing": int(row.get("processing") or 0),
            "queued": int(row.get("queued") or 0),
            "success_rate_percent": round(done / total * 100, 1) if total > 0 else 0,
            "failure_rate_percent": round(failed / total * 100, 1) if total > 0 else 0,
            "average_score": round(float(row.get("avg_score") or 0), 1),
            "unique_app_types": int(row.get("unique_app_types") or 0),
            "unique_urls": int(row.get("unique_urls") or 0),
        }
    except Exception as e:
        _log.debug(f"[Dashboard] audit stats error: {e}")
        return {"total_audits": 0}


def _get_top_failures(cutoff: str, limit: int = 5) -> list[dict]:
    """Get URLs with the most failures."""
    try:
        from api.database import _get_conn, _P, _row_to_dict
        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT url, COUNT(*) as failure_count,
                       MAX(created_at) as last_failure
                FROM agentic_qa_reports
                WHERE status = 'failed' AND created_at >= {_P}
                GROUP BY url
                ORDER BY failure_count DESC
                LIMIT {_P}
                """,
                (cutoff, limit),
            )
            return [_row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        _log.debug(f"[Dashboard] top failures error: {e}")
        return []


def _get_recent_audits(limit: int = 10) -> list[dict]:
    """Get most recent audits."""
    try:
        from api.database import _get_conn, _P, _row_to_dict
        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT audit_id, url, status, app_type, score,
                       created_at, updated_at
                FROM agentic_qa_reports
                ORDER BY created_at DESC
                LIMIT {_P}
                """,
                (limit,),
            )
            return [_row_to_dict(r) for r in cur.fetchall()]
    except Exception as e:
        _log.debug(f"[Dashboard] recent audits error: {e}")
        return []


def _get_schedules_summary() -> dict:
    """Get summary of active schedules."""
    try:
        from api.scheduler import list_schedules
        schedules = list_schedules()
        active = [s for s in schedules if s.get("active")]
        return {
            "total_schedules": len(schedules),
            "active_schedules": len(active),
            "schedules": active[:5],  # Top 5
        }
    except Exception as e:
        _log.debug(f"[Dashboard] schedules error: {e}")
        return {"total_schedules": 0, "active_schedules": 0, "schedules": []}
