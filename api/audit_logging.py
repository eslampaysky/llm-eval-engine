"""
Phase 4B: Structured Audit Logging

Provides comprehensive, structured logging per audit.
Every audit gets a full execution trace with timestamps, decisions, and errors.
"""

import logging
import json
from datetime import datetime, timezone
from dataclasses import dataclass, asdict, field
from typing import Any
from enum import Enum


class AuditLogLevel(Enum):
    """Structured log levels for audit events"""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"


@dataclass
class AuditLogEntry:
    """Single structured log entry for an audit"""
    timestamp: str
    level: str
    component: str  # e.g., "agentic_qa", "job_queue", "api_handler"
    event: str     # e.g., "audit_started", "execution_failed", "retry_scheduled"
    audit_id: str
    message: str
    context: dict = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        return asdict(self)
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False)


class AuditLogger:
    """
    Per-audit structured logger.
    
    Phase 4B: Provides detailed execution trace for every audit.
    """
    
    def __init__(self, audit_id: str):
        self.audit_id = audit_id
        self.entries: list[AuditLogEntry] = []
        self.logger = logging.getLogger(f"audit.{audit_id}")
    
    def _log(self, level: AuditLogLevel, component: str, event: str, 
             message: str, context: dict | None = None) -> None:
        """Internal method to log an entry"""
        entry = AuditLogEntry(
            timestamp=datetime.now(timezone.utc).isoformat(),
            level=level.value,
            component=component,
            event=event,
            audit_id=self.audit_id,
            message=message,
            context=context or {},
        )
        self.entries.append(entry)
        
        # Also log to standard Python logger for file output
        self.logger.log(
            getattr(logging, level.value),
            f"[{component}] {event}: {message} {json.dumps(context or {})}",
        )
    
    def info(self, component: str, event: str, message: str, **context) -> None:
        """Log an informational event"""
        self._log(AuditLogLevel.INFO, component, event, message, context)
    
    def warning(self, component: str, event: str, message: str, **context) -> None:
        """Log a warning event"""
        self._log(AuditLogLevel.WARNING, component, event, message, context)
    
    def error(self, component: str, event: str, message: str, **context) -> None:
        """Log an error event"""
        self._log(AuditLogLevel.ERROR, component, event, message, context)
    
    def critical(self, component: str, event: str, message: str, **context) -> None:
        """Log a critical event"""
        self._log(AuditLogLevel.CRITICAL, component, event, message, context)
    
    def debug(self, component: str, event: str, message: str, **context) -> None:
        """Log a debug event"""
        self._log(AuditLogLevel.DEBUG, component, event, message, context)
    
    def get_trace(self) -> list[dict]:
        """Get full execution trace as list of dicts"""
        return [entry.to_dict() for entry in self.entries]
    
    def get_trace_json(self) -> str:
        """Get full execution trace as JSON"""
        return json.dumps(self.get_trace(), ensure_ascii=False)
    
    def get_summary(self) -> dict:
        """Get summary of audit execution"""
        if not self.entries:
            return {"audit_id": self.audit_id, "status": "no_events"}
        
        first_entry = self.entries[0]
        last_entry = self.entries[-1]
        
        error_count = sum(1 for e in self.entries if e.level in ["ERROR", "CRITICAL"])
        warning_count = sum(1 for e in self.entries if e.level == "WARNING")
        
        return {
            "audit_id": self.audit_id,
            "started_at": first_entry.timestamp,
            "finished_at": last_entry.timestamp,
            "total_events": len(self.entries),
            "error_count": error_count,
            "warning_count": warning_count,
            "components_involved": sorted(set(e.component for e in self.entries)),
        }


class AuditLoggingContext:
    """
    Context manager for audit logging.
    
    Usage:
        async with AuditLoggingContext("audit-123") as audit_log:
            audit_log.info("executor", "phase_started", "Starting execution")
            # ... do work ...
            audit_log.info("executor", "phase_completed", "Execution complete")
    """
    
    def __init__(self, audit_id: str):
        self.audit_id = audit_id
        self.logger = AuditLogger(audit_id)
    
    async def __aenter__(self) -> AuditLogger:
        self.logger.info("audit", "session_started", f"Audit session started")
        return self.logger
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_type:
            self.logger.error("audit", "session_failed", f"Audit session failed: {exc_val}")
        else:
            self.logger.info("audit", "session_completed", "Audit session completed")
    
    def __enter__(self) -> AuditLogger:
        """Support sync context manager usage too"""
        self.logger.info("audit", "session_started", f"Audit session started")
        return self.logger
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Support sync context manager exit"""
        if exc_type:
            self.logger.error("audit", "session_failed", f"Audit session failed: {exc_val}")
        else:
            self.logger.info("audit", "session_completed", "Audit session completed")


# Global audit logger cache (in-memory, can be extended to DB)
_audit_loggers: dict[str, AuditLogger] = {}


def get_audit_logger(audit_id: str) -> AuditLogger:
    """Get or create logger for an audit"""
    if audit_id not in _audit_loggers:
        _audit_loggers[audit_id] = AuditLogger(audit_id)
    return _audit_loggers[audit_id]


def get_audit_trace(audit_id: str) -> list[dict] | None:
    """Query trace for completed audit"""
    if audit_id in _audit_loggers:
        return _audit_loggers[audit_id].get_trace()
    return None


def cleanup_audit_logs(audit_id: str) -> None:
    """Clean up logs for an audit (after persistence)"""
    if audit_id in _audit_loggers:
        del _audit_loggers[audit_id]
