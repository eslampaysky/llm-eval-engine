"""
Test Phase 4B: Reliability, Concurrency, and Logging

Tests for job retries, failure classification, concurrency control, and audit logging.
"""

import pytest
import time
from api.job_reliability import (
    FailureClassification,
    RetryPolicy,
    EnhancedJob,
    classify_failure,
)
from api.concurrency_control import ConcurrencyLimit, ConcurrencyManager
from api.audit_logging import AuditLogger, AuditLoggingContext, get_audit_logger


class TestRetryPolicy:
    """Test configuration of job retry policies"""
    
    def test_retry_policy_defaults(self):
        """RetryPolicy should have sensible defaults"""
        policy = RetryPolicy()
        assert policy.max_retries == 2
        assert policy.initial_backoff_seconds == 5
        assert policy.max_backoff_seconds == 300
        assert policy.backoff_multiplier == 2.0
    
    def test_exponential_backoff_calculation(self):
        """Backoff should increase exponentially (2.0x multiplier)"""
        policy = RetryPolicy(initial_backoff_seconds=5, backoff_multiplier=2.0)
        
        assert policy.get_backoff_seconds(1) == 5     # 5 * 2^0
        assert policy.get_backoff_seconds(2) == 10    # 5 * 2^1
        assert policy.get_backoff_seconds(3) == 20    # 5 * 2^2
        assert policy.get_backoff_seconds(4) == 40    # 5 * 2^3
    
    def test_backoff_capped_at_max(self):
        """Backoff should not exceed max_backoff_seconds"""
        policy = RetryPolicy(
            initial_backoff_seconds=100,
            backoff_multiplier=2.0,
            max_backoff_seconds=200,
        )
        
        assert policy.get_backoff_seconds(1) == 100
        assert policy.get_backoff_seconds(2) == 200  # Would be 200, capped
        assert policy.get_backoff_seconds(3) == 200  # Would be 400, capped at 200
    
    def test_should_retry_respects_max_attempts(self):
        """should_retry returns False after max_retries exhausted"""
        policy = RetryPolicy(max_retries=2)
        
        assert policy.should_retry("TimeoutError", attempt_number=1)
        assert policy.should_retry("TimeoutError", attempt_number=2)
        assert not policy.should_retry("TimeoutError", attempt_number=3)  # Exhausted
    
    def test_should_retry_checks_error_type(self):
        """should_retry checks if error is in retryable list"""
        policy = RetryPolicy(
            max_retries=2,
            retryable_errors=["TimeoutError", "ConnectionError"],
        )
        
        assert policy.should_retry("TimeoutError: connection timed out", 1)
        assert policy.should_retry("ConnectionError: refused", 1)
        assert not policy.should_retry("ValueError: invalid input", 1)


class TestFailureClassification:
    """Test error classification for retry decisions"""
    
    def test_classify_timeout_errors(self):
        """Timeout errors should be classified as retryable"""
        assert classify_failure("TimeoutError: request timed out") == FailureClassification.RETRYABLE
        assert classify_failure("timeout waiting for response") == FailureClassification.RETRYABLE
        assert classify_failure("socket.timeout") == FailureClassification.RETRYABLE
    
    def test_classify_connection_errors(self):
        """Connection errors should be classified as retryable"""
        assert classify_failure("ConnectionError: connection refused") == FailureClassification.RETRYABLE
        assert classify_failure("BrokenPipeError: pipe connection lost") == FailureClassification.RETRYABLE
        assert classify_failure("network error") == FailureClassification.RETRYABLE
    
    def test_classify_permanent_errors(self):
        """Code/config errors should be classified as permanent"""
        assert classify_failure("ValueError: invalid configuration") == FailureClassification.PERMANENT
        assert classify_failure("TypeError: unsupported type") == FailureClassification.PERMANENT
        assert classify_failure("KeyError: missing key") == FailureClassification.PERMANENT
        assert classify_failure("404 Not Found") == FailureClassification.PERMANENT
        assert classify_failure("403 Forbidden") == FailureClassification.PERMANENT
    
    def test_classify_unknown_errors(self):
        """Unknown errors should be classified as unknown"""
        assert classify_failure("Something went wrong") == FailureClassification.UNKNOWN
        assert classify_failure("Random error message") == FailureClassification.UNKNOWN


class TestEnhancedJob:
    """Test enhanced job with retry tracking"""
    
    def test_job_attempt_tracking(self):
        """Job should track multiple attempts"""
        def dummy_fn():
            pass
        
        job = EnhancedJob(fn=dummy_fn, job_id="job-1")
        
        assert job.total_attempts == 0
        assert job.current_attempt == 0
        
        # Simulate first attempt
        job.record_attempt("failed", "TimeoutError: timeout")
        assert job.total_attempts == 1
        assert job.current_attempt == 1
        
        # Simulate second attempt
        job.record_attempt("done", error=None)
        assert job.total_attempts == 2
        assert job.current_attempt == 2
    
    def test_should_retry_logic(self):
        """Job should determine if it should be retried"""
        def dummy_fn():
            pass
        
        policy = RetryPolicy(max_retries=2)
        job = EnhancedJob(fn=dummy_fn, job_id="job-1", retry_policy=policy)
        
        # Failed attempt should trigger retry
        job.record_attempt("failed", "TimeoutError: timeout")
        assert job.should_retry()
        
        # Success should not trigger retry
        job = EnhancedJob(fn=dummy_fn, job_id="job-2", retry_policy=policy)
        job.record_attempt("done", error=None)
        assert not job.should_retry()
    
    def test_retry_exhaustion(self):
        """Job should be exhausted after max retries"""
        def dummy_fn():
            pass
        
        policy = RetryPolicy(max_retries=2)
        job = EnhancedJob(fn=dummy_fn, job_id="job-1", retry_policy=policy)
        
        assert not job.is_exhausted
        
        job.record_attempt("failed", "TimeoutError")
        assert not job.is_exhausted
        
        job.record_attempt("failed", "TimeoutError")
        assert not job.is_exhausted  # At max, not exhausted yet
        
        job.record_attempt("failed", "TimeoutError")
        assert job.is_exhausted  # Over max, exhausted
    
    def test_get_retry_delay(self):
        """Job should calculate appropriate retry delay"""
        def dummy_fn():
            pass
        
        policy = RetryPolicy(initial_backoff_seconds=2, backoff_multiplier=2.0)
        job = EnhancedJob(fn=dummy_fn, job_id="job-1", retry_policy=policy)
        
        job.record_attempt("failed", "TimeoutError")
        assert job.get_retry_delay() == 2  # First retry after 2s
        
        job.record_attempt("failed", "TimeoutError")
        assert job.get_retry_delay() == 4  # Second retry after 4s


class TestConcurrencyControl:
    """Test concurrency limiting system"""
    
    def test_concurrency_limit_basic(self):
        """ConcurrencyLimit should track running jobs"""
        limit = ConcurrencyLimit(job_type="agentic_qa", max_concurrent=2)
        
        assert limit.current_concurrent == 0
        assert limit.can_start()
        
        assert limit.increment_running()
        assert limit.current_concurrent == 1
        assert limit.can_start()
        
        assert limit.increment_running()
        assert limit.current_concurrent == 2
        assert not limit.can_start()  # At max
        
        limit.decrement_running()
        assert limit.can_start()
    
    def test_concurrency_manager_per_type(self):
        """ConcurrencyManager should manage limits per job type"""
        manager = ConcurrencyManager()
        manager.set_limit("agentic_qa", max_concurrent=2)
        manager.set_limit("generic", max_concurrent=5)
        
        # agentic_qa: use up the limit
        assert manager.can_start("agentic_qa")
        manager.job_started("agentic_qa")
        manager.job_started("agentic_qa")
        assert not manager.can_start("agentic_qa")  # At max
        
        # generic: has separate capacity
        assert manager.can_start("generic")
        
        # Finish an agentic_qa job
        manager.job_finished("agentic_qa")
        assert manager.can_start("agentic_qa")
    
    def test_concurrency_status_report(self):
        """ConcurrencyManager should report utilization"""
        manager = ConcurrencyManager()
        manager.set_limit("agentic_qa", max_concurrent=4)
        
        manager.job_started("agentic_qa")
        manager.job_started("agentic_qa")
        
        status = manager.get_status("agentic_qa")
        assert status["current_concurrent"] == 2
        assert status["max_concurrent"] == 4
        assert status["utilization_percent"] == 50.0


class TestAuditLogging:
    """Test structured audit logging"""
    
    def test_audit_logger_records_events(self):
        """AuditLogger should record structured events"""
        logger = AuditLogger("audit-123")
        
        logger.info("executor", "started", "Audit started")
        logger.info("executor", "phase_1", "Phase 1 complete", steps_completed=5)
        logger.error("executor", "phase_2_failed", "Phase 2 failed", reason="timeout")
        
        trace = logger.get_trace()
        assert len(trace) == 3
        assert trace[0]["event"] == "started"
        assert trace[1]["context"]["steps_completed"] == 5
        assert trace[2]["level"] == "ERROR"
    
    def test_audit_logger_summary(self):
        """AuditLogger should generate summary"""
        logger = AuditLogger("audit-456")
        
        logger.info("executor", "started", "Audit started")
        logger.warning("validator", "potential_issue", "Warning detected")
        logger.error("executor", "failed", "Execution failed")
        
        summary = logger.get_summary()
        assert summary["audit_id"] == "audit-456"
        assert summary["total_events"] == 3
        assert summary["error_count"] == 1
        assert summary["warning_count"] == 1
    
    def test_audit_logger_context_manager(self):
        """AuditLoggingContext should manage session"""
        context = AuditLoggingContext("audit-789")
        
        with context as logger:
            assert isinstance(logger, AuditLogger)
            logger.info("test", "event", "Test event")
        
        trace = context.logger.get_trace()
        assert any(e["event"] == "session_started" for e in trace)
        assert any(e["event"] == "session_completed" for e in trace)
        assert any(e["event"] == "event" for e in trace)
    
    def test_get_audit_logger_caching(self):
        """get_audit_logger should cache loggers"""
        logger1 = get_audit_logger("audit-cache-1")
        logger2 = get_audit_logger("audit-cache-1")
        
        assert logger1 is logger2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
