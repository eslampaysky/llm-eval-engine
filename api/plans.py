from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

PLAN_LIMITS: dict[str, dict[str, Any]] = {
    "free": {"runs_per_month": 3, "tests_per_run": 20, "agentic": False},
    "pro": {"runs_per_month": 500, "tests_per_run": 100, "agentic": True},
    "enterprise": {"runs_per_month": -1, "tests_per_run": -1, "agentic": True},
}


def normalize_plan(plan: str | None) -> str:
    key = (plan or "").strip().lower()
    return key if key in PLAN_LIMITS else "free"


def resolve_plan(plan: str | None, expires_at: str | None) -> str:
    normalized = normalize_plan(plan)
    if not expires_at:
        return normalized
    try:
        expires_dt = datetime.fromisoformat(str(expires_at))
    except ValueError:
        return normalized
    if expires_dt.tzinfo is None:
        expires_dt = expires_dt.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) >= expires_dt:
        return "free"
    return normalized


def get_plan_limits(plan: str | None, expires_at: str | None = None) -> dict[str, Any]:
    resolved = resolve_plan(plan, expires_at)
    return PLAN_LIMITS.get(resolved, PLAN_LIMITS["free"]).copy()
