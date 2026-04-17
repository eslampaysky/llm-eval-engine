#!/usr/bin/env python3
"""
Debug single ecommerce journey step-by-step on Demoblaze.

Goal: See exactly where step transition breaks.
"""

import sys
import json
from pathlib import Path
from pprint import pprint

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.agentic_qa import run_agentic_qa
from core.models import AppType


def debug_demoblaze():
    """Debug ecommerce journey on Demoblaze step-by-step."""
    print("\n" + "="*70)
    print("DEBUGGING: Demoblaze Ecommerce Journey")
    print("="*70)
    print("\nTarget: https://www.demoblaze.com")
    print("Journey: Let system auto-detect and plan journeys\n")
    
    # Run the journey
    print("[1] Calling run_agentic_qa with auto-detection...")
    result = run_agentic_qa(
        url="https://www.demoblaze.com",
        tier="deep",
        journeys=None,  # ← Let it auto-detect and use plan_journeys
    )
    
    print("\n" + "="*70)
    print("FULL RESULT")
    print("="*70)
    pprint(result.__dict__)
    
    print("\n" + "="*70)
    print("JOURNEY RESULTS (detailed)")
    print("="*70)
    if result.journey_results:
        for i, jr in enumerate(result.journey_results):
            print(f"\nJourney #{i}:")
            print(f"  Name: {jr.get('name')}")
            print(f"  Status: {jr.get('status')}")
            print(f"  Failure reason: {jr.get('failure_reason')}")
            print(f"  Error: {jr.get('error')}")
            
            steps = jr.get("steps", [])
            print(f"  Steps: {len(steps)}")
            for si, step in enumerate(steps):
                print(f"\n    Step #{si}:")
                print(f"      Goal: {step.get('goal')}")
                print(f"      Status: {step.get('status')}")
                print(f"      Failure Type: {step.get('failure_type')}")
                print(f"      Failure Reason: {step.get('failure_reason')}")
                print(f"      Action Type: {step.get('action_type')}")
                print(f"      Recovery Attempts: {len(step.get('recovery_attempts', []))}")
                
                if step.get('recovery_attempts'):
                    for ri, recovery in enumerate(step.get('recovery_attempts', [])):
                        print(f"        Recovery #{ri}: {recovery.get('type')} → {recovery.get('result')}")
    else:
        print("No journey results available")
    
    print("\n" + "="*70)
    print("KEY DIAGNOSTICS")
    print("="*70)
    print(f"App Type: {result.app_type}")
    print(f"Score: {result.score}")
    print(f"Error: {result.error}")
    print(f"Failure Reason: {result.failure_reason}")
    print(f"Execution Time: {result.execution_time_ms}ms")
    
    # Save for later analysis
    output_path = Path(__file__).parent.parent / "debug_demoblaze.json"
    with open(output_path, "w") as f:
        # Convert to serializable format
        debug_data = {
            "status": result.status,
            "error": result.error,
            "failure_reason": result.failure_reason,
            "execution_time_ms": result.execution_time_ms,
            "journey_results": result.journey_results or [],
        }
        json.dump(debug_data, f, indent=2)
    
    print(f"\n✅ Debug output saved to: {output_path}")
    
    return result


if __name__ == "__main__":
    debug_demoblaze()
