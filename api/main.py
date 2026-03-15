"""
main.py — FastAPI application entry point.

Changes vs previous version:
  - Startup recovery sweep: any report stuck in 'processing' for > STUCK_REPORT_MINUTES
    is transitioned to 'stale' so clients can see it's recoverable and retry it.
  - /health now surfaces stale_reports count.
"""

from __future__ import annotations

import logging, sys
import os
from contextlib import asynccontextmanager

import sentry_sdk

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.database import init_db, get_stuck_processing_reports, mark_report_stale
from api.job_queue import JobQueue, start_workers, stop_workers
from api.rate_limit import limiter, rate_limit_exceeded_handler
from api.routes import init_api_key_map, router
from api.auth_routes import auth_router

_log = logging.getLogger(__name__)

APP_VERSION = "1.0.0"
STUCK_AFTER_MINUTES = int(os.getenv("STUCK_REPORT_MINUTES", "15"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "").strip()
_APP_ENV = (os.getenv("APP_ENV") or os.getenv("ENV") or "").strip().lower()
_IS_PROD = _APP_ENV in {"prod", "production"}
EXTRA_FRONTEND_ORIGINS = [
    "https://ai-breaker-labs.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


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
            _log.warning(
                "[Recovery] Marked report %s as stale (was processing since %s)",
                row["report_id"], row["updated_at"],
            )
        except Exception as exc:
            _log.error(
                "[Recovery] Failed to mark %s stale: %s",
                row["report_id"], exc,
                exc_info=True,
            )

    if recovered:
        _log.warning(
            "[Recovery] %d stuck report(s) marked stale. "
            "Clients can retry via POST /report/{id}/retry.",
            recovered,
        )
    return recovered


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        stream=sys.stdout,
    )

    init_db()
    init_api_key_map()

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
    version=APP_VERSION,
    description="AI model adversarial evaluation API",
    lifespan=lifespan,
)

@app.middleware("http")
async def log_requests(request, call_next):
    _log.info("Request received %s %s", request.method, request.url.path)
    try:
        return await call_next(request)
    except Exception:
        _log.error(
            "Unhandled error while handling %s %s",
            request.method,
            request.url.path,
            exc_info=True,
        )
        raise

# ── Attach limiter to app state (required by slowapi) ─────────────────────────
app.state.limiter = limiter

# ── Register 429 handler ──────────────────────────────────────────────────────
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# ── CORS ──────────────────────────────────────────────────────────────────────
cors_origins = [FRONTEND_ORIGIN] if FRONTEND_ORIGIN else []
for origin in EXTRA_FRONTEND_ORIGINS:
    if origin and origin not in cors_origins:
        cors_origins.append(origin)
if not cors_origins:
    if _IS_PROD:
        raise RuntimeError(
            "FRONTEND_ORIGIN is required in production. "
            "Set FRONTEND_ORIGIN to your dashboard origin (e.g. https://app.example.com)."
        )
    cors_origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With", "X-API-KEY", "X-ADMIN-KEY"],
    expose_headers=["Content-Disposition"],
)

# ── slowapi middleware — must come AFTER CORSMiddleware ───────────────────────
app.add_middleware(SlowAPIMiddleware)

app.include_router(router)
app.include_router(auth_router)


@app.get("/health")
def health():
    # Must remain stable for Railway healthchecks.
    return {"status": "ok", "version": APP_VERSION}


@app.get("/health/details")
def health_details():
    try:
        stale = get_stuck_processing_reports(older_than_minutes=0)  # 0 = any stale
        stale_count = len([r for r in stale])
    except Exception as exc:
        _log.error("[Health] Failed to query stale reports: %s", exc, exc_info=True)
        stale_count = 0

    return {
        "status": "ok",
        "version": APP_VERSION,
        "queue": {
            "healthy":     JobQueue.is_healthy,
            "queued_jobs": JobQueue.queue_size,
        },
        "stale_reports": stale_count,
    }
