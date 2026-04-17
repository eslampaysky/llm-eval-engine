"""
Phase 6: Scheduling API Routes

CRUD endpoints for managing scheduled audits.
"""

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field
from typing import Any
import logging

_log = logging.getLogger(__name__)

phase_6_router = APIRouter(prefix="/api/v1/schedules", tags=["phase-6-schedules"])


class CreateScheduleRequest(BaseModel):
    url: str = Field(..., min_length=5, description="URL to audit")
    site_description: str | None = Field(None, description="Optional site description")
    tier: str = Field("deep", description="Audit tier: vibe, deep, fix")
    schedule: str = Field("daily", description="Schedule: hourly, daily, weekly, monthly")


class UpdateScheduleRequest(BaseModel):
    active: bool | None = None
    schedule: str | None = None


@phase_6_router.post("")
def create_schedule_endpoint(
    request: Request,
    body: CreateScheduleRequest,
) -> dict:
    """Create a new recurring audit schedule."""
    try:
        from api.scheduler import create_schedule
        result = create_schedule(
            client_name=None,  # TODO: extract from auth
            url=body.url,
            site_description=body.site_description,
            tier=body.tier,
            schedule=body.schedule,
        )
        return {"status": "created", **result}
    except Exception as e:
        _log.error(f"[Phase6] Create schedule error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@phase_6_router.get("")
def list_schedules_endpoint(
    request: Request,
    active_only: bool = Query(False, description="Only show active schedules"),
) -> dict:
    """List all audit schedules."""
    try:
        from api.scheduler import list_schedules
        schedules = list_schedules()
        if active_only:
            schedules = [s for s in schedules if s.get("active")]
        return {
            "total": len(schedules),
            "schedules": schedules,
        }
    except Exception as e:
        _log.error(f"[Phase6] List schedules error: {e}")
        return {"total": 0, "schedules": []}


@phase_6_router.patch("/{schedule_id}")
def update_schedule_endpoint(
    request: Request,
    schedule_id: str,
    body: UpdateScheduleRequest,
) -> dict:
    """Update a schedule (pause/resume or change interval)."""
    try:
        from api.scheduler import update_schedule
        updated = update_schedule(
            schedule_id,
            active=body.active,
            schedule=body.schedule,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return {"status": "updated", "schedule_id": schedule_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@phase_6_router.delete("/{schedule_id}")
def delete_schedule_endpoint(
    request: Request,
    schedule_id: str,
) -> dict:
    """Delete a schedule permanently."""
    try:
        from api.scheduler import delete_schedule
        deleted = delete_schedule(schedule_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Schedule not found")
        return {"status": "deleted", "schedule_id": schedule_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
