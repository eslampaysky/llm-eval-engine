"""
Phase 4B: Enhanced Job Queue with Reliability & Retries

Adds to api/job_queue.py:
- Retry logic with exponential backoff
- Failure classification (retryable vs permanent)
- Job attempt tracking
- Concurrency limits per job type
- Better structured logging
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Callable, Any
import time


class FailureClassification(Enum):
    """Classify failures to determine if they should be retried"""
    RETRYABLE = "retryable"  # Network, timeout, temporary service issue
    PERMANENT = "permanent"  # Invalid input, auth failure, code bug
    UNKNOWN = "unknown"      # Couldn't determine


@dataclass
class JobAttempt:
    """Track a single job execution attempt"""
    attempt_number: int
    started_at: float
    finished_at: float | None = None
    status: str = "running"  # running, done, failed
    error: str | None = None
    error_classification: FailureClassification = FailureClassification.UNKNOWN
    elapsed_seconds: float | None = None


@dataclass
class RetryPolicy:
    """Configure how a job should be retried"""
    max_retries: int = 2
    initial_backoff_seconds: int = 5
    max_backoff_seconds: int = 300
    backoff_multiplier: float = 2.0
    retryable_errors: list[str] = field(default_factory=lambda: [
        "TimeoutError",
        "ConnectionError",
        "BrokenPipeError",
        "EOFError",
    ])
    
    def get_backoff_seconds(self, attempt_number: int) -> int:
        """Calculate exponential backoff for a retry attempt"""
        backoff = self.initial_backoff_seconds * (self.backoff_multiplier ** (attempt_number - 1))
        return min(int(backoff), self.max_backoff_seconds)
    
    def should_retry(self, error: Exception | str, attempt_number: int) -> bool:
        """Determine if a failure should trigger a retry"""
        if attempt_number > self.max_retries:
            return False
        
        # If it's an Exception object, match exactly on the class name
        if isinstance(error, Exception):
            err_type = type(error).__name__
            for retryable_error in self.retryable_errors:
                if retryable_error == err_type:
                    return True
        else:
            # Fallback for raw string matching just in case
            for retryable_error in self.retryable_errors:
                if retryable_error in str(error):
                    return True
        
        return False


@dataclass
class EnhancedJob:
    """Enhanced job with retry tracking"""
    fn: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: dict = field(default_factory=dict)
    job_id: str | None = None
    job_type: str = "generic"  # For concurrency limiting
    retry_policy: RetryPolicy = field(default_factory=RetryPolicy)
    enqueued_at: float = field(default_factory=time.monotonic)
    attempts: list[JobAttempt] = field(default_factory=list)
    current_attempt: int = 0
    
    def record_attempt(self, status: str, error: str | None = None, classification: FailureClassification = FailureClassification.UNKNOWN):
        """Record details of a job attempt"""
        self.current_attempt += 1
        now = time.monotonic()
        attempt = JobAttempt(
            attempt_number=self.current_attempt,
            started_at=now,
            finished_at=now,
            status=status,
            error=error,
            error_classification=classification,
            elapsed_seconds=0.0,
        )
        self.attempts.append(attempt)
    
    def should_retry(self) -> bool:
        """Check if this job should be retried based on last attempt"""
        if not self.attempts:
            return False
        
        last_attempt = self.attempts[-1]
        if last_attempt.status != "failed" or not last_attempt.error:
            return False
        
        return self.retry_policy.should_retry(last_attempt.error, self.current_attempt)
    
    def get_retry_delay(self) -> int:
        """Get delay before next retry"""
        return self.retry_policy.get_backoff_seconds(self.current_attempt)
    
    @property
    def total_attempts(self) -> int:
        return len(self.attempts)
    
    @property
    def is_exhausted(self) -> bool:
        """Check if all retries are exhausted"""
        return self.current_attempt > self.retry_policy.max_retries


def classify_failure(error: str, error_type: str | None = None) -> FailureClassification:
    """
    Classify an error to determine if it's retryable.
    
    Phase 4B: Intelligently classify errors to determine retry strategy
    """
    retryable_patterns = [
        "TimeoutError",
        "timeout",
        "ConnectionError",
        "connection refused",
        "temporarily unavailable",
        "BrokenPipeError",
        "EOFError",
        "socket.timeout",
        "temporary error",
        "network",
    ]
    
    permanent_patterns = [
        "SyntaxError",
        "TypeError",
        "ValueError",
        "KeyError",
        "IndexError",
        "AttributeError",
        "NotFound",
        "404",
        "403",
        "Forbidden",
        "Invalid",
        "unauthorized",
    ]
    
    error_lower = error.lower()
    
    # Check permanent first (more specific)
    for pattern in permanent_patterns:
        if pattern.lower() in error_lower:
            return FailureClassification.PERMANENT
    
    # Check retryable
    for pattern in retryable_patterns:
        if pattern.lower() in error_lower:
            return FailureClassification.RETRYABLE
    
    return FailureClassification.UNKNOWN
