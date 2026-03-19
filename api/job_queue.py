"""
job_queue.py — asyncio-based job queue for Breaker Lab.

Replaces FastAPI's single-threaded BackgroundTasks with a proper worker pool.
No Redis or Celery needed — runs entirely in-process using asyncio + threads.

Usage:
    from api.job_queue import enqueue_job, start_workers, JobQueue

Startup (in main.py lifespan):
    async with lifespan(app):
        await start_workers(num_workers=4)

Enqueueing:
    await enqueue_job(fn, *args, **kwargs)
    # or with a job ID for status tracking:
    await enqueue_job(fn, *args, job_id="abc-123", **kwargs)
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import traceback
import httpx
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

NUM_WORKERS   = int(os.getenv("JOB_WORKERS", "4"))
MAX_QUEUE_SIZE = int(os.getenv("JOB_QUEUE_SIZE", "100"))
JOB_TIMEOUT   = int(os.getenv("JOB_TIMEOUT_SECONDS", "150"))  # 2.5 min max per job


async def _keep_alive_loop(interval: int = 55) -> None:
    """
    Ping our own /health endpoint on a fixed interval.
    Prevents Railway (and similar platforms) from sleeping the dyno
    while a long-running job is in progress.
    Set SELF_BASE_URL env var to the deployed app URL, e.g.
    https://ai-breaker-labs.vercel.app
    If SELF_BASE_URL is not set this function exits immediately (safe for local dev).
    """
    base = os.getenv("SELF_BASE_URL", "").rstrip("/")
    if not base:
        return
    url = f"{base}/health"
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            await asyncio.sleep(interval)
            try:
                await client.get(url)
                logger.debug("[KeepAlive] Pinged %s", url)
            except Exception as exc:
                logger.warning("[KeepAlive] Ping failed: %s", exc)


# ── Job data class ────────────────────────────────────────────────────────────

@dataclass
class Job:
    fn: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    job_id: str | None = None
    enqueued_at: float = field(default_factory=time.monotonic)


# ── Queue singleton ───────────────────────────────────────────────────────────

class _JobQueue:
    def __init__(self):
        self._queue: asyncio.Queue[Job] | None = None
        self._executor = ThreadPoolExecutor(max_workers=NUM_WORKERS, thread_name_prefix="breaker-worker")
        self._workers: list[asyncio.Task] = []
        self._keep_alive_task: asyncio.Task | None = None
        self._started = False
        # In-memory job status map: job_id -> {"status", "error", "started_at", "finished_at"}
        self._status: dict[str, dict] = {}

    async def start(self, num_workers: int = NUM_WORKERS):
        if self._started:
            return
        self._queue = asyncio.Queue(maxsize=MAX_QUEUE_SIZE)
        for i in range(num_workers):
            task = asyncio.create_task(self._worker(i), name=f"breaker-worker-{i}")
            self._workers.append(task)
        self._started = True
        self._keep_alive_task = asyncio.create_task(_keep_alive_loop(), name="keep-alive-ping")
        logger.info(f"[JobQueue] Started {num_workers} workers (queue size={MAX_QUEUE_SIZE})")

    async def stop(self):
        if not self._started:
            return
        # If the event loop is already closed (e.g., test teardown), avoid awaiting.
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is None or loop.is_closed():
            for task in self._workers:
                task.cancel()
            if self._keep_alive_task and not self._keep_alive_task.done():
                self._keep_alive_task.cancel()
            self._workers.clear()
            self._queue = None
            self._executor.shutdown(wait=False)
            self._started = False
            logger.info("[JobQueue] Stopped (loop closed)")
            return

        # Drain queue with sentinel values
        for _ in self._workers:
            await self._queue.put(None)  # type: ignore[arg-type]
        if self._keep_alive_task and not self._keep_alive_task.done():
            self._keep_alive_task.cancel()
        try:
            await asyncio.gather(*self._workers, return_exceptions=True)
        except RuntimeError:
            # Defensive: loop may be closing during shutdown
            for task in self._workers:
                task.cancel()
            logger.info("[JobQueue] Stopped (loop closing)")
        finally:
            self._executor.shutdown(wait=False)
            self._started = False
            self._workers.clear()
            self._queue = None
        logger.info("[JobQueue] Stopped")

    async def enqueue(self, fn: Callable, *args, job_id: str | None = None, **kwargs) -> str | None:
        if not self._started:
            # Fallback: run immediately in thread pool so nothing breaks if
            # queue wasn't started (e.g. during tests or legacy endpoints).
            logger.warning("[JobQueue] Queue not started — running job directly in thread pool")
            loop = asyncio.get_event_loop()
            loop.run_in_executor(self._executor, lambda: fn(*args, **kwargs))
            return job_id

        job = Job(fn=fn, args=args, kwargs=kwargs, job_id=job_id)
        if job_id:
            self._status[job_id] = {
                "status": "queued",
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
            }
        try:
            self._queue.put_nowait(job)
        except asyncio.QueueFull:
            logger.error(f"[JobQueue] Queue full — rejecting job {job_id}")
            if job_id:
                self._status[job_id] = {"status": "rejected", "error": "Queue full"}
            raise RuntimeError("Job queue is full. Too many concurrent requests.")
        return job_id

    def get_status(self, job_id: str) -> dict | None:
        return self._status.get(job_id)

    async def _worker(self, worker_id: int):
        logger.info(f"[Worker-{worker_id}] Ready")
        loop = asyncio.get_event_loop()

        while True:
            item = await self._queue.get()
            if item is None:  # shutdown sentinel
                self._queue.task_done()
                break

            job: Job = item
            jid = job.job_id or "?"
            start = time.monotonic()

            if job.job_id:
                self._status[job.job_id] = {
                    **self._status.get(job.job_id, {}),
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                }

            try:
                logger.info(f"[Worker-{worker_id}] Starting job {jid}")
                # Run the (blocking) job function in the thread pool with a timeout
                await asyncio.wait_for(
                    loop.run_in_executor(self._executor, lambda j=job: j.fn(*j.args, **j.kwargs)),
                    timeout=JOB_TIMEOUT,
                )
                elapsed = time.monotonic() - start
                logger.info(f"[Worker-{worker_id}] Job {jid} done in {elapsed:.1f}s")
                if job.job_id:
                    self._status[job.job_id] = {
                        **self._status.get(job.job_id, {}),
                        "status": "done",
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                        "elapsed_seconds": round(elapsed, 1),
                    }
            except asyncio.TimeoutError:
                logger.error(f"[Worker-{worker_id}] Job {jid} timed out after {JOB_TIMEOUT}s")
                if job.job_id:
                    try:
                        from api.database import finalize_report_failure
                        finalize_report_failure(job.job_id, f"Timed out after {JOB_TIMEOUT}s")
                    except Exception:
                        logger.exception(f"[Worker-{worker_id}] Failed to finalize timed out job {jid}")
                if job.job_id:
                    self._status[job.job_id] = {
                        **self._status.get(job.job_id, {}),
                        "status": "failed",
                        "error": f"Timed out after {JOB_TIMEOUT}s",
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                    }
            except Exception as exc:
                elapsed = time.monotonic() - start
                logger.error(f"[Worker-{worker_id}] Job {jid} failed after {elapsed:.1f}s: {exc}")
                logger.debug(traceback.format_exc())
                if job.job_id:
                    self._status[job.job_id] = {
                        **self._status.get(job.job_id, {}),
                        "status": "failed",
                        "error": str(exc),
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                    }
            finally:
                self._queue.task_done()

    @property
    def queue_size(self) -> int:
        return self._queue.qsize() if self._queue else 0

    @property
    def is_healthy(self) -> bool:
        return self._started and all(not t.done() for t in self._workers)


# ── Module-level singleton ────────────────────────────────────────────────────

JobQueue = _JobQueue()


async def start_workers(num_workers: int = NUM_WORKERS):
    """Call from FastAPI lifespan startup."""
    await JobQueue.start(num_workers)


async def stop_workers():
    """Call from FastAPI lifespan shutdown."""
    await JobQueue.stop()


async def enqueue_job(fn: Callable, *args, job_id: str | None = None, **kwargs) -> str | None:
    """Convenience wrapper around JobQueue.enqueue()."""
    return await JobQueue.enqueue(fn, *args, job_id=job_id, **kwargs)
