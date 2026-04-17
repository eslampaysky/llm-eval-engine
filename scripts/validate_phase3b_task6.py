#!/usr/bin/env python3
"""
Task 6: Validate diagnostics summaries on real sites.

Tests:
1. Ecommerce site 1 (DemoBlaze)
2. Ecommerce site 2 (Gymshark)
3. Auth site 1 (The Internet)

Validation checks:
- Primary issue is meaningful (not "unknown_failure")
- Issues are sorted by impact (frequency)
- Output is concise (max 5 issues)
- Issues tracked which steps they affected
"""

import json
import sys
from pathlib import Path
from dataclasses import asdict

site_root = Path(__file__).parent.parent
sys.path.insert(0, str(site_root))

from core.agentic_qa import run_agentic_qa, result_to_dict, AppType
import logging

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)


VALIDATION_TARGETS = [
    {
        "name": "DemoBlaze",
        "url": "https://www.demoblaze.com",
        "tier": "deep",
        "app_type": "ecommerce",
        "site_description": "Product catalog with add-to-cart journeys",
    },
    {
        "name": "Gymshark",
        "url": "https://www.gymshark.com",
        "tier": "deep",
        "app_type": "ecommerce",
        "site_description": "Ecommerce with product variants",
    },
    {
        "name": "The Internet (auth)",
        "url": "https://the-internet.herokuapp.com/login",
        "tier": "deep",
        "app_type": "saas_auth",
        "site_description": "Simple login form",
        "credentials": {"username": "tomsmith", "password": "SuperSecretPassword!"},
    },
]


def validate_diagnostics_summary(result_dict: dict, target: dict) -> dict:
    """
    Validate diagnostics summary meets quality standards.
    
    Returns validation report:
    {
        "target": "...",
        "passed": bool,
        "checks": {
            "has_diagnostics_summary": bool,
            "primary_issue_meaningful": bool,
            "issues_sorted_by_impact": bool,
            "issues_capped": bool,
            "affected_steps_tracked": bool,
        },
        "summary": diagnostics_summary (if present),
        "issues": [detailed issues list],
    }
    """
    report = {
        "target": target["name"],
        "url": target["url"],
        "passed": True,
        "checks": {},
        "messages": [],
    }
    
    # Check 1: diagnostics_summary exists
    if "diagnostics_summary" not in result_dict:
        report["checks"]["has_diagnostics_summary"] = False
        report["messages"].append("❌ No diagnostics_summary in result")
        report["passed"] = False
        return report
    
    report["checks"]["has_diagnostics_summary"] = True
    summary = result_dict["diagnostics_summary"]
    report["diagnostics_summary"] = summary
    
    # Check 2: Primary issue is meaningful
    primary_issue = summary.get("summary", {}).get("primary_issue")
    if not primary_issue or primary_issue.lower() in ["unknown_failure", "unknown", "none"]:
        report["checks"]["primary_issue_meaningful"] = False
        report["messages"].append(f"⚠️ Primary issue not meaningful: {primary_issue}")
        report["passed"] = False
    else:
        report["checks"]["primary_issue_meaningful"] = True
        report["messages"].append(f"✓ Primary issue: {primary_issue}")
    
    # Check 3: Issues are sorted by impact (count descending)
    issues = summary.get("issues", [])
    if issues:
        counts = [issue.get("count", 0) for issue in issues]
        is_sorted = all(counts[i] >= counts[i + 1] for i in range(len(counts) - 1))
        
        if not is_sorted:
            report["checks"]["issues_sorted_by_impact"] = False
            report["messages"].append(f"⚠️ Issues not sorted by impact: counts={counts}")
            report["passed"] = False
        else:
            report["checks"]["issues_sorted_by_impact"] = True
            report["messages"].append("✓ Issues sorted by impact")
    else:
        report["checks"]["issues_sorted_by_impact"] = True
        report["messages"].append("✓ No issues to sort (no failures)")
    
    # Check 4: Issues capped at 5
    if len(issues) > 5:
        report["checks"]["issues_capped"] = False
        report["messages"].append(f"❌ Too many issues: {len(issues)} > 5")
        report["passed"] = False
    else:
        report["checks"]["issues_capped"] = True
        report["messages"].append(f"✓ Issues capped ({len(issues)}/5)")
    
    # Check 5: Affected steps are tracked
    has_affected_steps = all(
        "affected_steps" in issue and isinstance(issue.get("affected_steps"), list)
        for issue in issues
    )
    if issues and not has_affected_steps:
        report["checks"]["affected_steps_tracked"] = False
        report["messages"].append("⚠️ Not all issues have affected_steps tracked")
        report["passed"] = False
    else:
        report["checks"]["affected_steps_tracked"] = True
        if issues:
            report["messages"].append(f"✓ Affected steps tracked for all {len(issues)} issues")
    
    # Detailed issue breakdown
    report["issues"] = issues
    
    return report


def validate_single_site(target: dict) -> dict:
    """Run agentic QA on a single site and validate diagnostics."""
    _log.info(f"\n{'='*60}")
    _log.info(f"Validating: {target['name']}")
    _log.info(f"URL: {target['url']}")
    _log.info(f"{'='*60}")
    
    try:
        result = run_agentic_qa(
            url=target["url"],
            tier=target.get("tier", "deep"),
            journeys=None,  # Use default journeys
            site_description=target.get("site_description", ""),
            credentials=target.get("credentials"),
        )
        
        result_dict = result_to_dict(result)
        
        # Validate diagnostics
        validation = validate_diagnostics_summary(result_dict, target)
        validation["result_keys"] = list(result_dict.keys())
        
        # Print summary
        _log.info(f"\n📋 VALIDATION REPORT: {target['name']}")
        for check, result in validation["checks"].items():
            status = "✓" if result else "❌"
            _log.info(f"  {status} {check}")
        
        for msg in validation["messages"]:
            _log.info(f"  {msg}")
        
        if validation["diagnostics_summary"]:
            issues = validation["diagnostics_summary"].get("issues", [])
            _log.info(f"\n📊 Issues found: {len(issues)}")
            for i, issue in enumerate(issues, 1):
                _log.info(f"  {i}. [{issue['type']}] count={issue['count']} steps={issue['affected_steps']}")
        
        return validation
        
    except Exception as e:
        _log.error(f"❌ Error validating {target['name']}: {e}", exc_info=True)
        return {
            "target": target["name"],
            "url": target["url"],
            "passed": False,
            "error": str(e),
            "checks": {},
        }


def main():
    """Run validation across all targets."""
    _log.info("\n" + "="*70)
    _log.info("PHASE 3B TASK 6: DIAGNOSTICS VALIDATION ON REAL SITES")
    _log.info("="*70)
    
    results = []
    for target in VALIDATION_TARGETS:
        validation = validate_single_site(target)
        results.append(validation)
    
    # Summary
    passed = sum(1 for r in results if r.get("passed", False))
    total = len(results)
    
    _log.info(f"\n{'='*70}")
    _log.info(f"SUMMARY: {passed}/{total} sites validated successfully")
    _log.info(f"{'='*70}")
    
    # Save detailed report
    report_file = Path(__file__).parent.parent / "artifacts" / "task6_validation_report.json"
    report_file.parent.mkdir(parents=True, exist_ok=True)
    
    with open(report_file, "w") as f:
        json.dump(results, f, indent=2)
    
    _log.info(f"\n📄 Detailed report saved: {report_file}")
    
    # Exit code
    return 0 if passed == total else 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
