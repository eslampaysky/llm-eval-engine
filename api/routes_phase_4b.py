"""
Phase 4B API Routes - Reliability, Monitoring, and History

Fully implemented endpoints for:
- Audit history with filtering and search
- Concurrency monitoring
- Audit rerun capability
- Execution trace and status
- System load and statistics
"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Request, HTTPException, Query
from typing import Any

from api.concurrency_control import get_concurrency_manager
from api.audit_logging import get_audit_trace, get_audit_logger
from api.job_queue import JobQueue
from api.database import (
    get_agentic_qa_row,
    list_agentic_qa_history_for_client,
    insert_agentic_qa_report,
    _utc_now,
    _get_conn,
    _P,
    _row_to_dict,
)
import logging
import json

_log = logging.getLogger(__name__)

# Create a router for Phase 4B features
phase_4b_router = APIRouter(prefix="/api/v1", tags=["phase-4b"])


# ── Concurrency Monitoring ────────────────────────────────────────────────

@phase_4b_router.get("/audits/health/concurrency")
def get_concurrency_status(request: Request) -> dict:
    """
    Get current concurrency status for all job types.
    
    Phase 4B: Monitor system load and queue status.
    """
    manager = get_concurrency_manager()
    status = manager.get_status()
    
    return {
        "status": "healthy" if not any(
            limit.get("utilization_percent", 0) >= 100 
            for limit in status.values()
        ) else "at_capacity",
        "job_types": status,
    }


@phase_4b_router.get("/audits/health")
def health_check(request: Request) -> dict:
    """
    Health check endpoint showing system status.
    """
    manager = get_concurrency_manager()
    status = manager.get_status()
    
    total_running = sum(limit.get("current_concurrent", 0) for limit in status.values())
    total_max = sum(limit.get("max_concurrent", 0) for limit in status.values())
    overall_utilization = (total_running / total_max * 100) if total_max > 0 else 0
    
    return {
        "status": "healthy",
        "overall_utilization_percent": round(overall_utilization, 1),
        "job_queues": status,
        "capacity_remaining": total_max - total_running,
        "queue_size": JobQueue.queue_size,
        "queue_healthy": JobQueue.is_healthy,
    }


# ── Audit Logging & Trace ─────────────────────────────────────────────────

@phase_4b_router.get("/audits/{audit_id}/trace")
def get_audit_execution_trace(
    request: Request,
    audit_id: str,
) -> dict:
    """
    Get complete execution trace for an audit.
    
    Shows all phases, decisions, and errors throughout the audit.
    Phase 4B: Detailed observability per audit.
    """
    trace = get_audit_trace(audit_id)
    
    if not trace:
        logger = get_audit_logger(audit_id)
        trace = logger.get_trace()
    
    if not trace:
        raise HTTPException(status_code=404, detail=f"Execution trace not found for audit {audit_id}")
    
    return {
        "audit_id": audit_id,
        "event_count": len(trace),
        "trace": trace,
    }


@phase_4b_router.get("/audits/{audit_id}/summary")
def get_audit_execution_summary(
    request: Request,
    audit_id: str,
) -> dict:
    """
    Get summary of audit execution.
    
    Phase 4B: Quick overview of what happened during the audit.
    """
    logger = get_audit_logger(audit_id)
    summary = logger.get_summary()
    
    trace = logger.get_trace()
    if not trace:
        # Try to get data from DB instead
        row = get_agentic_qa_row(audit_id)
        if row:
            return {
                "audit_id": audit_id,
                "status": row.get("status", "unknown"),
                "url": row.get("url"),
                "app_type": row.get("app_type"),
                "score": row.get("score"),
                "created_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        return {
            "audit_id": audit_id,
            "status": "no_execution_data",
        }
    
    # Count events by level
    level_counts = {}
    for entry in trace:
        level = entry.get("level", "UNKNOWN")
        level_counts[level] = level_counts.get(level, 0) + 1
    
    # Count events by component
    component_counts = {}
    for entry in trace:
        component = entry.get("component", "unknown")
        component_counts[component] = component_counts.get(component, 0) + 1
    
    return {
        **summary,
        "event_levels": level_counts,
        "components": component_counts,
    }


# ── Audit History & Filtering ─────────────────────────────────────────────

@phase_4b_router.get("/audits")
def list_audits(
    request: Request,
    status: str | None = Query(None, description="Filter by status: queued, processing, done, failed, canceled"),
    url: str | None = Query(None, description="Filter by URL (partial match)"),
    app_type: str | None = Query(None, description="Filter by app type"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
    """
    List audits with filters.
    
    Phase 4B: Query and filter audit history.
    
    Usage:
        GET /api/v1/audits?status=done&limit=10&offset=0
        GET /api/v1/audits?url=example.com&app_type=ecommerce
    """
    try:
        with _get_conn() as conn:
            cur = conn.cursor()
            where_clauses = []
            params: list[Any] = []

            if status:
                where_clauses.append(f"status = {_P}")
                params.append(status)
            if url:
                where_clauses.append(f"url ILIKE {_P}")
                params.append(f"%{url}%")
            if app_type:
                where_clauses.append(f"app_type = {_P}")
                params.append(app_type)

            where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

            # Count total
            cur.execute(
                f"SELECT COUNT(*) as total FROM agentic_qa_reports {where_sql}",
                params,
            )
            total = (cur.fetchone() or {}).get("total", 0)

            # Fetch page
            cur.execute(
                f"""
                SELECT audit_id, url, site_description, tier, status, app_type,
                       classifier_confidence, classifier_source, score, confidence,
                       summary, created_at, updated_at
                FROM agentic_qa_reports
                {where_sql}
                ORDER BY created_at DESC
                LIMIT {_P} OFFSET {_P}
                """,
                params + [limit, offset],
            )
            rows = [_row_to_dict(r) for r in cur.fetchall()]

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "audits": rows,
        }
    except Exception as e:
        _log.error(f"[Phase4B] list_audits error: {e}")
        return {"total": 0, "limit": limit, "offset": offset, "audits": []}


# ── Audit Rerun ───────────────────────────────────────────────────────────

@phase_4b_router.post("/audits/{audit_id}/rerun")
async def rerun_audit(
    request: Request,
    audit_id: str,
) -> dict:
    """
    Rerun a previous audit.
    
    Phase 4B: Re-execute an audit using the same parameters.
    
    Useful for:
    - Verifying fixes after code changes
    - Investigating intermittent failures
    - Historical comparison
    """
    # 1. Fetch previous audit config from database
    original = get_agentic_qa_row(audit_id)
    if not original:
        raise HTTPException(status_code=404, detail=f"Audit {audit_id} not found")
    
    # 2. Create new audit ID
    new_audit_id = f"rerun-{uuid.uuid4().hex[:12]}"
    
    # 3. Insert new audit record
    now = _utc_now()
    try:
        insert_agentic_qa_report(
            audit_id=new_audit_id,
            client_name=original.get("client_name"),
            url=original.get("url", ""),
            site_description=original.get("site_description"),
            tier=original.get("tier", "deep"),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create rerun record: {e}")

    # 4. Enqueue the job (lazy import to avoid circulars)
    try:
        from api.routes import _run_agentic_qa_job
        from api.job_queue import enqueue_job

        await enqueue_job(
            _run_agentic_qa_job,
            new_audit_id,
            original.get("url", ""),
            original.get("tier", "deep"),
            None,  # journeys (re-discover)
            original.get("site_description"),
            None,  # credentials
            original.get("client_name"),
            job_id=new_audit_id,
            job_type="agentic_qa",
        )
    except ImportError:
        _log.warning("[Phase4B] _run_agentic_qa_job not importable — record created but job not enqueued")
    except Exception as e:
        _log.error(f"[Phase4B] rerun enqueue error: {e}")

    return {
        "status": "rerun_queued",
        "original_audit_id": audit_id,
        "new_audit_id": new_audit_id,
        "url": original.get("url"),
        "tier": original.get("tier"),
    }


# ── Job Attempt History ───────────────────────────────────────────────────

@phase_4b_router.get("/audits/{audit_id}/attempts")
def get_audit_attempts(
    request: Request,
    audit_id: str,
) -> dict:
    """
    Get job attempt history (from in-memory tracking).
    
    Phase 4B: Detailed retry history.
    """
    job_status = JobQueue.get_status(audit_id)
    attempts_count = 0
    if job_status:
        attempts_count = job_status.get("attempts", 1)
    
    return {
        "audit_id": audit_id,
        "total_attempts": attempts_count,
        "job_status": job_status or {"status": "unknown"},
    }


# ── System Status ─────────────────────────────────────────────────────────

@phase_4b_router.get("/system/load")
def get_system_load(request: Request) -> dict:
    """
    Get current system load and capacity.
    
    Phase 4B: System monitoring endpoint.
    """
    manager = get_concurrency_manager()
    status = manager.get_status()
    
    queue_sizes = {}
    total_queued = 0
    for job_type, limit in status.items():
        queued = limit.get("queued_count", 0)
        queue_sizes[job_type] = queued
        total_queued += queued
    
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "concurrency_status": status,
        "total_jobs_queued": total_queued,
        "job_queue_sizes": queue_sizes,
        "queue_size": JobQueue.queue_size,
        "queue_healthy": JobQueue.is_healthy,
    }


@phase_4b_router.get("/system/stats")
def get_system_stats(
    request: Request,
    hours: int = Query(24, ge=1, le=168, description="Hours of history to include"),
) -> dict:
    """
    Get system statistics over time period.
    
    Phase 4B: Real metrics from the database.
    """
    try:
        from datetime import timedelta
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute(
                f"""
                SELECT
                    COUNT(*) as total_audits,
                    COUNT(*) FILTER (WHERE status = 'done') as successful_audits,
                    COUNT(*) FILTER (WHERE status = 'failed') as failed_audits,
                    COUNT(*) FILTER (WHERE status = 'canceled') as canceled_audits,
                    AVG(score) FILTER (WHERE score IS NOT NULL) as avg_score
                FROM agentic_qa_reports
                WHERE created_at >= {_P}
                """,
                (cutoff,),
            )
            row = _row_to_dict(cur.fetchone()) or {}

        total = int(row.get("total_audits") or 0)
        successful = int(row.get("successful_audits") or 0)
        failed = int(row.get("failed_audits") or 0)
        canceled = int(row.get("canceled_audits") or 0)
        avg_score = float(row.get("avg_score") or 0)

        return {
            "period_hours": hours,
            "metrics": {
                "total_audits": total,
                "successful_audits": successful,
                "failed_audits": failed,
                "canceled_audits": canceled,
                "success_rate_percent": round(successful / total * 100, 1) if total > 0 else 0,
                "average_score": round(avg_score, 1),
            },
        }
    except Exception as e:
        _log.error(f"[Phase4B] system stats error: {e}")
        return {
            "period_hours": hours,
            "metrics": {
                "total_audits": 0,
                "successful_audits": 0,
                "failed_audits": 0,
                "average_score": 0,
            },
        }
