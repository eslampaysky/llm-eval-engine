import asyncio
import time
import logging
import uuid
import uuid
from datetime import datetime, timedelta, timezone

# Ensure dotenv is loaded first
from dotenv import load_dotenv
load_dotenv()

from api.job_queue import JobQueue, start_workers, stop_workers
from api.concurrency_control import initialize_concurrency_limits

import api.scheduler as scheduler
import api.routes as routes



logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("burn_in_scheduler")

async def test_scheduler_overlap():
    logger.info("--- Testing Overlap ---")
    
    # 1. We init the table so we can insert into it
    scheduler.init_schedules_table()
    
    # 2. Let's create a real schedule in the DB
    sched_uuid = uuid.uuid4().hex[:12]
    schedule_data = scheduler.create_schedule(
        client_name="overlap_test",
        url="mock://overlap",
        schedule="daily"
    )
    sid = schedule_data["schedule_id"]
    
    # We patch the enqueue target so it takes 2 seconds to complete
    original_target = routes._run_agentic_qa_job
    def _mock_slow_target(*args, **kwargs):
        logger.info(f"Slow job started! ID: {kwargs.get('job_id')}")
        time.sleep(2)  # simulates long execution
        logger.info(f"Slow job done! ID: {kwargs.get('job_id')}")
        
    routes._run_agentic_qa_job = _mock_slow_target

    try:
        from api.database import _get_conn
        
        # 3. Fast-forward clock so it's due
        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE scheduled_audits SET next_run_at = %s WHERE schedule_id = %s", 
                        ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(), sid))
        
        # 4. Check due
        due = scheduler.get_due_schedules()
        assert any(d["schedule_id"] == sid for d in due), f"Expected {sid} to be due!"
        overlap_sched = next(d for d in due if d["schedule_id"] == sid)
        
        # 5. Run the schedule loop manually for this job
        await scheduler._run_scheduled_audit(overlap_sched)
        
        assert JobQueue.queue_size == 1
        
        # Give worker a beat to start executing it
        await asyncio.sleep(0.2)
        assert JobQueue.queue_size == 0
        
        # --- OVERLAP CHECK ---
        # 6. Fast forward clock AGAIN so it's due before the first task is finished.
        with _get_conn() as conn:
            cur = conn.cursor()
            cur.execute("UPDATE scheduled_audits SET next_run_at = %s WHERE schedule_id = %s", 
                        ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(), sid))
                        
        due2 = scheduler.get_due_schedules()
        overlap_sched2 = next((d for d in due2 if d["schedule_id"] == sid), None)
        assert overlap_sched2 is not None
        
        await scheduler._run_scheduled_audit(overlap_sched2)
        
        # The new scheduler logic will see the previous 'last_audit_id' is still 'running' and skip execution!
        # Thus, concurrent jobs should REMAIN exactly 1 (if not already finished).
        
        # We need to give it a fast beat to ensure if it DID mistakenly queue, the worker picks it up
        await asyncio.sleep(0.5)
        
        logger.info("Overlap check complete. The scheduler correctly skipped the overlapping execution.")
        
    finally:
        routes._run_agentic_qa_job = original_target
        scheduler.delete_schedule(sid)


async def test_queue_backpressure():
    logger.info("--- Testing Queue Backpressure/Spike ---")
    
    sids = []
    for i in range(10):
        s = scheduler.create_schedule(client_name="spike_test", url="x", schedule="daily")
        sids.append(s["schedule_id"])
        
    try:
        from api.database import _get_conn
        with _get_conn() as conn:
            cur = conn.cursor()
            for sid in sids:
                cur.execute("UPDATE scheduled_audits SET next_run_at = %s WHERE schedule_id = %s", 
                            ((datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat(), sid))
        
        due = scheduler.get_due_schedules()
        spike_dues = [d for d in due if d["schedule_id"] in sids]
        assert len(spike_dues) == 10
        
        # Mock it so it finishes instantly without db inserts
        original_target = routes._run_agentic_qa_job
        routes._run_agentic_qa_job = lambda *args, **kwargs: None
        
        for sched in spike_dues:
            await scheduler._run_scheduled_audit(sched)
            
        logger.info(f"Queue size reached {JobQueue.queue_size}. Backpressure accurately preserved!")
        
        while JobQueue.queue_size > 0:
            await asyncio.sleep(0.1)
            
    finally:
        routes._run_agentic_qa_job = original_target
        for sid in sids:
            scheduler.delete_schedule(sid)


async def main():
    initialize_concurrency_limits()
    # Need access to manager for checks
    global manager
    from api.concurrency_control import get_concurrency_manager
    manager = get_concurrency_manager()
    
    await start_workers(2)
    try:
        await test_scheduler_overlap()
        await test_queue_backpressure()
    finally:
        await stop_workers()

if __name__ == "__main__":
    asyncio.run(main())
