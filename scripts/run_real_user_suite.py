#!/usr/bin/env python3
import os
import json
import time
import argparse
import sys
import csv
from datetime import datetime
from pathlib import Path
import requests

API_BASE = os.getenv("AIBREAKER_API_BASE", "https://llm-eval-engine-production.up.railway.app")
EMAIL = os.getenv("AIBREAKER_EMAIL", "eslamsamy650@gmail.com")
PASSWORD = os.getenv("AIBREAKER_PASSWORD", "123Esl@m321")
API_KEY = os.getenv("AIBREAKER_API_KEY", "client_key")
INTERVAL_MINS = int(os.getenv("AUDIT_INTERVAL_MINUTES", "10"))
POLL_TIMEOUT_SECS = int(os.getenv("AUDIT_POLL_TIMEOUT", "240"))

ARTIFACTS_DIR = Path("artifacts/real_user_data")

class AuditRunner:
    def __init__(self):
        self.token = None
        self.headers = None
        self.session = requests.Session()
    
    def authenticate(self):
        print(f"Authenticating to {API_BASE}...")
        resp = self.session.post(f"{API_BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
        if resp.status_code != 200:
            print(f"Login failed: {resp.status_code} {resp.text}")
            sys.exit(1)
        data = resp.json()
        self.token = data.get("access_token") or data.get("token")
        if not self.token:
            print(f"No token received: {data}")
            sys.exit(1)
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "X-API-KEY": API_KEY,
            "Content-Type": "application/json"
        }
        print("Successfully authenticated.")

    def run_audit(self, target: dict):
        print(f"\n--- Running audit for {target['name']} ({target['url']}) ---")
        start_payload = {
            "url": target["url"],
            "tier": target.get("tier", "deep"),
            "site_description": target.get("site_description", "")
        }
        
        start_time = time.time()
        start_resp = self.session.post(f"{API_BASE}/agentic-qa/start", headers=self.headers, json=start_payload, timeout=20)
        
        if start_resp.status_code not in (200, 201, 202):
            print(f"Failed to start audit: {start_resp.status_code} {start_resp.text}")
            return None
        
        audit_id = start_resp.json().get("audit_id")
        if not audit_id:
            print("No audit_id returned!")
            return None
            
        print(f"Audit {audit_id} started. Polling...")
        
        final_data = None
        while time.time() - start_time < POLL_TIMEOUT_SECS:
            time.sleep(10)
            poll_resp = self.session.get(f"{API_BASE}/agentic-qa/status/{audit_id}", headers=self.headers, timeout=15)
            if poll_resp.status_code != 200:
                print(f"Poll returned status {poll_resp.status_code}")
                continue
                
            data = poll_resp.json()
            status = data.get("status", "")
            elapsed = int(time.time() - start_time)
            print(f"\rElapsed {elapsed}s | Status: {status}    ", end="", flush=True)
            
            if status in ("done", "failed", "canceled"):
                print()
                final_data = data
                break
                
        if not final_data:
            print(f"\nAudit timed out after {POLL_TIMEOUT_SECS}s.")
            return {"audit_id": audit_id, "status": "timeout_hang", "target": target}
            
        final_data["target"] = target
        return final_data

def update_artifacts(result: dict):
    if not result:
        return
        
    date_str = datetime.utcnow().strftime("%Y-%m-%d")
    timestamp = datetime.utcnow().isoformat()
    
    # 1. Save raw JSON
    runs_dir = ARTIFACTS_DIR / "runs" / date_str
    runs_dir.mkdir(parents=True, exist_ok=True)
    audit_id = result.get("audit_id", "unknown")
    target_name = result.get("target", {}).get("name", "unknown").replace(" ", "_")
    
    json_path = runs_dir / f"{timestamp.replace(':','-')}_{target_name}_{audit_id}.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
        
    # 2. Append to summary CSV
    csv_path = ARTIFACTS_DIR / "summary.csv"
    file_exists = csv_path.exists()
    
    status = result.get("status", "unknown")
    score = result.get("score", "n/a")
    app_type = "unknown"
    timeline = result.get("journey_timeline", [])
    if timeline:
        app_type = timeline[0].get("app_type", "unknown")
        
    with open(csv_path, "a", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["Timestamp", "Target", "Group", "Status", "Score", "AppType", "AuditID"])
        # We need group. Since it's passed down, we extract it.
        # Actually target dict does not have group natively, let's just write unknown for group if not found.
        writer.writerow([timestamp, target_name, "N/A", status, score, app_type, audit_id])
        
    # 3. Update failure patterns
    fp_path = ARTIFACTS_DIR / "failure_patterns.json"
    patterns = {}
    if fp_path.exists():
        with open(fp_path, "r", encoding="utf-8") as f:
            patterns = json.load(f)
            
    step_results = result.get("step_results") or []
    for s in step_results:
        f_type = s.get("failure_type")
        if f_type and f_type != "none":
            patterns[f_type] = patterns.get(f_type, 0) + 1
            
    with open(fp_path, "w", encoding="utf-8") as f:
        json.dump(patterns, f, indent=2)
        
    # 4. Update README.md
    update_readme()

def update_readme():
    csv_path = ARTIFACTS_DIR / "summary.csv"
    if not csv_path.exists():
        return
        
    total_runs = 0
    success_runs = 0
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        total_runs = len(rows)
        success_runs = sum(1 for r in rows if r.get("Status") == "done")
        
    fp_path = ARTIFACTS_DIR / "failure_patterns.json"
    patterns = {}
    if fp_path.exists():
        with open(fp_path, "r", encoding="utf-8") as f:
            patterns = json.load(f)
            
    readme_path = ARTIFACTS_DIR / "README.md"
    content = f"""# Real User Audit Data
*Last Updated: {datetime.utcnow().isoformat()}*

## Overview
- Total Runs: {total_runs}
- Successful Runs: {success_runs}
- Success Rate: {round(success_runs/total_runs*100, 1) if total_runs > 0 else 0}%

## Failure Categories
"""
    for k, v in sorted(patterns.items(), key=lambda x: x[1], reverse=True):
        content += f"- **{k}**: {v}\n"
        
    with open(readme_path, "w", encoding="utf-8") as f:
        f.write(content)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--group", choices=["saas", "marketing", "ecommerce"])
    parser.add_argument("--limit", type=int)
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--interval", type=int, default=INTERVAL_MINS)
    args = parser.parse_args()

    targets_file = Path("configs/real_user_targets.json")
    if not targets_file.exists():
        print(f"Error: {targets_file} not found.")
        sys.exit(1)
        
    with open(targets_file) as f:
        all_targets = json.load(f)
        
    targets_to_run = []
    if args.group:
        targets_to_run = all_targets.get(args.group, [])
    else:
        for grp in all_targets.values():
            targets_to_run.extend(grp)
            
    if args.limit:
        targets_to_run = targets_to_run[:args.limit]
        
    if args.dry_run:
        print(f"Dry run. Would execute {len(targets_to_run)} targets:")
        for t in targets_to_run:
            print(f" - {t['name']} ({t['url']})")
        sys.exit(0)
        
    runner = AuditRunner()
    
    batch_count = 0
    while True:
        if batch_count % 4 == 0:
            runner.authenticate()
            
        print(f"\n--- Starting Batch {batch_count + 1} ({len(targets_to_run)} targets) ---")
        
        for t in targets_to_run:
            res = runner.run_audit(t)
            update_artifacts(res)
            
        print(f"--- Batch {batch_count + 1} complete. ---")
        
        if args.once:
            break
            
        print(f"Sleeping for {args.interval} minutes...")
        time.sleep(args.interval * 60)
        batch_count += 1

if __name__ == "__main__":
    main()
