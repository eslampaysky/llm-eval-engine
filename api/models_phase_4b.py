"""
Phase 4B Database Models - Reliability and Persistence

Extends the existing database schema to support:
- Job attempt history and retry tracking
- Audit execution logs with structured traces
- Concurrency state snapshots

NOTE: These are SQLAlchemy model definitions. Only import if SQLAlchemy is available.
They define the schema but are not required for Phase 4B functionality.
"""

from datetime import datetime as dt

try:
    from sqlalchemy import Column, Integer, String, Text, Float, DateTime, Boolean, ForeignKey, Table
    from sqlalchemy.ext.declarative import declarative_base
    from sqlalchemy.orm import relationship
    Base = declarative_base()
    SQLALCHEMY_AVAILABLE = True
except ImportError:
    # SQLAlchemy not available - models are for reference/documentation only
    SQLALCHEMY_AVAILABLE = False
    Base = object  # type: ignore


class JobAttemptRecord(Base):
    """
    Tracks individual execution attempts for a single audit.
    
    When a job is retried, a new JobAttemptRecord is created.
    Allows reconstruction of full retry history.
    """
    if SQLALCHEMY_AVAILABLE:
        __tablename__ = "job_attempts"
        
        id = Column(Integer, primary_key=True)
        audit_id = Column(String(128), index=True, nullable=False)
        
        # Attempt metadata
        attempt_number = Column(Integer, nullable=False)  # 1, 2, 3...
        status = Column(String(50), nullable=False)  # 'started', 'completed', 'failed', 'timeout'
        
        # Timing
        started_at = Column(DateTime, nullable=False, default=dt.utcnow)
        completed_at = Column(DateTime, nullable=True)  # NULL if still running
        duration_seconds = Column(Float, nullable=True)  # Calculated on completion
        
        # Error tracking
        error_type = Column(String(100), nullable=True)  # e.g., 'TimeoutError', 'ConnectionError'
        error_message = Column(Text, nullable=True)
        error_classification = Column(String(50), nullable=True)  # 'RETRYABLE', 'PERMANENT', 'UNKNOWN'
        
        # Diagnostics
        page_load_time_ms = Column(Integer, nullable=True)
        elements_found = Column(Integer, nullable=True)
        trace_output = Column(Text, nullable=True)  # Execution log from this attempt
        
        # Recovery info
        is_retry = Column(Boolean, default=False)
        was_successful = Column(Boolean, nullable=True)  # True if status='completed'
        recovery_action = Column(String(100), nullable=True)  # e.g., 'retry_after_backoff'
    else:
        # Python dataclass-like representation when SQLAlchemy not available
        def __init__(self, audit_id, attempt_number, status, started_at, 
                     completed_at=None, duration_seconds=None, error_type=None,
                     error_message=None, error_classification=None, page_load_time_ms=None,
                     elements_found=None, trace_output=None, is_retry=False,
                     was_successful=None, recovery_action=None):
            self.audit_id = audit_id
            self.attempt_number = attempt_number
            self.status = status
            self.started_at = started_at
            self.completed_at = completed_at
            self.duration_seconds = duration_seconds
            self.error_type = error_type
            self.error_message = error_message
            self.error_classification = error_classification
            self.page_load_time_ms = page_load_time_ms
            self.elements_found = elements_found
            self.trace_output = trace_output
            self.is_retry = is_retry
            self.was_successful = was_successful
            self.recovery_action = recovery_action


class AuditLogEntry(Base):
    """
    Individual log entry within an audit's execution trace.
    
    Phase 4B diagnostics: Detailed event log for each audit.
    """
    if SQLALCHEMY_AVAILABLE:
        __tablename__ = "audit_logs"
        
        id = Column(Integer, primary_key=True)
        audit_id = Column(String(128), index=True, nullable=False)
        
        # Entry metadata
        timestamp = Column(DateTime, nullable=False, default=dt.utcnow, index=True)
        component = Column(String(100), nullable=False)  # e.g., 'phase_1', 'qa_judge', 'playwright'
        event = Column(String(100), nullable=False)  # e.g., 'page_loaded', 'element_clicked', 'error'
        level = Column(String(20), nullable=False)  # DEBUG, INFO, WARNING, ERROR, CRITICAL
        
        # Content
        message = Column(Text, nullable=True)
        context = Column(Text, nullable=True)  # JSON-encoded extra context
        
        # Traceability
        job_attempt_id = Column(Integer, ForeignKey("job_attempts.id"), nullable=True)
    else:
        def __init__(self, audit_id, component, event, level, timestamp=None,
                     message=None, context=None, job_attempt_id=None):
            self.audit_id = audit_id
            self.component = component
            self.event = event
            self.level = level
            self.timestamp = timestamp or dt.utcnow()
            self.message = message
            self.context = context
            self.job_attempt_id = job_attempt_id


class RetryScenario(Base):
    """
    Tracks retry decisions and outcomes.
    
    Useful for analyzing which error types are retryable and success rate after retry.
    """
    __tablename__ = "retry_scenarios"
    
    id = Column(Integer, primary_key=True)
    audit_id = Column(String(128), index=True, nullable=False)
    
    # Scenario info
    error_type = Column(String(100), nullable=False)
    error_classification = Column(String(50), nullable=False)  # RETRYABLE, PERMANENT, UNKNOWN
    
    # Decision
    retry_attempted = Column(Boolean, nullable=False)
    retry_decision_reason = Column(Text, nullable=True)
    
    # Outcome
    retry_successful = Column(Boolean, nullable=True)  # NULL if retry not attempted
    recovery_time_seconds = Column(Float, nullable=True)
    
    # Metadata
    created_at = Column(datetime, nullable=False, default=dt.utcnow)


class ConcurrencySnapshot(Base):
    """
    Periodic snapshot of concurrency state for monitoring.
    
    Helps identify bottlenecks and validate concurrency limits.
    """
    __tablename__ = "concurrency_snapshots"
    
    id = Column(Integer, primary_key=True)
    
    # Snapshot metadata
    timestamp = Column(datetime, nullable=False, default=dt.utcnow, index=True)
    
    # Per job type
    agentic_qa_running = Column(Integer, nullable=False)
    agentic_qa_max = Column(Integer, nullable=False)
    agentic_qa_queued = Column(Integer, nullable=False)
    
    generic_running = Column(Integer, nullable=False)
    generic_max = Column(Integer, nullable=False)
    generic_queued = Column(Integer, nullable=False)
    
    # System totals
    total_running = Column(Integer, nullable=False)
    total_max = Column(Integer, nullable=False)
    total_queued = Column(Integer, nullable=False)
    
    # Health indicators
    at_capacity = Column(Boolean, nullable=False)  # True if any queue at 100%


class AuditRerunRecord(Base):
    """
    Tracks reruns of previous audits.
    
    Allows linking related audits and analyzing rerun success rate.
    """
    __tablename__ = "audit_reruns"
    
    id = Column(Integer, primary_key=True)
    
    # Audit relationship
    original_audit_id = Column(String(128), nullable=False, index=True)
    rerun_audit_id = Column(String(128), nullable=False, unique=True, index=True)
    
    # Rerun metadata
    rerun_reason = Column(String(200), nullable=True)
    rerun_initiated_by = Column(String(128), nullable=True)  # User ID or system
    rerun_initiated_at = Column(datetime, nullable=False, default=dt.utcnow)
    
    # Comparison
    original_result = Column(String(50), nullable=True)  # 'pass', 'fail', etc.
    rerun_result = Column(String(50), nullable=True)  # Filled when rerun completes
    
    # Metrics
    result_changed = Column(Boolean, nullable=True)  # True if original != rerun
    time_difference_seconds = Column(Float, nullable=True)
