"""
job_queue.py — asyncio-based job queue for Breaker Lab.

Replaces FastAPI's single-threaded BackgroundTasks with a proper worker pool.
No Redis or Celery needed — runs entirely in-process using asyncio + threads.

Phase 4B: Integrated retry logic, concurrency limits, and structured audit logging.

Usage:
    from api.job_queue import enqueue_job, start_workers, JobQueue

Startup (in main.py lifespan):
    async with lifespan(app):
        await start_workers(num_workers=1)

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

from api.job_reliability import classify_failure, FailureClassification, RetryPolicy
from api.concurrency_control import get_concurrency_manager
from api.audit_logging import get_audit_logger, cleanup_audit_logs

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────

NUM_WORKERS   = int(os.getenv("JOB_WORKERS", "1"))
MAX_QUEUE_SIZE = int(os.getenv("JOB_QUEUE_SIZE", "100"))
JOB_TIMEOUT   = int(os.getenv("JOB_TIMEOUT_SECONDS", "180"))  # 3 min max per job


# Default retry policies per job type
_RETRY_POLICIES: dict[str, RetryPolicy] = {
    "agentic_qa": RetryPolicy(
        max_retries=2,
        initial_backoff_seconds=5,
        max_backoff_seconds=120,
        backoff_multiplier=2.0,
        retryable_errors=[
            "TimeoutError", "ConnectionError", "BrokenPipeError",
            "NetworkError", "EOFError", "socket.timeout",
        ],
    ),
    "generic": RetryPolicy(
        max_retries=1,
        initial_backoff_seconds=10,
        max_backoff_seconds=60,
        backoff_multiplier=2.0,
        retryable_errors=["TimeoutError", "ConnectionError"],
    ),
}


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
    job_type: str = "generic"  # Phase 4B: for concurrency + retry policy selection
    enqueued_at: float = field(default_factory=time.monotonic)
    attempts: int = 0


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
        # Re-create executor if it was shut down
        if self._executor is None or getattr(self._executor, '_shutdown', False):
            self._executor = ThreadPoolExecutor(max_workers=NUM_WORKERS, thread_name_prefix="breaker-worker")
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

    async def enqueue(self, fn: Callable, *args, job_id: str | None = None, job_type: str = "generic", **kwargs) -> str | None:
        if not self._started:
            # Fallback: run immediately in thread pool so nothing breaks if
            # queue wasn't started (e.g. during tests or legacy endpoints).
            logger.warning("[JobQueue] Queue not started — running job directly in thread pool")
            loop = asyncio.get_event_loop()
            loop.run_in_executor(self._executor, lambda: fn(*args, **kwargs))
            return job_id

        job = Job(fn=fn, args=args, kwargs=kwargs, job_id=job_id, job_type=job_type)
        if job_id:
            self._status[job_id] = {
                "status": "queued",
                "enqueued_at": datetime.now(timezone.utc).isoformat(),
                "job_type": job_type,
                "attempts": 0,
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
        manager = get_concurrency_manager()

        while True:
            item = await self._queue.get()
            if item is None:  # shutdown sentinel
                self._queue.task_done()
                break

            job: Job = item
            jid = job.job_id or "?"
            job_type = job.job_type or "generic"
            retry_policy = _RETRY_POLICIES.get(job_type, _RETRY_POLICIES["generic"])
            audit_log = get_audit_logger(jid) if job.job_id else None
            start = time.monotonic()
            job.attempts += 1

            # Phase 4B: Concurrency gate — wait for a slot
            if not manager.can_start(job_type):
                logger.warning(f"[Worker-{worker_id}] Job {jid} waiting — {job_type} at capacity")
                if audit_log:
                    audit_log.warning("job_queue", "concurrency_wait",
                                     f"{job_type} at concurrency limit")
                waited = 0
                while not manager.can_start(job_type) and waited < 60:
                    await asyncio.sleep(2)
                    waited += 2
                if not manager.can_start(job_type):
                    logger.error(f"[Worker-{worker_id}] Job {jid} — still at capacity after 60s")
                    if job.job_id:
                        self._status[job.job_id] = {
                            **self._status.get(job.job_id, {}),
                            "status": "failed",
                            "error": f"Concurrency limit for {job_type}",
                            "finished_at": datetime.now(timezone.utc).isoformat(),
                        }
                    self._queue.task_done()
                    continue

            manager.job_started(job_type)

            if job.job_id:
                self._status[job.job_id] = {
                    **self._status.get(job.job_id, {}),
                    "status": "running",
                    "started_at": datetime.now(timezone.utc).isoformat(),
                    "attempts": job.attempts,
                }

            try:
                logger.info(f"[Worker-{worker_id}] Job {jid} attempt {job.attempts}")
                if audit_log:
                    audit_log.info("job_queue", "attempt_started",
                                  f"Attempt {job.attempts}/{1 + retry_policy.max_retries}",
                                  worker=worker_id)

                await asyncio.wait_for(
                    loop.run_in_executor(
                        self._executor,
                        lambda j=job: j.fn(*j.args, **j.kwargs),
                    ),
                    timeout=JOB_TIMEOUT,
                )

                elapsed = time.monotonic() - start
                logger.info(f"[Worker-{worker_id}] Job {jid} done in {elapsed:.1f}s")
                if audit_log:
                    audit_log.info("job_queue", "job_succeeded",
                                  f"Completed in {elapsed:.1f}s (attempt {job.attempts})")
                if job.job_id:
                    self._status[job.job_id] = {
                        **self._status.get(job.job_id, {}),
                        "status": "done",
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                        "elapsed_seconds": round(elapsed, 1),
                        "attempts": job.attempts,
                    }

            except asyncio.TimeoutError:
                elapsed = time.monotonic() - start
                error_str = f"Timed out after {JOB_TIMEOUT}s"
                logger.error(f"[Worker-{worker_id}] Job {jid} {error_str} (attempt {job.attempts})")
                if audit_log:
                    audit_log.error("job_queue", "attempt_timeout", error_str,
                                   attempt=job.attempts)

                if job.attempts < 1 + retry_policy.max_retries and retry_policy.should_retry(TimeoutError(error_str), job.attempts):
                    backoff = retry_policy.get_backoff_seconds(job.attempts)
                    logger.info(f"[Worker-{worker_id}] Retrying {jid} in {backoff}s")
                    if audit_log:
                        audit_log.info("job_queue", "retry_scheduled", f"Backoff {backoff}s", backoff=backoff)
                    
                    # Schedule requeue non-blocking so the worker can free its concurrency slot immediately
                    async def requeue_after_backoff(j, delay):
                        await asyncio.sleep(delay)
                        await self._queue.put(j)
                    asyncio.create_task(requeue_after_backoff(job, backoff))
                    
                    # Drop out to finally block to clean up the current attempt normally
                else:
                    if job.job_id:
                        try:
                            from api.database import finalize_report_failure
                            finalize_report_failure(job.job_id, error_str)
                        except Exception:
                            pass
                        self._status[job.job_id] = {
                            **self._status.get(job.job_id, {}),
                            "status": "failed",
                            "error": error_str,
                            "finished_at": datetime.now(timezone.utc).isoformat(),
                            "attempts": job.attempts,
                        }
                    if audit_log:
                        audit_log.error("job_queue", "all_retries_exhausted",
                                        f"Failed after {job.attempts} attempt(s)")

            except Exception as exc:
                elapsed = time.monotonic() - start
                error_str = str(exc)[:500]
                error_cls = classify_failure(error_str)
                logger.error(
                    f"[Worker-{worker_id}] Job {jid} failed (attempt {job.attempts}): "
                    f"{type(exc).__name__}: {error_str[:200]}"
                )
                logger.debug(traceback.format_exc())
                if audit_log:
                    audit_log.error("job_queue", "attempt_failed",
                                   f"{type(exc).__name__}: {error_str[:200]}",
                                   attempt=job.attempts,
                                   classification=error_cls.value)

                should = retry_policy.should_retry(exc, job.attempts)
                logger.error(f"DEBUG RETRY {jid}: cls={error_cls.value} attempt={job.attempts} max={retry_policy.max_retries} should={should}")
                if (
                    error_cls == FailureClassification.RETRYABLE
                    and job.attempts < 1 + retry_policy.max_retries
                    and should
                ):
                    backoff = retry_policy.get_backoff_seconds(job.attempts)
                    logger.info(f"[Worker-{worker_id}] Retrying {jid} in {backoff}s ({error_cls.value})")
                    if audit_log:
                        audit_log.info("job_queue", "retry_scheduled", f"Backoff {backoff}s ({error_cls.value})", backoff=backoff)
                    
                    async def requeue_after_backoff(j, delay):
                        await asyncio.sleep(delay)
                        await self._queue.put(j)
                    asyncio.create_task(requeue_after_backoff(job, backoff))
                else:
                    if audit_log:
                        audit_log.error("job_queue", "all_retries_exhausted",
                                        f"Failed after {job.attempts} attempt(s): {error_cls.value}")
                    if job.job_id:
                        self._status[job.job_id] = {
                            **self._status.get(job.job_id, {}),
                            "status": "failed",
                            "error": error_str,
                            "finished_at": datetime.now(timezone.utc).isoformat(),
                            "attempts": job.attempts,
                            "failure_classification": error_cls.value,
                        }

            finally:
                manager.job_finished(job_type)
                self._queue.task_done()
                # Clean up in-memory audit logs after 5 min to prevent leaks
                if job.job_id:
                    loop.call_later(300, cleanup_audit_logs, jid)

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


async def enqueue_job(fn: Callable, *args, job_id: str | None = None, job_type: str = "generic", **kwargs) -> str | None:
    """Convenience wrapper around JobQueue.enqueue()."""
    return await JobQueue.enqueue(fn, *args, job_id=job_id, job_type=job_type, **kwargs)
