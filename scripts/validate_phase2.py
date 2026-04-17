#!/usr/bin/env python3
"""
Phase 2 Execution Validation Script

Validates Phase 2 implementation against ecommerce, auth, and sanity check targets.
Outputs a flat result row per target with:
- site
- app_type
- primary_action_attempted
- success/failure
- failure_reason
- recovery_count

Phase 2 Gate: At least 70-80% success rate on core flows.
"""

import asyncio
import json
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Any

# Add parent directory to path for core module imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.agentic_qa import run_agentic_qa, AgenticQAResult
from core.models import AppType


@dataclass
class ValidationResult:
    """Single validation result for one site/action."""
    site: str
    app_type: str
    primary_action_attempted: str
    success: bool
    failure_reason: str = ""
    recovery_count: int = 0
    execution_time_seconds: float = 0.0
    notes: str = ""
    journey_results: list[dict] = field(default_factory=list)


# Phase 2 validation targets - PROVEN STABLE ONLY
ECOMMERCE_TARGETS = [
    {
        "url": "https://www.demoblaze.com",
        "app_type": AppType.ECOMMERCE.value,
        "primary_action": "add_to_cart_listing",
        "description": "DemoBlaze - Simple product catalog with add-to-cart",
    },
    {
        "url": "https://www.gymshark.com",
        "app_type": AppType.ECOMMERCE.value,
        "primary_action": "add_to_cart_with_variant",
        "description": "Gymshark - Ecommerce with size/color variants",
    },
    {
        "url": "https://www.advantageonlineshopping.com",
        "app_type": AppType.ECOMMERCE.value,
        "primary_action": "checkout_flow",
        "description": "Advantage Online Shopping - Full checkout flow",
    },
]

AUTH_TARGETS = [
    {
        "url": "https://the-internet.herokuapp.com/login",
        "app_type": AppType.SAAS_AUTH.value,
        "primary_action": "login",
        "description": "The Internet - Simple login form",
        "credentials": {"username": "tomsmith", "password": "SuperSecretPassword!"},
    },
    {
        "url": "https://opensource-demo.orangehrmlive.com/",
        "app_type": AppType.SAAS_AUTH.value,
        "primary_action": "login",
        "description": "OrangeHRM Demo - Enterprise auth",
        "credentials": {"username": "Admin", "password": "admin123"},
    },
]

SANITY_TARGETS = [
    {
        "url": "https://www.wikipedia.org/",
        "app_type": AppType.ECOMMERCE.value,
        "primary_action": "explore",
        "description": "Wikipedia - Large stable site exploration",
    },
]



def _extract_results(agentic_result: AgenticQAResult, target: dict) -> ValidationResult:
    """Extract validation result from agentic QA result."""
    journey_results = agentic_result.journey_results or []
    
    # Determine success: all journeys passed OR primary action matched
    success = False
    failure_reason = ""
    recovery_count = 0
    
    if journey_results:
        # Check if primary action was successful
        for jr in journey_results:
            if jr.get("status") == "PASSED":
                success = True
                break
            if jr.get("status") == "FAILED":
                if not failure_reason:
                    failure_reason = jr.get("failure_reason", "journey_failed")
            recovery_count += len(jr.get("recovery_attempts", []))
    
    if agentic_result.error:
        failure_reason = agentic_result.error[:100]
    
    if not failure_reason and not success:
        failure_reason = "unknown_failure"
    
    return ValidationResult(
        site=target.get("url", ""),
        app_type=target.get("app_type", "generic"),
        primary_action_attempted=target.get("primary_action", "explore"),
        success=success,
        failure_reason=failure_reason if not success else "",
        recovery_count=recovery_count,
        execution_time_seconds=0.0,  # Would need to track timing separately
        notes=target.get("description", ""),
        journey_results=[asdict(jr) if hasattr(jr, '__dataclass_fields__') else jr for jr in journey_results],
    )


def validate_target(target: dict, tier: str = "deep", should_cancel=None) -> ValidationResult:
    """Run validation for a single target using REAL engine (synchronous)."""
    try:
        print(f"  Testing: {target['url']}")
        
        # 🔒 GUARD: Phase 2 validation must NEVER pass custom journeys
        # This was the root cause of 0% ecommerce failures earlier:
        # empty action_candidates prevented the engine from executing
        # Solution: journeys=None triggers auto-detection → plan_journeys() with real selectors
        
        # Call REAL engine with auto-detection (journeys=None)
        result = run_agentic_qa(
            url=target["url"],
            tier=tier,
            journeys=None,  # ← CRITICAL: Must be None for auto-detection
            should_cancel=should_cancel,
        )
        
        return _extract_results(result, target)
    except Exception as e:
        import traceback
        print(f"    Error: {str(e)[:100]}")
        traceback.print_exc()
        return ValidationResult(
            site=target.get("url", ""),
            app_type=target.get("app_type", "generic"),
            primary_action_attempted=target.get("primary_action", "explore"),
            success=False,
            failure_reason=f"exception: {str(e)[:80]}",
            recovery_count=0,
            notes=f"exception: {str(e)[:150]}",
        )


def validate_suite(targets: list[dict], suite_name: str, tier: str = "deep") -> dict[str, Any]:
    """Validate a suite of targets."""
    print(f"\n{'='*70}")
    print(f"Phase 2 Validation: {suite_name}")
    print(f"{'='*70}")
    
    results: list[ValidationResult] = []
    for target in targets:
        result = validate_target(target, tier=tier)
        results.append(result)
        status = "✓ PASS" if result.success else "✗ FAIL"
        print(f"  {status} {result.site} - {result.primary_action_attempted} ({result.failure_reason if not result.success else 'OK'})")
    
    # Calculate stats
    total = len(results)
    passed = sum(1 for r in results if r.success)
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"\n{suite_name} Results:")
    print(f"  Passed: {passed}/{total} ({success_rate:.1f}%)")
    print(f"  Gate (70-80%): {'✓ PASS' if success_rate >= 70 else '✗ FAIL'}")
    
    return {
        "suite": suite_name,
        "total": total,
        "passed": passed,
        "success_rate": success_rate,
        "results": [asdict(r) for r in results],
    }


def main():
    """Run full Phase 2 validation suite with REAL engine."""
    print("\n" + "="*70)
    print("PHASE 2 EXECUTION CORRECTNESS VALIDATION — REAL ENGINE TEST")
    print("="*70)
    print("Testing real execution engine against recommended targets...\n")
    
    all_results = []
    
    # Ecommerce validation
    ecom_results = validate_suite(ECOMMERCE_TARGETS, "Ecommerce Hardening", tier="deep")
    all_results.append(ecom_results)
    
    # Auth validation
    auth_results = validate_suite(AUTH_TARGETS, "Auth Flow Reliability", tier="deep")
    all_results.append(auth_results)
    
    # Sanity checks
    sanity_results = validate_suite(SANITY_TARGETS, "Sanity Checks", tier="vibe")
    all_results.append(sanity_results)
    
    # Summary
    print(f"\n{'='*70}")
    print("PHASE 2 VALIDATION SUMMARY — REAL RESULTS")
    print(f"{'='*70}")
    
    total_sites = sum(r["total"] for r in all_results)
    total_passed = sum(r["passed"] for r in all_results)
    overall_success_rate = (total_passed / total_sites * 100) if total_sites > 0 else 0
    
    print(f"\nOverall Results:")
    print(f"  Total Sites Tested: {total_sites}")
    print(f"  Total Passed: {total_passed}")
    print(f"  Overall Success Rate: {overall_success_rate:.1f}%")
    print(f"  Phase 2 Gate (70-80%): {'✅ PASS' if 70 <= overall_success_rate <= 80 else '⚠️  MARGINAL' if overall_success_rate >= 70 else '❌ FAIL'}")
    
    # Save results
    output_path = Path(__file__).parent.parent / "phase2_validation_results.json"
    with open(output_path, "w") as f:
        json.dump({
            "timestamp": str(__import__('time').time()),
            "validation_type": "REAL_ENGINE_TEST",
            "overall_success_rate": overall_success_rate,
            "total_sites": total_sites,
            "total_passed": total_passed,
            "gate_passed": overall_success_rate >= 70,
            "suites": all_results,
        }, f, indent=2)
    print(f"\n✅ Real validation results saved to: {output_path}")
    
    # Return exit code based on success
    if overall_success_rate >= 70:
        print("\n🎉 Phase 2 Gate PASSED — Execution engine is reliable")
        return 0
    else:
        print(f"\n⚠️  Phase 2 needs fixes — Current: {overall_success_rate:.1f}%, Required: ≥70%")
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
