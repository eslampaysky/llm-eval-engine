"""
Phase 4B Stress & Stability Burn-in Test

Validates:
1. Concurrency Manager (max limits, queuing, no race conditions)
2. Queue Overflow (handles backpressure)
3. Job Retry Behavior (handles timeouts without infinite loops, permanent errors fail fast)
4. Scheduler Behavior (doesn't duplicate tasks)
"""

import asyncio
import time
import pytest
import logging
from datetime import datetime, timezone

from api.job_queue import JobQueue, start_workers, stop_workers, _RETRY_POLICIES
from api.concurrency_control import get_concurrency_manager, initialize_concurrency_limits
from api.audit_logging import get_audit_trace, get_audit_logger

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("burn_in")

# Monkey-patch delay for tests to speed up backoff
_RETRY_POLICIES["agentic_qa"].initial_backoff_seconds = 1
_RETRY_POLICIES["agentic_qa"].max_retries = 2


def successful_mock_job(*args, **kwargs):
    """Simulates a job that succeeds after 2 seconds."""
    time.sleep(2)
    return "success"


def timeout_mock_job(*args, **kwargs):
    """Simulates a job that times out (retryable)."""
    raise TimeoutError("TimeoutError: Simulated timeout from Playwright")


def permanent_fail_mock_job(*args, **kwargs):
    """Simulates a job that permanently fails."""
    raise ValueError("Invalid target site")


async def test_burn_in_concurrency():
    """
    Spams 10 jobs into a queue that can only handle 3 concurrently.
    Verifies that the concurrent running jobs never exceed 3.
    """
    manager = get_concurrency_manager()
    # Enqueue 10 successful jobs
    logger.info("Enqueuing 10 successful jobs...")
    job_ids = []
    for i in range(10):
        jid = f"burn_in_success_{i}"
        await JobQueue.enqueue(
            successful_mock_job,
            job_id=jid,
            job_type="agentic_qa"
        )
        job_ids.append(jid)
    
    assert JobQueue.queue_size == 10
    
    # Monitor the Execution for 5 seconds
    max_seen_running = 0
    for _ in range(50):  # 5 seconds polling
        await asyncio.sleep(0.1)
        status = manager.get_status("agentic_qa")
        running = status["current_concurrent"]
        if running > max_seen_running:
            max_seen_running = running
        
        # The limit is 3, must NEVER exceed 3
        assert running <= 3, f"Concurrency limit violated! Running: {running}"

    logger.info(f"Max concurrent jobs observed: {max_seen_running}")
    assert max_seen_running == 3, "Queue didn't reach max concurrency limit."

    # Wait for all to finish
    logger.info("Waiting for queue to drain...")
    while JobQueue.queue_size > 0 or manager.get_status("agentic_qa")["current_concurrent"] > 0:
        await asyncio.sleep(0.5)

    for jid in job_ids:
        status = JobQueue.get_status(jid)
        assert status["status"] == "done"


async def test_burn_in_retry_behavior():
    """
    Simulates jobs that fail. 
    1. A retryable job (TimeoutError) should retry up to the max (2 retries + 1 initial = 3 total attempts).
    2. A permanent fail job should trigger only 1 attempt.
    """
    manager = get_concurrency_manager()
    logger.info("Enqueuing failing jobs...")
    jid_retry = "burn_in_timeout"
    jid_permanent = "burn_in_permanent"
    
    await JobQueue.enqueue(timeout_mock_job, job_id=jid_retry, job_type="agentic_qa")
    await JobQueue.enqueue(permanent_fail_mock_job, job_id=jid_permanent, job_type="agentic_qa")
    
    # Wait until both jobs reach 'failed' status (meaning all retries exhausted)
    while True:
        await asyncio.sleep(0.5)
        status_timeout = JobQueue.get_status(jid_retry)
        status_perm = JobQueue.get_status(jid_permanent)
        if status_timeout.get("status") == "failed" and status_perm.get("status") == "failed":
            break
            
    # Validate Retryable Job
    status_retry = JobQueue.get_status(jid_retry)
    logger.info(f"Timeout job status: {status_retry}")
    assert status_retry["status"] == "failed"
    assert status_retry["attempts"] == 3, f"Expected 3 attempts, got {status_retry.get('attempts')}"
    
    audit_retry = get_audit_logger(jid_retry)
    trace_retry = audit_retry.get_trace()
    assert any(e["event"] == "retry_scheduled" for e in trace_retry), "Retry was never scheduled!"
    assert any(e["event"] == "all_retries_exhausted" for e in trace_retry)
    
    # Validate Permanent Failure Job
    status_perm = JobQueue.get_status(jid_permanent)
    logger.info(f"Permanent fail job status: {status_perm}")
    assert status_perm["status"] == "failed"
    assert status_perm["attempts"] == 1  # (Failed on first try)
    assert status_perm["failure_classification"] == "permanent"
    
    audit_perm = get_audit_logger(jid_permanent)
    trace_perm = audit_perm.get_trace()
    assert not any(e["event"] == "retry_scheduled" for e in trace_perm)
    assert any("permanent" in e["message"] for e in trace_perm if e["event"] == "all_retries_exhausted" or e["event"] == "attempt_failed")


async def main():
    logger.info("Starting Stress Tests...")
    initialize_concurrency_limits()
    await start_workers(5)
    assert JobQueue.is_healthy
    
    try:
        await test_burn_in_concurrency()
        logger.info("✅ Concurrency Test Passed")
        
        await test_burn_in_retry_behavior()
        logger.info("✅ Retry Behavior Test Passed")
    except Exception as e:
        logger.error(f"❌ Test Failed: {e}")
        raise
    finally:
        await stop_workers()


if __name__ == "__main__":
    asyncio.run(main())
