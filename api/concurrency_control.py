"""
Phase 4B: Concurrency Control

Manages concurrent job execution limits per job type.
Prevents resource overload and ensures fair queue distribution.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


@dataclass
class ConcurrencyLimit:
    """Configure max concurrent jobs of a specific type"""
    job_type: str
    max_concurrent: int
    current_concurrent: int = 0
    queued_count: int = 0
    
    def can_start(self) -> bool:
        """Check if a new job can start execution"""
        return self.current_concurrent < self.max_concurrent
    
    def increment_running(self) -> bool:
        """Try to increment running count"""
        if not self.can_start():
            return False
        self.current_concurrent += 1
        return True
    
    def decrement_running(self) -> None:
        """Decrement running count when job finishes"""
        if self.current_concurrent > 0:
            self.current_concurrent -= 1
    
    def queue_job(self) -> None:
        """Record a job queued (waiting)"""
        self.queued_count += 1
    
    def unqueue_job(self) -> None:
        """Record a job no longer waiting"""
        if self.queued_count > 0:
            self.queued_count -= 1
    
    @property
    def total_pending(self) -> int:
        return self.current_concurrent + self.queued_count
    
    @property
    def utilization(self) -> float:
        """Return utilization as percentage (0.0 to 1.0)"""
        return self.current_concurrent / self.max_concurrent if self.max_concurrent > 0 else 0.0


class ConcurrencyManager:
    """
    Manages concurrent execution limits for different job types.
    
    Example:
        manager = ConcurrencyManager()
        manager.set_limit("agentic_qa", max_concurrent=3)
        
        if manager.can_start("agentic_qa"):
            job_started_event.set()
        
        # ... job execution ...
        
        manager.job_finished("agentic_qa")
    """
    
    def __init__(self):
        self.limits: dict[str, ConcurrencyLimit] = {}
    
    def set_limit(self, job_type: str, max_concurrent: int) -> None:
        """Configure concurrency limit for a job type"""
        self.limits[job_type] = ConcurrencyLimit(
            job_type=job_type,
            max_concurrent=max_concurrent
        )
        logger.info(f"[ConcurrencyManager] Set {job_type}:max_concurrent={max_concurrent}")
    
    def can_start(self, job_type: str) -> bool:
        """Check if a job of this type can start execution"""
        if job_type not in self.limits:
            return True  # No limit configured = allow
        return self.limits[job_type].can_start()
    
    def job_started(self, job_type: str) -> bool:
        """Mark a job of this type as started. Returns True if successful."""
        if job_type not in self.limits:
            return True
        return self.limits[job_type].increment_running()
    
    def job_finished(self, job_type: str) -> None:
        """Mark a job of this type as finished"""
        if job_type in self.limits:
            self.limits[job_type].decrement_running()
    
    def get_status(self, job_type: str | None = None) -> dict:
        """Get concurrency status for a job type or all types"""
        if job_type:
            if job_type not in self.limits:
                return {"job_type": job_type, "status": "no_limit"}
            limit = self.limits[job_type]
            return {
                "job_type": job_type,
                "max_concurrent": limit.max_concurrent,
                "current_concurrent": limit.current_concurrent,
                "queued_count": limit.queued_count,
                "total_pending": limit.total_pending,
                "utilization_percent": round(limit.utilization * 100, 1),
            }
        
        # Return status for all configured limits
        return {
            jtype: {
                "max_concurrent": limit.max_concurrent,
                "current_concurrent": limit.current_concurrent,
                "queued_count": limit.queued_count,
                "total_pending": limit.total_pending,
                "utilization_percent": round(limit.utilization * 100, 1),
            }
            for jtype, limit in self.limits.items()
        }


# Global concurrency manager
_concurrency_manager = ConcurrencyManager()


def initialize_concurrency_limits():
    """
    Initialize default concurrency limits for Phase 4B.
    
    Call this during app startup.
    """
    # agentic_qa jobs: max 3 concurrent (heavy workload)
    _concurrency_manager.set_limit("agentic_qa", max_concurrent=3)
    # Other job types: max 10 concurrent
    _concurrency_manager.set_limit("generic", max_concurrent=10)
    logger.info("[ConcurrencyManager] Initialized with default limits")


def get_concurrency_manager() -> ConcurrencyManager:
    """Get the global concurrency manager"""
    return _concurrency_manager
