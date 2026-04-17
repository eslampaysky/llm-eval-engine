"""
Phase 4B Integration - Wire reliability, concurrency, and logging into job_queue.py

This module shows how to integrate the Phase 4B foundation systems (job_reliability,
concurrency_control, audit_logging) into the existing job_queue.py worker loop.

Implementation approach:
1. Wrap job execution with AuditLoggingContext
2. Catch exceptions and classify with classify_failure()
3. Use RetryPolicy to determine if retry is warranted
4. Use ConcurrencyManager to gate job startup
5. Store attempt records in database for traceability

This is a PLANNING/DEMONSTRATION module. Actual integration happens in job_queue.py.
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional, Callable, Any

from api.job_reliability import (
    RetryPolicy, EnhancedJob, JobAttempt, classify_failure,
    FailureClassification
)
from api.concurrency_control import get_concurrency_manager
from api.audit_logging import AuditLoggingContext, get_audit_logger

_log = logging.getLogger(__name__)


# ── Configuration ──────────────────────────────────────────────────────────

# Default retry policy for agentic_qa jobs
AGENTIC_QA_RETRY_POLICY = RetryPolicy(
    max_retries=2,
    initial_backoff_seconds=5.0,
    max_backoff_seconds=300.0,
    backoff_multiplier=2.0,
    retryable_errors=[
        "TimeoutError",
        "ConnectionError",
        "NetworkError",
        "TemporaryServerError",
    ]
)

# Default retry policy for generic jobs (less lenient)
GENERIC_RETRY_POLICY = RetryPolicy(
    max_retries=1,
    initial_backoff_seconds=10.0,
    max_backoff_seconds=60.0,
    backoff_multiplier=2.0,
    retryable_errors=[
        "TemporaryServerError",
    ]
)


# ── Enhanced Job Execution ─────────────────────────────────────────────────

async def execute_job_with_retry(
    job_id: str,
    job_type: str,
    audit_id: str,
    job_func: Callable,
    job_args: tuple = (),
    job_kwargs: dict = None,
    retry_policy: Optional[RetryPolicy] = None,
) -> tuple[bool, Any, list[JobAttempt]]:
    """
    Execute a job with automatic retry, detailed logging, and concurrency control.
    
    Args:
        job_id: Unique job identifier
        job_type: Type of job ('agentic_qa', 'generic', etc.)
        audit_id: Audit ID for tracing
        job_func: Async function to execute
        job_args: Positional arguments for job_func
        job_kwargs: Keyword arguments for job_func
        retry_policy: RetryPolicy instance (uses defaults if None)
    
    Returns:
        (success: bool, result: Any, attempts: list[JobAttempt])
    
    Example:
        success, result, attempts = await execute_job_with_retry(
            job_id="job_123",
            job_type="agentic_qa",
            audit_id="audit_456",
            job_func=run_agentic_qa,
            job_kwargs={"url": "https://example.com"},
            retry_policy=AGENTIC_QA_RETRY_POLICY,
        )
    """
    if job_kwargs is None:
        job_kwargs = {}
    
    # Select retry policy
    if retry_policy is None:
        retry_policy = (
            AGENTIC_QA_RETRY_POLICY if job_type == "agentic_qa"
            else GENERIC_RETRY_POLICY
        )
    
    # Check concurrency limits
    manager = get_concurrency_manager()
    if not manager.can_start(job_type):
        raise RuntimeError(
            f"Job {job_type} at capacity. "
            f"Current: {manager.get_status()[job_type]['current_concurrent']}, "
            f"Max: {manager.get_status()[job_type]['max_concurrent']}"
        )
    
    manager.job_started(job_type)
    
    try:
        # Create enhanced job tracker
        enhanced_job = EnhancedJob(
            job_id=job_id,
            job_type=job_type,
            created_at=datetime.now(),
        )
        
        # Wrap execution with audit logging
        async with AuditLoggingContext(audit_id) as audit_logger:
            while True:  # Retry loop
                attempt_number = len(enhanced_job.attempts) + 1
                attempt_start = datetime.now()
                
                audit_logger.info(
                    component="job_executor",
                    event="attempt_started",
                    message=f"Starting attempt {attempt_number} of {retry_policy.max_retries + 1}",
                )
                
                try:
                    # Execute job
                    result = await job_func(*job_args, **job_kwargs)
                    
                    # Success
                    duration = (datetime.now() - attempt_start).total_seconds()
                    attempt = JobAttempt(
                        attempt_number=attempt_number,
                        success=True,
                        error=None,
                        error_type=None,
                        duration_seconds=duration,
                        started_at=attempt_start,
                        completed_at=datetime.now(),
                    )
                    enhanced_job.attempts.append(attempt)
                    
                    audit_logger.info(
                        component="job_executor",
                        event="attempt_succeeded",
                        message=f"Attempt {attempt_number} succeeded in {duration:.1f}s",
                    )
                    
                    return True, result, enhanced_job.attempts
                
                except Exception as exc:
                    duration = (datetime.now() - attempt_start).total_seconds()
                    error_type = type(exc).__name__
                    
                    # Classify failure
                    failure_class = classify_failure(exc, error_type)
                    audit_logger.warning(
                        component="job_executor",
                        event="attempt_failed",
                        message=f"Attempt {attempt_number} failed: {error_type}",
                        context={
                            "error": str(exc),
                            "classification": failure_class.value,
                            "duration": duration,
                        }
                    )
                    
                    # Record attempt
                    attempt = JobAttempt(
                        attempt_number=attempt_number,
                        success=False,
                        error=str(exc),
                        error_type=error_type,
                        duration_seconds=duration,
                        started_at=attempt_start,
                        completed_at=datetime.now(),
                    )
                    enhanced_job.attempts.append(attempt)
                    
                    # Check if should retry
                    if enhanced_job.should_retry():
                        retry_delay = enhanced_job.get_retry_delay()
                        audit_logger.info(
                            component="job_executor",
                            event="scheduled_retry",
                            message=f"Scheduling retry in {retry_delay}s (exponential backoff)",
                        )
                        
                        # Wait and retry
                        await asyncio.sleep(retry_delay)
                        continue
                    else:
                        # No more retries
                        audit_logger.error(
                            component="job_executor",
                            event="all_retries_exhausted",
                            message=f"All {attempt_number} attempts failed. Classification: {failure_class.value}",
                        )
                        
                        return False, None, enhanced_job.attempts
    
    finally:
        manager.job_finished(job_type)


# ── Job Queue Integration Pattern ──────────────────────────────────────────

class EnhancedJobQueue:
    """
    Example of how to integrate Phase 4B into existing job_queue.py.
    
    This shows the pattern but doesn't replace job_queue.py - that's a separate step.
    """
    
    async def process_job(self, job: dict) -> bool:
        """
        Process a single job with Phase 4B reliability features.
        
        Pattern to apply in job_queue.py _worker() method.
        """
        job_id = job.get("id")
        job_type = job.get("type", "generic")
        audit_id = job.get("audit_id")
        
        try:
            success, result, attempts = await execute_job_with_retry(
                job_id=job_id,
                job_type=job_type,
                audit_id=audit_id,
                job_func=self._execute_actual_job,
                job_kwargs={"job": job},
                retry_policy=AGENTIC_QA_RETRY_POLICY if job_type == "agentic_qa" else None,
            )
            
            if success:
                _log.info(f"Job {job_id} completed after {len(attempts)} attempt(s)")
                # Update database with result
                self._finalize_success(job_id, result, attempts)
                return True
            else:
                _log.error(f"Job {job_id} failed after {len(attempts)} attempt(s)")
                # Update database with failure
                self._finalize_failure(job_id, attempts)
                return False
        
        except Exception as exc:
            _log.error(f"Job {job_id} processing error: {exc}")
            return False
    
    async def _execute_actual_job(self, job: dict) -> Any:
        """
        The actual job logic (placeholder - replace with real job function).
        """
        # This is where the real work happens
        # In practice, this calls the actual job function from routes.py
        pass
    
    def _finalize_success(self, job_id: str, result: Any, attempts: list[JobAttempt]):
        """
        Update database after successful completion.
        """
        # Store result
        # Store attempt history
        pass
    
    def _finalize_failure(self, job_id: str, attempts: list[JobAttempt]):
        """
        Update database after all retries exhausted.
        """
        # Mark job as failed
        # Store attempt history
        pass


# ── Monitoring Utilities ───────────────────────────────────────────────────

def get_queue_health() -> dict:
    """
    Get current health of the job queue system.
    """
    manager = get_concurrency_manager()
    status = manager.get_status()
    
    total_running = sum(limit["current_concurrent"] for limit in status.values())
    total_max = sum(limit["max_concurrent"] for limit in status.values())
    utilization = (total_running / total_max * 100) if total_max > 0 else 0
    
    return {
        "healthy": utilization < 100,
        "utilization_percent": utilization,
        "jobs_running": total_running,
        "capacity": total_max,
        "job_types": status,
    }
