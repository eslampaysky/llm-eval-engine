#!/usr/bin/env python3
"""
scripts/run_real_user_suite.py
==============================
Every 10 minutes: pick 10 RANDOM targets from 60 real-world sites,
run them, save results, push to GitHub via Actions.

Output layout:
    artifacts/real_user_data/
        runs/YYYY-MM-DD/HH-MM-SS_<name>_<group>.json   raw API response
        summary.csv                                      rolling append-only log
        failure_patterns.json                            running failure counts
        README.md                                        auto-generated stats

Usage:
    python scripts/run_real_user_suite.py               # loop every 10 min
    python scripts/run_real_user_suite.py --once        # one batch then exit
    python scripts/run_real_user_suite.py --group saas  # only saas targets
    python scripts/run_real_user_suite.py --dry-run     # print targets only
    python scripts/run_real_user_suite.py --batch-size 5
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import random
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

# ── Config ─────────────────────────────────────────────────────────────────────

BASE         = os.getenv("AIBREAKER_API_BASE",       "https://llm-eval-engine-production.up.railway.app")
EMAIL        = os.getenv("AIBREAKER_EMAIL",           "eslamsamy650@gmail.com")
PASSWORD     = os.getenv("AIBREAKER_PASSWORD",        "123Esl@m321")
API_KEY      = os.getenv("AIBREAKER_API_KEY",         "client_key")
INTERVAL_MIN = int(os.getenv("AUDIT_INTERVAL_MINUTES", "10"))
POLL_TIMEOUT = int(os.getenv("AUDIT_POLL_TIMEOUT",     "240"))
DEFAULT_BATCH = int(os.getenv("AUDIT_BATCH_SIZE",      "10"))

TARGETS_FILE  = Path(__file__).parent.parent / "configs" / "real_user_targets.json"
OUTPUT_DIR    = Path(__file__).parent.parent / "artifacts" / "real_user_data"
RUNS_DIR      = OUTPUT_DIR / "runs"
SUMMARY_CSV   = OUTPUT_DIR / "summary.csv"
PATTERNS_JSON = OUTPUT_DIR / "failure_patterns.json"
README_MD     = OUTPUT_DIR / "README.md"

# Full diagnostic schema — every field needed for pattern analysis
CSV_HEADERS = [
    "timestamp", "run_batch", "name", "group", "url", "tier",
    "audit_id", "duration_s", "status",
    "score", "analysis_limited",
    "app_type_detected", "expected_type", "classification_correct",
    "journeys_total", "journeys_passed", "journeys_failed",
    "bot_blocked", "captcha_hit",
    "failure_type", "failed_step",
    "recovery_events", "recovery_count",
    "first_finding_severity", "finding_count",
]

# ── Terminal colors ─────────────────────────────────────────────────────────────

class C:
    G = "\033[92m"; R = "\033[91m"; Y = "\033[93m"
    B = "\033[96m"; D = "\033[90m"; E = "\033[0m"; BOLD = "\033[1m"

def log(m):  print(f"{C.B}[{_ts()}]{C.E} {m}")
def ok(m):   print(f"{C.G}[PASS]{C.E} {m}")
def err(m):  print(f"{C.R}[FAIL]{C.E} {m}")
def warn(m): print(f"{C.Y}[WARN]{C.E} {m}")
def dim(m):  print(f"{C.D}      {m}{C.E}")
def _ts():   return datetime.now().strftime("%H:%M:%S")

# ── Auth ────────────────────────────────────────────────────────────────────────

def login() -> str:
    log(f"Authenticating...")
    r = requests.post(f"{BASE}/auth/login",
        json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    if r.status_code != 200:
        err(f"Login failed ({r.status_code}): {r.text[:200]}")
        sys.exit(1)
    token = r.json().get("access_token") or r.json().get("token", "")
    if not token:
        err(f"No token: {r.json()}")
        sys.exit(1)
    health = requests.get(f"{BASE}/health", timeout=10).json()
    ok(f"Ready — commit: {health.get('commit','?')}  token: {token[:16]}...")
    return token

# ── Target loading ──────────────────────────────────────────────────────────────

def load_targets(group_filter: str | None = None) -> list[dict]:
    data = json.loads(TARGETS_FILE.read_text())
    groups = data.get("groups", {})
    flat: list[dict] = []
    for grp, targets in groups.items():
        if group_filter and grp != group_filter:
            continue
        for t in targets:
            if "skip_reason" in t:
                continue
            flat.append({**t, "_group": grp})
    return flat

def pick_batch(targets: list[dict], size: int,
               group_filter: str | None = None) -> list[dict]:
    """
    Pick `size` random targets, ensuring at least one from each group
    when no group filter is set and size >= number of groups.
    """
    if group_filter:
        pool = [t for t in targets if t["_group"] == group_filter]
        return random.sample(pool, min(size, len(pool)))

    # Stratified: at least 1 per group, then fill randomly
    groups: dict[str, list[dict]] = {}
    for t in targets:
        groups.setdefault(t["_group"], []).append(t)

    chosen: list[dict] = []
    # One guaranteed from each group
    for grp_targets in groups.values():
        chosen.append(random.choice(grp_targets))

    # Fill remaining slots from the full pool excluding already chosen
    remaining = [t for t in targets if t not in chosen]
    extra = min(size - len(chosen), len(remaining))
    if extra > 0:
        chosen += random.sample(remaining, extra)

    random.shuffle(chosen)
    return chosen[:size]

# ── Audit runner ────────────────────────────────────────────────────────────────

def run_one_audit(target: dict, headers: dict, batch_id: str) -> dict:
    name  = target["name"]
    url   = target["url"]
    tier  = target.get("tier", "deep")
    desc  = target.get("site_description", "")
    group = target.get("_group", "unknown")

    start = time.time()

    # Start audit
    try:
        r = requests.post(f"{BASE}/agentic-qa/start",
            headers=headers,
            json={
                "url": url,
                "tier": tier,
                "site_description": desc,
                "credentials": target.get("credentials")
            },
            timeout=20)
    except Exception as e:
        return _make_error(target, batch_id, f"start_failed:{e}")

    if r.status_code not in (200, 201, 202):
        return _make_error(target, batch_id,
                           f"http_{r.status_code}:{r.text[:80]}")

    audit_id = r.json().get("audit_id", "")
    if not audit_id:
        return _make_error(target, batch_id, "no_audit_id")

    dim(f"audit_id: {audit_id} — polling...")

    # Poll until done
    final = None
    for _ in range(POLL_TIMEOUT // 5):
        time.sleep(5)
        try:
            poll = requests.get(f"{BASE}/agentic-qa/status/{audit_id}",
                headers=headers, timeout=15)
        except Exception:
            continue
        if poll.status_code != 200:
            continue
        status = poll.json().get("status", "")
        elapsed = int(time.time() - start)
        print(f"\r  {C.D}polling {elapsed}s [{status}]{C.E}    ",
              end="", flush=True)
        if status in ("done", "failed", "canceled"):
            print()
            final = poll.json()
            break

    if not final:
        print()
        return _make_error(target, batch_id, "poll_timeout", audit_id)

    return _parse(target, final, audit_id, batch_id,
                  int(time.time() - start))

def _make_error(target: dict, batch_id: str,
                reason: str, audit_id: str = "") -> dict:
    return {
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "run_batch":   batch_id,
        "name":        target["name"],
        "group":       target.get("_group", ""),
        "url":         target["url"],
        "tier":        target.get("tier", "deep"),
        "audit_id":    audit_id,
        "duration_s":  0,
        "status":      "error",
        "score":       None,
        "analysis_limited": False,
        "app_type_detected": "",
        "expected_type": target.get("expected_type", ""),
        "classification_correct": None,
        "journeys_total": 0,
        "journeys_passed": 0,
        "journeys_failed": 0,
        "bot_blocked": False,
        "captcha_hit": False,
        "failure_type": reason,
        "failed_step": "",
        "recovery_events": "",
        "recovery_count": 0,
        "first_finding_severity": "",
        "finding_count": 0,
        "_raw": {},
        "_error": True,
    }

def _parse(target: dict, raw: dict, audit_id: str,
           batch_id: str, duration: int) -> dict:
    timeline = raw.get("journey_timeline") or []
    step_res = raw.get("step_results") or []
    findings = raw.get("findings") or []

    # App type from first journey
    app_type = ""
    if timeline:
        app_type = (timeline[0].get("app_type")
                    or timeline[0].get("journey", ""))

    # Journey counts
    j_total   = len(timeline)
    j_passed  = sum(1 for j in timeline
                    if str(j.get("status","")).upper() == "PASSED")
    j_failed  = j_total - j_passed

    # Bot / captcha
    bot_blocked  = any(
        s.get("failure_type") == "blocked_by_bot_protection"
        for s in step_res)
    captcha_hit  = any(
        s.get("failure_type") == "captcha_required"
        for s in step_res)

    # First failure
    failure_type = ""
    failed_step  = ""
    for s in step_res:
        ft = s.get("failure_type", "")
        if ft and ft != "none":
            failure_type = ft
            failed_step  = (s.get("step_name") or s.get("goal", ""))
            break

    # Recovery events
    events: list[str] = []
    for s in step_res:
        for ra in (s.get("recovery_attempts") or []):
            if isinstance(ra, dict):
                bt  = ra.get("blocker_type", "unknown")
                suc = "ok" if ra.get("success") else "fail"
                events.append(f"{bt}:{suc}")
            elif isinstance(ra, str) and ra.strip():
                events.append(ra.strip())

    # Classification accuracy
    expected   = target.get("expected_type", "")
    classified = app_type.lower().replace(" ", "_")
    correct    = (expected.lower() in classified) if (expected and classified) else None

    # Findings
    first_sev  = findings[0].get("severity", "") if findings else ""

    return {
        "timestamp":   datetime.now(timezone.utc).isoformat(),
        "run_batch":   batch_id,
        "name":        target["name"],
        "group":       target["_group"],
        "url":         target["url"],
        "tier":        target.get("tier", "deep"),
        "audit_id":    audit_id,
        "duration_s":  duration,
        "status":      raw.get("status", ""),
        "score":       raw.get("score"),
        "analysis_limited": raw.get("analysis_limited", False),
        "app_type_detected": app_type,
        "expected_type": expected,
        "classification_correct": correct,
        "journeys_total":  j_total,
        "journeys_passed": j_passed,
        "journeys_failed": j_failed,
        "bot_blocked":  bot_blocked,
        "captcha_hit":  captcha_hit,
        "failure_type": failure_type,
        "failed_step":  failed_step,
        "recovery_events": "|".join(events),
        "recovery_count":  len(events),
        "first_finding_severity": first_sev,
        "finding_count": len(findings),
        "_raw": raw,
        "_error": False,
    }

# ── Saving ──────────────────────────────────────────────────────────────────────

def save_json(result: dict) -> Path:
    now   = datetime.now()
    day   = now.strftime("%Y-%m-%d")
    t_str = now.strftime("%H-%M-%S")
    name  = result["name"].lower().replace(" ", "_").replace("&", "and")
    grp   = result["group"]

    folder = RUNS_DIR / day
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{t_str}_{name}_{grp}.json"

    raw = result.get("_raw", {})
    payload = {
        "meta": {k: result[k] for k in CSV_HEADERS if k in result},
        "journey_timeline":   raw.get("journey_timeline"),
        "step_results":       raw.get("step_results"),
        "findings":           raw.get("findings"),
        "summary":            raw.get("summary"),
        "bundled_fix_prompt": raw.get("bundled_fix_prompt"),
    }
    path.write_text(json.dumps(payload, indent=2))
    return path

def append_csv(result: dict):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_header = not SUMMARY_CSV.exists()
    with open(SUMMARY_CSV, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_HEADERS, extrasaction="ignore")
        if write_header:
            w.writeheader()
        w.writerow(result)

def update_patterns(result: dict):
    """Accumulate failure pattern counts, keyed by group/failure_type/step."""
    PATTERNS_JSON.parent.mkdir(parents=True, exist_ok=True)
    patterns: dict = {}
    if PATTERNS_JSON.exists():
        try:
            patterns = json.loads(PATTERNS_JSON.read_text())
        except Exception:
            pass

    ft = result.get("failure_type", "")
    if ft and ft not in ("none", ""):
        grp  = result.get("group", "?")
        step = result.get("failed_step", "?")
        key  = f"{grp} / {ft} / {step}"
        patterns[key] = patterns.get(key, 0) + 1

    sorted_p = dict(sorted(patterns.items(), key=lambda x: -x[1]))
    PATTERNS_JSON.write_text(json.dumps(sorted_p, indent=2))

def update_readme(history: list[dict]):
    total    = len(history)
    errors   = sum(1 for r in history if r.get("_error"))
    blocked  = sum(1 for r in history if r.get("bot_blocked"))
    captcha  = sum(1 for r in history if r.get("captcha_hit"))
    ok_cls   = sum(1 for r in history if r.get("classification_correct") is True)
    cls_tot  = sum(1 for r in history if r.get("classification_correct") is not None)

    # Score stats (exclude None and 0-score bot-blocks)
    scores = [r["score"] for r in history
              if r.get("score") is not None and not r.get("bot_blocked")]
    avg_score = round(sum(scores) / len(scores), 1) if scores else "n/a"

    patterns: dict = {}
    if PATTERNS_JSON.exists():
        try:
            patterns = json.loads(PATTERNS_JSON.read_text())
        except Exception:
            pass
    top5 = list(patterns.items())[:5]

    # Per-group breakdown
    groups: dict[str, dict] = {}
    for r in history:
        g = r.get("group", "unknown")
        groups.setdefault(g, {"total": 0, "bot": 0, "captcha": 0, "err": 0})
        groups[g]["total"]   += 1
        groups[g]["bot"]     += int(bool(r.get("bot_blocked")))
        groups[g]["captcha"] += int(bool(r.get("captcha_hit")))
        groups[g]["err"]     += int(bool(r.get("_error")))

    lines = [
        "# AiBreaker — Real User Audit Results",
        "",
        f"Last updated: {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "## Summary",
        "| Metric | Value |",
        "|--------|-------|",
        f"| Total audits | {total} |",
        f"| Errors / timeouts | {errors} |",
        f"| Bot blocked | {blocked} |",
        f"| CAPTCHA hit | {captcha} |",
        f"| Avg score (non-blocked) | {avg_score} |",
        f"| Classification accuracy | {ok_cls}/{cls_tot} |",
        "",
        "## By Group",
        "| Group | Runs | Bot blocked | CAPTCHA | Errors |",
        "|-------|------|-------------|---------|--------|",
    ]
    for g, s in sorted(groups.items()):
        lines.append(
            f"| {g} | {s['total']} | {s['bot']} | {s['captcha']} | {s['err']} |"
        )

    lines += [
        "",
        "## Top Failure Patterns",
        "",
    ]
    if top5:
        lines += ["| Pattern | Count |", "|---------|-------|"]
        for pat, cnt in top5:
            lines.append(f"| `{pat}` | {cnt} |")
    else:
        lines.append("_No failures recorded yet._")

    lines += [
        "",
        "## Last 10 Runs",
        "| Name | Group | Score | Duration | Bot | Failure |",
        "|------|-------|-------|----------|-----|---------|",
    ]
    for r in reversed(history[-10:]):
        lines.append(
            f"| {r.get('name','')} | {r.get('group','')} "
            f"| {r.get('score','n/a')} | {r.get('duration_s','?')}s "
            f"| {'🚫' if r.get('bot_blocked') else ''} "
            f"| {r.get('failure_type','') or ''} |"
        )

    README_MD.write_text("\n".join(lines))

# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--batch-size", type=int, default=DEFAULT_BATCH,
                    help=f"Targets per batch (default {DEFAULT_BATCH})")
    ap.add_argument("--once",       action="store_true")
    ap.add_argument("--dry-run",    action="store_true")
    ap.add_argument("--tier", default=None, help="Force tier for all targets")
    ap.add_argument("--group", help="Only run targets from this group")
    ap.add_argument("--targets", help="Comma-separated target names to run")
    args = ap.parse_args()

    targets_to_run = load_targets(args.group)

    if args.targets:
        target_names = [t.strip().lower() for t in args.targets.split(",")]
        targets_to_run = [t for t in targets_to_run if t["name"].lower() in target_names]
        args.once = True
        args.batch_size = len(targets_to_run)
    if not targets_to_run:
        err(f"No targets found (group: {args.group or 'all'})")
        sys.exit(1)

    if args.tier:
        for t in targets_to_run:
            t["tier"] = args.tier

    if args.dry_run:
        batch = pick_batch(targets_to_run, args.batch_size)
        print(f"\n{C.BOLD}Would run {len(batch)} targets:{C.E}")
        for t in batch:
            print(f"  [{t['_group']:12}] {t['name']:15} {t['url']}")
        print(f"\n{C.D}({len(targets_to_run)} total, {args.batch_size} random per batch){C.E}")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    token = login()
    headers = {
        "Authorization": f"Bearer {token}",
        "X-API-KEY":     API_KEY,
        "Content-Type":  "application/json",
    }

    history: list[dict] = []
    batch_num = 0

    while True:
        batch_num += 1
        batch_id  = datetime.now().strftime("%Y%m%d-%H%M%S")
        batch     = pick_batch(targets_to_run, args.batch_size)

        print()
        print(f"{C.BOLD}{'═'*62}{C.E}")
        print(f"{C.BOLD}  Batch #{batch_num} — {datetime.now().strftime('%Y-%m-%d %H:%M')}  "
              f"({len(batch)} random targets from {len(targets_to_run)}){C.E}")
        print(f"{C.BOLD}{'═'*62}{C.E}")
        dim("  " + "  ".join(f"[{t['_group'][0].upper()}]{t['name']}" for t in batch))

        for i, target in enumerate(batch, 1):
            print()
            print(f"  {C.BOLD}[{i}/{len(batch)}] {target['name']} "
                  f"({target['_group']}){C.E}")
            dim(f"  {target['url']}")

            result = run_one_audit(target, headers, batch_id)
            history.append(result)

            # Print outcome
            score = result.get("score", "n/a")
            dur   = result.get("duration_s", 0)
            ft    = result.get("failure_type", "")
            bot   = result.get("bot_blocked", False)
            app   = result.get("app_type_detected", "")
            cls   = result.get("classification_correct")

            if result.get("_error"):
                err(f"{target['name']} ERROR: {ft}")
            elif bot:
                warn(f"{target['name']} BOT-BLOCKED  {dur}s")
            elif ft:
                warn(f"{target['name']} FAIL  score={score}  {dur}s  "
                     f"type={ft}  step={result.get('failed_step','?')}")
            else:
                ok(f"{target['name']} PASS  score={score}  {dur}s  "
                   f"app={app}  correct={cls}")

            # Save every result immediately
            json_path = save_json(result)
            append_csv(result)
            update_patterns(result)
            dim(f"  saved → {json_path.name}")

            if i < len(batch):
                time.sleep(12)   # gap between audits in same batch

        update_readme(history)

        # Print top patterns after batch
        print()
        log("Failure patterns so far:")
        if PATTERNS_JSON.exists():
            p = json.loads(PATTERNS_JSON.read_text())
            for rank, (pat, cnt) in enumerate(list(p.items())[:5], 1):
                dim(f"  #{rank}  {cnt:3d}×  {pat}")
        else:
            dim("  none yet")

        if args.once:
            break

        log(f"Next batch in {args.interval} min — Ctrl+C to stop")
        try:
            time.sleep(args.interval * 60)
        except KeyboardInterrupt:
            print()
            log("Stopped.")
            break

        # Re-auth every 5 batches
        if batch_num % 5 == 0:
            token = login()
            headers["Authorization"] = f"Bearer {token}"

    print()
    ok(f"Done. {len(history)} audits across {batch_num} batch(es).")
    ok(f"Summary CSV:      {SUMMARY_CSV}")
    ok(f"Failure patterns: {PATTERNS_JSON}")
    ok(f"README:           {README_MD}")


if __name__ == "__main__":
    main()
