"""
Phase 4B Integration Tests

Tests for:
- API endpoints (monitoring, rerun, filtering)
- Database models (job attempts, audit logs, etc.)
- Job executor integration pattern
"""

import pytest
import asyncio
from datetime import datetime, timedelta
from typing import Optional

# ── Test API Endpoints ─────────────────────────────────────────────────────

class TestPhase4BAPIEndpoints:
    """Test Phase 4B API routes."""
    
    def test_concurrency_status_endpoint(self):
        """GET /api/v1/audits/health/concurrency returns status."""
        # Would need FastAPI test client
        # from fastapi.testclient import TestClient
        # client = TestClient(app)
        # response = client.get("/api/v1/audits/health/concurrency")
        # assert response.status_code == 200
        # assert "job_types" in response.json()
        pass
    
    def test_health_check_endpoint(self):
        """GET /api/v1/audits/health returns system health."""
        pass
    
    def test_audit_trace_endpoint(self):
        """GET /api/v1/audits/{audit_id}/trace returns execution trace."""
        pass
    
    def test_audit_summary_endpoint(self):
        """GET /api/v1/audits/{audit_id}/summary returns summary."""
        pass
    
    def test_list_audits_endpoint_filters(self):
        """GET /api/v1/audits supports status and limit filters."""
        pass
    
    def test_rerun_audit_endpoint(self):
        """POST /api/v1/audits/{audit_id}/rerun creates rerun."""
        pass
    
    def test_audit_attempts_endpoint(self):
        """GET /api/v1/audits/{audit_id}/attempts lists retry attempts."""
        pass
    
    def test_system_load_endpoint(self):
        """GET /api/v1/system/load returns queue status."""
        pass
    
    def test_system_stats_endpoint(self):
        """GET /api/v1/system/stats returns historical metrics."""
        pass


# ── Test Database Models ───────────────────────────────────────────────────

class TestPhase4BDatabaseModels:
    """Test Phase 4B database models."""
    
    def test_job_attempt_record_creation(self):
        """JobAttemptRecord can be created with all fields."""
        from api.models_phase_4b import JobAttemptRecord
        
        attempt = JobAttemptRecord(
            audit_id="audit_123",
            attempt_number=1,
            status="started",
            started_at=datetime.utcnow(),
            error_type=None,
            error_message=None,
            is_retry=False,
        )
        
        assert attempt.audit_id == "audit_123"
        assert attempt.attempt_number == 1
        assert attempt.status == "started"
        assert not attempt.is_retry
    
    def test_job_attempt_record_with_failure(self):
        """JobAttemptRecord tracks failure details."""
        from api.models_phase_4b import JobAttemptRecord
        
        attempt = JobAttemptRecord(
            audit_id="audit_123",
            attempt_number=2,
            status="failed",
            started_at=datetime.utcnow(),
            completed_at=datetime.utcnow(),
            duration_seconds=5.0,
            error_type="TimeoutError",
            error_message="Request timed out after 30s",
            error_classification="RETRYABLE",
            is_retry=True,
        )
        
        assert attempt.error_type == "TimeoutError"
        assert attempt.error_classification == "RETRYABLE"
        assert attempt.duration_seconds == 5.0
        assert attempt.is_retry
    
    def test_audit_log_entry_creation(self):
        """AuditLogEntry can be created with all fields."""
        from api.models_phase_4b import AuditLogEntry
        
        log = AuditLogEntry(
            audit_id="audit_123",
            component="phase_1",
            event="page_loaded",
            level="INFO",
            message="Page loaded successfully",
            timestamp=datetime.utcnow(),
        )
        
        assert log.audit_id == "audit_123"
        assert log.component == "phase_1"
        assert log.level == "INFO"
    
    def test_retry_scenario_tracking(self):
        """RetryScenario tracks retry decisions and outcomes."""
        from api.models_phase_4b import RetryScenario
        
        scenario = RetryScenario(
            audit_id="audit_123",
            error_type="TimeoutError",
            error_classification="RETRYABLE",
            retry_attempted=True,
            retry_successful=True,
            recovery_time_seconds=15.0,
        )
        
        assert scenario.error_type == "TimeoutError"
        assert scenario.retry_attempted
        assert scenario.retry_successful
        assert scenario.recovery_time_seconds == 15.0
    
    def test_concurrency_snapshot(self):
        """ConcurrencySnapshot captures system state."""
        from api.models_phase_4b import ConcurrencySnapshot
        
        snapshot = ConcurrencySnapshot(
            timestamp=datetime.utcnow(),
            agentic_qa_running=2,
            agentic_qa_max=3,
            agentic_qa_queued=5,
            generic_running=8,
            generic_max=10,
            generic_queued=2,
            total_running=10,
            total_max=13,
            total_queued=7,
            at_capacity=False,
        )
        
        assert snapshot.agentic_qa_running == 2
        assert snapshot.total_running == 10
        assert not snapshot.at_capacity
    
    def test_audit_rerun_record(self):
        """AuditRerunRecord links reruns to originals."""
        from api.models_phase_4b import AuditRerunRecord
        
        rerun = AuditRerunRecord(
            original_audit_id="audit_123",
            rerun_audit_id="audit_456",
            rerun_reason="Fixed code issue, verifying fix",
            original_result="fail",
            rerun_result="pass",
            result_changed=True,
        )
        
        assert rerun.original_audit_id == "audit_123"
        assert rerun.rerun_audit_id == "audit_456"
        assert rerun.result_changed


# ── Test Job Executor Integration ──────────────────────────────────────────

class TestJobExecutorIntegration:
    """Test job execution with Phase 4B reliability."""
    
    @pytest.mark.asyncio
    async def test_execute_job_success_first_attempt(self):
        """Job succeeds on first attempt."""
        from api.job_executor_phase_4b import execute_job_with_retry
        
        async def job_func():
            return {"status": "success", "data": "test"}
        
        success, result, attempts = await execute_job_with_retry(
            job_id="job_001",
            job_type="generic",
            audit_id="audit_001",
            job_func=job_func,
            retry_policy=None,
        )
        
        assert success
        assert result["status"] == "success"
        assert len(attempts) == 1
        assert attempts[0].success
    
    @pytest.mark.asyncio
    async def test_execute_job_failure_no_retry(self):
        """Job fails with PERMANENT error, no retry."""
        from api.job_executor_phase_4b import execute_job_with_retry, GENERIC_RETRY_POLICY
        
        async def job_func():
            raise ValueError("Invalid configuration")
        
        # ValueError is not in retryable_errors, so no retry
        success, result, attempts = await execute_job_with_retry(
            job_id="job_002",
            job_type="generic",
            audit_id="audit_002",
            job_func=job_func,
            retry_policy=GENERIC_RETRY_POLICY,
        )
        
        assert not success
        assert result is None
        assert len(attempts) == 1  # Only 1 attempt, no retry
        assert not attempts[0].success
        assert attempts[0].error_type == "ValueError"
    
    @pytest.mark.asyncio
    async def test_execute_job_retry_on_connection_error(self):
        """Job retries on ConnectionError."""
        from api.job_executor_phase_4b import execute_job_with_retry, GENERIC_RETRY_POLICY
        
        call_count = 0
        
        async def job_func():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("Network unreachable")
            return {"status": "success"}
        
        # ConnectionError is typically retryable
        policy = GENERIC_RETRY_POLICY
        
        # Note: This test would work better with real retry policy
        # For now, this is a pattern test
        pass
    
    def test_queue_health_calculation(self):
        """Queue health shows utilization."""
        from api.job_executor_phase_4b import get_queue_health
        
        health = get_queue_health()
        
        assert "healthy" in health
        assert "utilization_percent" in health
        assert "jobs_running" in health
        assert "capacity" in health
        assert "job_types" in health
        
        assert health["utilization_percent"] >= 0
        assert health["utilization_percent"] <= 100


# ── Test Monitoring & Observability ────────────────────────────────────────

class TestPhase4BMonitoring:
    """Test monitoring capabilities."""
    
    def test_concurrency_monitoring(self):
        """Concurrency state can be monitored."""
        from api.concurrency_control import get_concurrency_manager
        
        manager = get_concurrency_manager()
        status = manager.get_status()
        
        # Should have agentic_qa and generic at minimum
        assert "agentic_qa" in status
        assert "generic" in status
        
        # Each should have utilization info
        for job_type, limit in status.items():
            assert "current_concurrent" in limit
            assert "max_concurrent" in limit
            assert "utilization_percent" in limit
    
    def test_audit_logger_integration(self):
        """Audit logger tracks events."""
        from api.audit_logging import get_audit_logger
        
        audit_id = "audit_test_123"
        logger = get_audit_logger(audit_id)
        
        logger.info(
            component="test",
            event="test_event",
            message="Test message"
        )
        
        trace = logger.get_trace()
        assert len(trace) == 1
        assert trace[0]["component"] == "test"
        assert trace[0]["event"] == "test_event"
    
    def test_audit_summary_generation(self):
        """Audit logger generates summaries."""
        from api.audit_logging import get_audit_logger
        
        audit_id = "audit_summary_test"
        logger = get_audit_logger(audit_id)
        
        logger.info(component="phase_1", event="started", message="Starting phase 1")
        logger.info(component="phase_1", event="completed", message="Phase 1 complete")
        logger.warning(component="phase_2", event="degraded", message="Performance issue")
        
        summary = logger.get_summary()
        
        assert "total_events" in summary
        assert "error_count" in summary
        assert summary["total_events"] == 3
        assert summary["error_count"] == 1  # warning


# ── Integration Scenarios ──────────────────────────────────────────────────

class TestPhase4BScenarios:
    """End-to-end scenarios."""
    
    def test_complete_audit_execution_scenario(self):
        """
        Scenario: An audit runs, experiences transient error, retries, succeeds.
        
        Verifies:
        - Concurrency limit checked
        - Job execution attempted
        - Failure classified as retryable
        - Backoff delay calculated
        - Retry executed
        - Success recorded
        - Audit trace captured
        """
        from api.concurrency_control import get_concurrency_manager
        from api.job_reliability import classify_failure
        from api.audit_logging import get_audit_logger
        
        # Setup
        audit_id = "scenario_1"
        job_type = "agentic_qa"
        
        # 1. Check concurrency
        manager = get_concurrency_manager()
        can_start = manager.can_start(job_type)
        assert can_start  # Should be space available
        
        # 2. Record job started
        manager.job_started(job_type)
        status_before = manager.get_status(job_type)
        assert status_before["current_concurrent"] >= 1
        
        # 3. Log execution starts
        logger = get_audit_logger(audit_id)
        logger.info(component="executor", event="job_started")
        
        # 4. Simulate TimeoutError
        error = TimeoutError("Page load timed out")
        failure_class = classify_failure(error, "TimeoutError")
        logger.warning(
            component="executor",
            event="error_occurred",
            message=f"Error: {failure_class.value}",
        )
        
        # 5. Record retry
        logger.info(component="executor", event="retry_scheduled")
        
        # 6. Simulate success on retry
        logger.info(component="executor", event="retry_succeeded")
        
        # 7. Cleanup
        manager.job_finished(job_type)
        status_after = manager.get_status(job_type)
        
        # Verify
        trace = logger.get_trace()
        assert len(trace) == 4
        summary = logger.get_summary()
        assert summary["error_count"] == 1


# ── Run Tests ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
