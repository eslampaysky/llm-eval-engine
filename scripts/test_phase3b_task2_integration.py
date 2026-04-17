#!/usr/bin/env python3
"""
Phase 3b Task 2 Integration Test: Verify decision traces are captured
Tests decision trace attachment WITHOUT running full browser automation
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.web_agent import _record_decision_trace
from core.models import DecisionTrace, to_dict


def test_decision_trace_recording():
    """Test decision trace recording logic"""
    
    print("=" * 70)
    print("Phase 3b Task 2 Integration Test: Decision Trace Recording")
    print("=" * 70)
    
    # Test 1: Record action resolution decision
    print("\nTest 1: Action Resolution Decision")
    trace1 = _record_decision_trace(
        phase="action_resolution",
        step_goal="enter_credentials",
        decision="no_candidates",
        outcome="failure",
        confidence=1.0,
        data={"attempt": 1, "reason": "No selectors matched"},
    )
    
    assert trace1.phase == "action_resolution", "Phase should be action_resolution"
    assert trace1.step_goal == "enter_credentials", "Step goal should match"
    assert trace1.decision == "no_candidates", "Decision should match"
    assert trace1.outcome == "failure", "Outcome should be failure"
    assert trace1.confidence == 1.0, "Confidence should be 1.0"
    assert trace1.timestamp > 0, "Timestamp should be set"
    print("  ✓ action_resolution trace recorded correctly")
    
    # Test 2: Record action execution decision
    print("\nTest 2: Action Execution Decision")
    trace2 = _record_decision_trace(
        phase="action_execution",
        step_goal="add_to_cart",
        decision="executed_click",
        outcome="verified",
        confidence=0.8,
        data={
            "action_type": "click",
            "selector": "button[id='add-btn']",
            "verification_success": True,
        },
    )
    
    assert trace2.phase == "action_execution", "Phase should be action_execution"
    assert trace2.decision == "executed_click", "Decision should match"
    assert trace2.confidence == 0.8, "Confidence should be 0.8"
    assert trace2.data["selector"] == "button[id='add-btn']", "Selector should be in data"
    print("  ✓ action_execution trace recorded correctly")
    
    # Test 3: Verify serialization works
    print("\nTest 3: Serialization to Dict")
    dict_trace = to_dict(trace1)
    
    required_fields = ["timestamp", "phase", "step_goal", "decision", "outcome", "confidence", "data"]
    for field in required_fields:
        assert field in dict_trace, f"Field '{field}' should be in serialized trace"
    
    print("  ✓ Trace serializes to dict correctly")
    print(f"    Fields: {list(dict_trace.keys())}")
    
    # Test 4: Verify decision trace list aggregation
    print("\nTest 4: Decision Trace List Aggregation")
    decisions = []
    decisions.append(trace1)
    decisions.append(trace2)
    
    decisions_dict = [to_dict(d) for d in decisions]
    assert len(decisions_dict) == 2, "Should have 2 traces"
    assert decisions_dict[0]["phase"] == "action_resolution", "First should be action_resolution"
    assert decisions_dict[1]["phase"] == "action_execution", "Second should be action_execution"
    
    print("  ✓ Decision traces aggregate correctly")
    print(f"    Phases: {[d['phase'] for d in decisions_dict]}")
    
    print("\n" + "=" * 70)
    print("✅ PHASE 3B TASK 2 INTEGRATION TEST PASSED")
    print("   Decision trace recording working correctly")
    print("=" * 70)
    return True


if __name__ == "__main__":
    try:
        success = test_decision_trace_recording()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
