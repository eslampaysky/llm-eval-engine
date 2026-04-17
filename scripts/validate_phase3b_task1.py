#!/usr/bin/env python3
"""
Phase 3b Task 1 Validation: Verify diagnostics are attached to StepResults
Minimal test to ensure diagnostic injection works without changing behavior
"""
import sys
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.agentic_qa import run_agentic_qa
from core.models import SessionState


def test_diagnostics_attached():
    """
    Run a simple ecommerce journey and verify:
    1. Execution completes (behavior unchanged)
    2. Step results contain diagnostic field
    3. Failed steps have diagnostic data populated
    """
    # Use a simple ecommerce site for testing
    target_url = "https://www.saucedemo.com"
    
    print("=" * 70)
    print("Phase 3b Task 1 Validation: Diagnostic Attachment")
    print("=" * 70)
    print(f"\nTarget: {target_url}")
    print("Testing: Simple ecommerce login + add to cart")
    print("\n" + "-" * 70)
    
    try:
        # Run a minimal journey with journeys=None (auto-detection)
        result = run_agentic_qa(
            url=target_url,
            journeys=None,  # Auto-detect
        )
        
        journey_results = result.get("journey_results", [])
        print(f"\n✓ Execution completed")
        print(f"  Journeys executed: {len(journey_results)}")
        
        # Analyze step results
        total_steps = 0
        steps_with_diagnostic = 0
        failed_steps_with_diagnostic = 0
        
        for i, journey in enumerate(journey_results):
            steps = journey.get("steps", [])
            print(f"\n  Journey {i+1}: {len(steps)} steps")
            
            for j, step in enumerate(steps):
                total_steps += 1
                step_name = step.get("step_name", "unknown")
                status = step.get("status", "unknown")
                has_diagnostic = "diagnostic" in step and step["diagnostic"] is not None
                
                if has_diagnostic:
                    steps_with_diagnostic += 1
                    if status == "failed":
                        failed_steps_with_diagnostic += 1
                    diagnostic = step["diagnostic"]
                    reason = diagnostic.get("reason", "?")
                    print(f"    Step {j+1} [{status}] {step_name}: ✓ Diagnostic attached (reason: {reason[:40]}...)")
                else:
                    if status == "passed":
                        print(f"    Step {j+1} [{status}] {step_name}: ✓ No diagnostic (success case)")
                    else:
                        print(f"    Step {j+1} [{status}] {step_name}: ⚠ Missing diagnostic [{failure_type}]")
        
        print("\n" + "=" * 70)
        print("RESULTS")
        print("=" * 70)
        print(f"Total steps: {total_steps}")
        print(f"Steps with diagnostic: {steps_with_diagnostic}/{total_steps}")
        print(f"Failed steps with diagnostic: {failed_steps_with_diagnostic}")
        
        # Validation criteria
        validations = [
            ("Execution completed", journey_results != []),
            ("Steps captured", total_steps > 0),
            ("Diagnostics attached to failures", failed_steps_with_diagnostic > 0 or total_steps == 0),
        ]
        
        all_pass = all(v[1] for v in validations)
        for check_name, result in validations:
            status = "✅" if result else "❌"
            print(f"{status} {check_name}")
        
        print("\n" + "=" * 70)
        if all_pass:
            print("✅ PHASE 3B TASK 1 VALIDATION PASSED")
            print("   Diagnostics successfully integrated into execution pipeline")
        else:
            print("❌ PHASE 3B TASK 1 VALIDATION FAILED")
            print("   Check diagnostics integration")
        print("=" * 70)
        
        return all_pass
        
    except Exception as e:
        print(f"\n❌ Execution error: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_diagnostics_attached()
    sys.exit(0 if success else 1)
