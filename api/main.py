"""
main.py — FastAPI application entry point.

Changes from previous version:
  - Uses @asynccontextmanager lifespan instead of deprecated on_event handlers
  - Starts / stops the job queue worker pool on startup / shutdown
  - Adds /health endpoint with queue health info
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.database import init_db
from api.job_queue import start_workers, stop_workers, JobQueue
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

# ── CORS ──────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,https://*.vercel.app",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production if needed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    