#!/usr/bin/env python3
"""
Phase 3b Task 3 Integration Test: Verify LLM trace capture
Tests LLM trace logging WITHOUT running full classification  
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.agentic_qa import _capture_llm_classification_trace
from core.models import to_dict


def test_llm_trace_capture():
    """Test LLM trace capture logic"""
    
    print("=" * 70)
    print("Phase 3b Task 3 Integration Test: LLM Trace Capture")
    print("=" * 70)
    
    # Test 1: Capture trace from classification result
    print("\nTest 1: Classification LLM Trace Capture")
    classification_result = {
        "app_type": "ecommerce",
        "confidence": 92,
        "reasoning": "Detected cart + product grid + checkout flow",
        "signals": ["has_cart", "has_products", "has_checkout"],
        "classification_source": "llm",
        "requires_auth_first": False,
    }
    
    trace = _capture_llm_classification_trace(classification_result)
    
    assert trace is not None, "LLM trace should be captured"
    assert trace["used"] == True, "Should mark LLM as used"
    assert trace["model"], "Should have model name"
    assert trace["decision"] == "ecommerce", "Decision should be app_type"
    assert trace["phase"] == "classification", "Phase should be classification"
    assert 0 <= trace["confidence"] <= 1.0, f"Confidence should be 0-1, got {trace['confidence']}"
    assert trace["reasoning"], "Reasoning should not be empty"
    print(f"  ✓ LLM trace captured correctly")
    print(f"    Model: {trace['model']}")
    print(f"    Decision: {trace['decision']}")
    print(f"    Confidence: {trace['confidence']:.2f}")
    print(f"    Reasoning: {trace['reasoning'][:50] if trace['reasoning'] else 'N/A'}...")
    
    # Test 2: Verify trace structure
    print("\nTest 2: LLM Trace Structure Validation")
    required_fields = ["used", "model", "decision", "reasoning", "confidence", "phase", "input_data"]
    for field in required_fields:
        assert field in trace, f"Missing field: {field}"
    print(f"  ✓ All required fields present: {required_fields}")
    
    # Test 3: Handle None input gracefully
    print("\nTest 3: Graceful Handling of None Input")
    trace_none = _capture_llm_classification_trace(None)
    assert trace_none is None, "Should return None for None input"
    print("  ✓ Handles None input gracefully")
    
    # Test 4: Verify confidence normalization
    print("\nTest 4: Confidence Normalization")
    test_cases = [
        (100, 1.0),  # 100% → 1.0
        (50, 0.5),   # 50% → 0.5
        (0, 0.0),    # 0% → 0.0
        (150, 1.0),  # Over 100% → clamped to 1.0
        (-10, 0.0),  # Negative → clamped to 0.0
    ]
    
    for input_conf, expected_conf in test_cases:
        result = {
            "app_type": "test",
            "confidence": input_conf,
            "reasoning": "test",
            "signals": [],
            "classification_source": "llm",
        }
        trace_test = _capture_llm_classification_trace(result)
        assert trace_test["confidence"] == expected_conf, \
            f"Confidence {input_conf}% should normalize to {expected_conf}, got {trace_test['confidence']}"
    
    print("  ✓ Confidence normalization working correctly")
    for inp, exp in test_cases:
        print(f"    {inp}% → {exp}")
    
    print("\n" + "=" * 70)
    print("✅ PHASE 3B TASK 3 INTEGRATION TEST PASSED")
    print("   LLM trace capture working correctly")
    print("=" * 70)
    return True


if __name__ == "__main__":
    try:
        success = test_llm_trace_capture()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
