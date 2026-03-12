"""
main.py — FastAPI application entry point.

Changes vs previous version:
  - Startup recovery sweep: any report stuck in 'processing' for > STUCK_REPORT_MINUTES
    is transitioned to 'stale' so clients can see it's recoverable and retry it.
  - /health now surfaces stale_reports count.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.database import init_db, get_stuck_processing_reports, mark_report_stale
from api.job_queue import JobQueue, start_workers, stop_workers
from api.rate_limit import limiter, rate_limit_exceeded_handler
from api.routes import router
from api.auth_routes import auth_router

logger = logging.getLogger(__name__)

STUCK_AFTER_MINUTES = int(os.getenv("STUCK_REPORT_MINUTES", "15"))


def _recover_stuck_reports() -> int:
    """
    On every startup, find reports that were 'processing' when the previous
    dyno died and mark them 'stale'. Returns the number of reports recovered.

    Why 'stale' and not 'failed'?
      - 'failed' implies the job ran and errored. These never ran to completion.
      - 'stale' is a distinct, recoverable state clients can act on.
      - The retry endpoint re-enqueues the job and resets status to 'processing'.
    """
    stuck = get_stuck_processing_reports(older_than_minutes=STUCK_AFTER_MINUTES)
    if not stuck:
        return 0

    recovered = 0
    for row in stuck:
        try:
            mark_report_stale(row["report_id"])
            recovered += 1
            logger.warning(
                "[Recovery] Marked report %s as stale (was processing since %s)",
                row["report_id"], row["updated_at"],
            )
        except Exception as exc:
            logger.error(
                "[Recovery] Failed to mark %s stale: %s",
                row["report_id"], exc,
            )

    if recovered:
        logger.warning(
            "[Recovery] %d stuck report(s) marked stale. "
            "Clients can retry via POST /report/{id}/retry.",
            recovered,
        )
    return recovered


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    init_db()

    # Recover any reports that were in-flight when the previous dyno died
    recovered = _recover_stuck_reports()
    app.state.recovered_on_startup = recovered

    num_workers = int(os.getenv("JOB_WORKERS", "4"))
    await start_workers(num_workers=num_workers)

    yield  # app is running

    # ── Shutdown ─────────────────────────────────────────────────────────────
    await stop_workers()


app = FastAPI(
    title="Breaker Lab API",
    version="2.1.0",
    description="AI model adversarial evaluation API",
    lifespan=lifespan,
)

# ── Attach limiter to app state (required by slowapi) ─────────────────────────
app.state.limiter = limiter

# ── Register 429 handler ──────────────────────────────────────────────────────
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── slowapi middleware — must come AFTER CORSMiddleware ───────────────────────
app.add_middleware(SlowAPIMiddleware)

app.include_router(router)
app.include_router(auth_router)


@app.get("/health")
def health():
    stale = get_stuck_processing_reports(older_than_minutes=0)  # 0 = any stale
    return {
        "status": "ok",
        "version": "2.1.0",
        "queue": {
            "healthy":     JobQueue.is_healthy,
            "queued_jobs": JobQueue.queue_size,
        },
        "stale_reports": len([r for r in stale]),
    }
