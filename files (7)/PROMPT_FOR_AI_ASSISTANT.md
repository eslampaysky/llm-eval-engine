# Task: Update Real User Audit Suite — 60 targets, 10 random per batch, full CSV schema

You are working on the `llm-eval-engine` project (AiBreaker QA platform).
Apply the following changes. Replace existing files where indicated.
Do NOT modify any other files.

---

## CHANGE 1 — REPLACE: `configs/real_user_targets.json`

Replace the entire file with the attached `real_user_targets.json`.

Key changes:
- 60 targets total (was 30): 20 saas + 20 marketing + 20 ecommerce
- Each target has: name, url, tier, site_description, expected_type
- Meta section has batch_size=10 and pick_strategy=random

---

## CHANGE 2 — REPLACE: `scripts/run_real_user_suite.py`

Replace the entire file with the attached `run_real_user_suite.py`.

Key changes vs the old version:

1. RANDOM BATCH SELECTION — picks 10 random targets per run (not all 60)
   - Stratified: at least 1 from each group (saas / marketing / ecommerce)
   - Remaining slots filled randomly from full pool
   - Function: pick_batch(targets, size, group_filter)

2. FULL CSV SCHEMA — summary.csv now has all diagnostic columns:
   timestamp, run_batch, name, group, url, tier, audit_id, duration_s,
   status, score, analysis_limited, app_type_detected, expected_type,
   classification_correct, journeys_total, journeys_passed, journeys_failed,
   bot_blocked, captcha_hit, failure_type, failed_step,
   recovery_events, recovery_count, first_finding_severity, finding_count

3. GROUP COLUMN FIXED — was always "N/A", now correctly populated from
   the target's group key in real_user_targets.json

4. BETTER FAILURE PATTERNS — keyed as "group / failure_type / failed_step"
   so you can distinguish saas login failures from ecommerce cart failures

5. RICHER README — per-group breakdown table, avg score, captcha count

6. run_batch ID — each batch gets a timestamp ID so you can trace which
   audits ran together

---

## CHANGE 3 — REPLACE: `.github/workflows/real_user_audit.yml`

Replace the entire file with the attached `real_user_audit.yml`.

Key changes:
- workflow_dispatch now has a batch_size input (default 10)
- Passes AUDIT_BATCH_SIZE env var to the script
- Commit message changed to "data: audit results ..." format

---

## CHANGE 4 — DELETE old summary.csv (if it exists)

Delete `artifacts/real_user_data/summary.csv` if it exists.
The old file has the wrong schema (missing 15+ columns).
It will be regenerated correctly on the next run.

Also delete `artifacts/real_user_data/failure_patterns.json` if it exists.
The old file uses a different key format.

Do NOT delete anything under `artifacts/real_user_data/runs/`.

---

## After applying changes, verify locally:

```bash
# Should print 10 random targets (at least 1 per group)
python scripts/run_real_user_suite.py --dry-run

# Should run 2 targets and create files with full CSV columns
python scripts/run_real_user_suite.py --batch-size 2 --once

# Check the CSV has the right headers
head -1 artifacts/real_user_data/summary.csv
```

Expected CSV header line:
```
timestamp,run_batch,name,group,url,tier,audit_id,duration_s,status,score,analysis_limited,app_type_detected,expected_type,classification_correct,journeys_total,journeys_passed,journeys_failed,bot_blocked,captcha_hit,failure_type,failed_step,recovery_events,recovery_count,first_finding_severity,finding_count
```

---

## GitHub Secrets (already set — no changes needed):
- AIBREAKER_API_BASE
- AIBREAKER_EMAIL
- AIBREAKER_PASSWORD
- AIBREAKER_API_KEY
