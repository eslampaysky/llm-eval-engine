#!/usr/bin/env python3
"""
Phase 3b Task 1 Integration Test: Verify diagnostic attachment logic
Tests the diagnostic attachment WITHOUT running full browser automation
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.web_agent import _attach_diagnostic_to_failure
from core.models import JourneyStep, SuccessSignal

def test_diagnostic_attachment():
    """Test diagnostic attachment logic with mock data"""
    
    print("=" * 70)
    print("Phase 3b Task 1 Integration Test: Diagnostic Attachment Logic")
    print("=" * 70)
    
    # Create mock step and verification result
    step = JourneyStep(
        intent="Login to app",
        goal="enter_credentials_and_login",
        success_signals=[SuccessSignal(type="text", value="Dashboard loaded")],
        action_candidates=[],
        allow_soft_recovery=True,
    )
    
    # Mock failed verification
    verification_result = {
        "success": False,
        "failure_type": "verification_failed",
        "passed_signals": [],
        "failed_signals": [{"text": "Dashboard loaded", "found": False}],
        "delta_summary": ["Dashboard not found after login"],
    }
    
    candidates = [
        {"selectors": ["input[name='username']", "input[type='email']"]},
        {"selectors": ["input[name='password']", "input[type='password']"]},
        {"selectors": ["button[type='submit']", "button:contains('Login')"]},
    ]
    
    before_snapshot = {
        "url": "https://example.com/login",
        "text_snippet": "Welcome to login page",
    }
    
    after_snapshot = {
        "url": "https://example.com/login",  # Still on login, failed
        "text_snippet": "Welcome to login page",
    }
    
    print("\nTest case: Failed verification with incomplete selector match")
    print(f"  Step goal: {step.goal}")
    print(f"  Failure type: {verification_result['failure_type']}")
    print(f"  Expected signal: Dashboard loaded")
    print(f"  Signal found: False")
    
    print("\nCalling _attach_diagnostic_to_failure()...")
    diagnostic = _attach_diagnostic_to_failure(
        verification_result=verification_result,
        step=step,
        candidates=candidates,
        before_snapshot=before_snapshot,
        after_snapshot=after_snapshot,
    )
    
    if diagnostic is None:
        print("❌ FAILED: No diagnostic was generated")
        return False
    
    print("✓ Diagnostic generated successfully")
    print(f"\n  Reason: {diagnostic.get('reason', 'N/A')[:100]}")
    print(f"  Pattern: {diagnostic.get('pattern_category', 'N/A')}")
    print(f"  Recommendations: {len(diagnostic.get('recommendations', []))} items")
    
    # Verify diagnostic structure
    required_fields = ["reason", "expected", "actual", "evidence", "pattern_category"]
    missing = [f for f in required_fields if f not in diagnostic or diagnostic[f] is None]
    
    if missing:
        print(f"\n❌ FAILED: Missing fields in diagnostic: {missing}")
        return False
    
    print("\n" + "=" * 70)
    print("✅ PHASE 3B TASK 1 INTEGRATION TEST PASSED")
    print("   Diagnostic attachment logic working correctly")
    print("=" * 70)
    return True

if __name__ == "__main__":
    success = test_diagnostic_attachment()
    sys.exit(0 if success else 1)
