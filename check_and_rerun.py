#!/usr/bin/env python3
"""
check_and_rerun.py
==================
1. Login
2. List recent audit history
3. Cancel any stuck in 'processing' state
4. Run the 5-audit OOM validation suite
"""

import time
import json
import sys
import requests
from datetime import datetime

BASE     = "https://llm-eval-engine-production.up.railway.app"
EMAIL    = "eslamsamy650@gmail.com"
PASSWORD = "123Esl@m321"
API_KEY  = "client_key"

# ── Terminal colors ──────────────────────────────────────────
class C:
    GREEN  = "\033[92m"
    RED    = "\033[91m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    GRAY   = "\033[90m"
    BOLD   = "\033[1m"
    END    = "\033[0m"

def log(msg):   print(f"{C.CYAN}[{datetime.now().strftime('%H:%M:%S')}]{C.END} {msg}")
def ok(msg):    print(f"{C.GREEN}[PASS]{C.END} {msg}")
def err(msg):   print(f"{C.RED}[FAIL]{C.END} {msg}")
def warn(msg):  print(f"{C.YELLOW}[WARN]{C.END} {msg}")
def info(msg):  print(f"{C.GRAY}      {msg}{C.END}")

# ── Step 1: Login ─────────────────────────────────────────────
print()
log("Logging in...")
resp = requests.post(f"{BASE}/auth/login",
    json={"email": EMAIL, "password": PASSWORD}, timeout=15)

if resp.status_code != 200:
    err(f"Login failed ({resp.status_code}): {resp.text[:200]}")
    sys.exit(1)

data = resp.json()
TOKEN = data.get("access_token") or data.get("token", "")
if not TOKEN:
    err(f"No token in response: {data}")
    sys.exit(1)

ok(f"Logged in — token: {TOKEN[:20]}...")

HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json",
}

# ── Step 2: Check health + confirm commit ─────────────────────
log("Checking Railway health...")
health = requests.get(f"{BASE}/health", timeout=10).json()
ok(f"Railway up — commit: {health.get('commit','?')}  branch: {health.get('branch','?')}")

# ── Step 3: List audit history and find stuck jobs ────────────
print()
log("Fetching audit history to check for stuck processing jobs...")
hist_resp = requests.get(f"{BASE}/agentic-qa/history", headers=HEADERS, timeout=15)

if hist_resp.status_code != 200:
    warn(f"Could not fetch history ({hist_resp.status_code}) — skipping cancel step")
    history = []
else:
    history = hist_resp.json()

stuck = [r for r in history if r.get("status") == "processing"]

if not stuck:
    ok(f"No stuck audits found ({len(history)} total in history)")
else:
    warn(f"Found {len(stuck)} stuck audit(s) in 'processing' state — canceling...")
    for audit in stuck:
        audit_id = audit.get("audit_id") or audit.get("id", "?")
        url_audited = audit.get("url", "?")
        info(f"Canceling: {audit_id} ({url_audited})")

        cancel_resp = requests.post(
            f"{BASE}/agentic-qa/{audit_id}/cancel",
            headers=HEADERS,
            timeout=10,
        )
        if cancel_resp.status_code in (200, 202):
            ok(f"Canceled {audit_id}")
        else:
            warn(f"Could not cancel {audit_id} — status {cancel_resp.status_code}: {cancel_resp.text[:100]}")

    time.sleep(2)

# ── Step 4: Run 5 audits ──────────────────────────────────────

AUDITS = [
    {
        "num": 1,
        "url": "https://linear.app",
        "tier": "deep",
        "desc": "SaaS marketing site — clean baseline, marketing_site classification expected",
        "expect_bot_block": False,
    },
    {
        "num": 2,
        "url": "https://www.gymshark.com",
        "tier": "deep",
        "desc": "E-commerce fitness store — ecommerce classification, add-to-cart expected",
        "expect_bot_block": False,
    },
    {
        "num": 3,
        "url": "https://www.notion.so",
        "tier": "deep",
        "desc": "SaaS marketing with cookie banner — validate dismiss_blockers fires",
        "expect_bot_block": False,
    },
    {
        "num": 4,
        "url": "https://www.airbnb.com",
        "tier": "deep",
        "desc": "Heavy JS site — OOM stress test, watch memory during this one",
        "expect_bot_block": False,
    },
    {
        "num": 5,
        "url": "https://www.autotrader.co.uk",
        "tier": "deep",
        "desc": "Cloudflare protected — should fast-fail as blocked_by_bot_protection",
        "expect_bot_block": True,
    },
]

results = []

def run_audit(audit: dict) -> dict:
    num  = audit["num"]
    url  = audit["url"]
    tier = audit["tier"]
    desc = audit["desc"]

    print()
    print(f"{'─'*60}")
    log(f"Audit #{num} — {url}")
    info(f"Tier: {tier}  |  {desc}")
    print(f"{'─'*60}")

    start = time.time()

    # Start audit
    start_resp = requests.post(
        f"{BASE}/agentic-qa/start",
        headers=HEADERS,
        json={"url": url, "tier": tier, "site_description": desc},
        timeout=20,
    )

    if start_resp.status_code not in (200, 201, 202):
        err(f"Could not start audit #{num}: {start_resp.status_code} {start_resp.text[:200]}")
        return {"num": num, "url": url, "outcome": "START_FAILED"}

    audit_id = start_resp.json().get("audit_id", "")
    if not audit_id:
        err(f"No audit_id in response: {start_resp.json()}")
        return {"num": num, "url": url, "outcome": "NO_AUDIT_ID"}

    log(f"Started — audit_id: {audit_id}")

    # Poll (max 4 minutes)
    final = None
    for i in range(48):
        time.sleep(5)
        poll = requests.get(
            f"{BASE}/agentic-qa/status/{audit_id}",
            headers=HEADERS,
            timeout=15,
        )
        if poll.status_code != 200:
            warn(f"Poll returned {poll.status_code}")
            continue

        status = poll.json().get("status", "")
        elapsed = int(time.time() - start)
        print(f"\r  polling... {elapsed}s  status={status}    ", end="", flush=True)

        if status == "done":
            print()
            final = poll.json()
            break
        if status == "failed":
            print()
            final = poll.json()
            break
        if status == "canceled":
            print()
            warn(f"Audit #{num} was canceled externally")
            return {"num": num, "url": url, "outcome": "CANCELED"}

    if not final:
        print()
        err(f"Audit #{num} timed out after 4 minutes — still processing")
        return {"num": num, "url": url, "audit_id": audit_id, "outcome": "TIMEOUT_HANG"}

    duration = int(time.time() - start)

    # Parse result
    score      = final.get("score", "n/a")
    timeline   = final.get("journey_timeline") or []
    step_res   = final.get("step_results") or []
    video      = "yes" if final.get("video_url") else "no"
    limited    = final.get("analysis_limited", False)

    # App type from first journey
    app_type = "n/a"
    if timeline:
        app_type = timeline[0].get("app_type") or timeline[0].get("journey", "n/a")

    # Journey statuses
    journey_lines = []
    for j in timeline:
        jname = j.get("journey", "?")
        jstat = j.get("status", "?")
        journey_lines.append(f"    {jname}: {jstat}")

    # Recovery events
    recovery_events = []
    for s in step_res:
        for ra in (s.get("recovery_attempts") or []):
            if isinstance(ra, dict):
                bt = ra.get("blocker_type", "unknown")
                suc = ra.get("success", False)
                recovery_events.append(f"{bt}({'ok' if suc else 'failed'})")
            elif isinstance(ra, str) and ra.strip():
                recovery_events.append(ra)

    # Bot block check
    bot_blocked = any(
        s.get("failure_type") == "blocked_by_bot_protection"
        for s in step_res
    )

    # Notes from steps
    all_notes = []
    for s in step_res:
        for n in (s.get("notes") or []):
            if n and isinstance(n, str):
                all_notes.append(n)

    ok(f"Audit #{num} DONE in {duration}s")
    print(f"  score:      {score}")
    print(f"  app_type:   {app_type}")
    print(f"  video:      {video}")
    print(f"  limited:    {limited}")
    print(f"  bot_block:  {'YES — blocked_by_bot_protection' if bot_blocked else 'no'}")
    print(f"  recovery:   {', '.join(recovery_events) if recovery_events else 'none'}")
    if journey_lines:
        print(f"  journeys:")
        for jl in journey_lines:
            print(jl)
    if all_notes:
        print(f"  notes:")
        for n in all_notes[:3]:
            print(f"    {n}")

    # Expectation check
    outcome = "PASS"
    if audit["expect_bot_block"] and not bot_blocked:
        warn(f"Expected bot block on #{num} but didn't get one")
        outcome = "UNEXPECTED_NO_BLOCK"
    elif not audit["expect_bot_block"] and bot_blocked:
        warn(f"Unexpected bot block on #{num}")
        outcome = "UNEXPECTED_BLOCK"

    return {
        "num": num,
        "url": url,
        "audit_id": audit_id,
        "duration": duration,
        "score": score,
        "app_type": app_type,
        "bot_blocked": bot_blocked,
        "recovery_events": recovery_events,
        "journey_count": len(timeline),
        "outcome": outcome,
    }


print()
print(f"{C.BOLD}{'═'*60}")
print(f"  5-Audit OOM Validation Suite")
print(f"  Watch Railway memory graph while this runs.")
print(f"  Memory must spike then DROP after each audit.")
print(f"{'═'*60}{C.END}")

for audit_def in AUDITS:
    result = run_audit(audit_def)
    results.append(result)
    if result.get("outcome") == "TIMEOUT_HANG":
        err(f"Audit #{audit_def['num']} hung — stopping suite early")
        err("The --single-process removal may not have deployed yet,")
        err("or JOB_WORKERS is still >1 on Railway.")
        break
    if audit_def["num"] < 5:
        log(f"Waiting 25s before next audit...")
        time.sleep(25)

# ── Final summary ─────────────────────────────────────────────
print()
print(f"{C.BOLD}{'═'*60}")
print(f"  Final Summary")
print(f"{'═'*60}{C.END}")

all_ok = True
for r in results:
    outcome = r.get("outcome", "?")
    symbol = f"{C.GREEN}✓{C.END}" if outcome == "PASS" else f"{C.RED}✗{C.END}"
    hang   = f"{C.RED} ← HUNG{C.END}" if outcome == "TIMEOUT_HANG" else ""
    print(f"  {symbol} Audit #{r['num']} ({r['url']}) — {outcome} {r.get('duration','?')}s{hang}")
    if outcome not in ("PASS",):
        all_ok = False

print()
if all_ok and len(results) == 5:
    ok("All 5 audits completed without OOM kill or hang.")
    ok("Check Railway logs for [Memory] rss=...MB — should return to baseline after each audit.")
    ok("OOM fix is working if memory drops between audits.")
elif any(r.get("outcome") == "TIMEOUT_HANG" for r in results):
    err("At least one audit hung. Confirm in Railway dashboard:")
    err("  1. JOB_WORKERS=1 env var is set")
    err("  2. Latest commit with --single-process removed is deployed")
    err("  3. JOB_TIMEOUT_SECONDS=180 is set")
else:
    warn(f"Suite completed with {sum(1 for r in results if r.get('outcome')=='PASS')}/5 clean passes.")
