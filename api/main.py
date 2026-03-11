"""
main.py — FastAPI application entry point.

Changes:
  - Registers slowapi middleware and RateLimitExceeded handler
  - Starts / stops the job queue worker pool via lifespan
  - /health exposes queue health
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.database import init_db
from api.job_queue import JobQueue, start_workers, stop_workers
from api.rate_limit import limiter, rate_limit_exceeded_handler
from api.routes import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──────────────────────────────────────────────────────────────
    init_db()
    num_workers = int(os.getenv("JOB_WORKERS", "4"))
    await start_workers(num_workers=num_workers)

    yield  # app is running

    # ── Shutdown ─────────────────────────────────────────────────────────────
    await stop_workers()


app = FastAPI(
    title="Breaker Lab API",
    version="2.0.0",
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


@app.get("/health")
def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "queue": {
            "healthy": JobQueue.is_healthy,
            "queued_jobs": JobQueue.queue_size,
        },
    }