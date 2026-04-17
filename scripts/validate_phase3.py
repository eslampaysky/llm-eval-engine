#!/usr/bin/env python3
"""
Phase 3: Diagnostic & Intelligence Validation

Demonstrates rich failure diagnostics, LLM tracing, and decision traces.
Shows how Phase 3 improves result quality without touching execution engine.
"""

import json
import sys
from pathlib import Path
from pprint import pprint

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.diagnostics import generate_diagnostic_for_failure, summarize_diagnostic
from core.models import DiagnosticInfo, LLMTrace, DecisionTrace


def demo_diagnostics():
    """Demonstrate Phase 3 diagnostic enhancements."""
    print("\n" + "="*70)
    print("PHASE 3: INTELLIGENCE & EVALUATION QUALITY DEMO")
    print("="*70)
    print("\nShowing how Phase 3 enhances result quality without changing execution\n")
    
    # Example 1: Action Resolution Failure
    print("─" * 70)
    print("Example 1: Action Resolution Failure (Selector Not Found)")
    print("─" * 70)
    
    diagnostic_1 = generate_diagnostic_for_failure(
        failure_type="action_resolution_failed",
        goal="add_to_cart",
        context={
            "intent": "add to cart button",
            "selectors": [
                "button[data-qa='add-to-cart']",
                "button:has-text('Add to Cart')",
                ".cart-btn",
                "a[href*='cart']",
                "button.submit"
            ],
            "reason": "Selector matching failed on Gymshark product page",
        }
    )
    
    print(f"\n✗ FAILURE: {diagnostic_1.reason}")
    print(f"\n📋 Diagnostic Details:")
    print(f"   Expected: {diagnostic_1.expected}")
    print(f"   Actual: {diagnostic_1.actual}")
    print(f"\n🔍 Evidence:")
    for evidence in diagnostic_1.evidence:
        print(f"   • {evidence}")
    print(f"\n💡 Recommendations:")
    for rec in diagnostic_1.recommendations:
        print(f"   • {rec}")
    print(f"\n📊 Pattern: {diagnostic_1.pattern_category}")
    
    # Example 2: Verification Failure with Signal Mismatch
    print("\n" + "─" * 70)
    print("Example 2: Verification Failure (Signal Mismatch)")
    print("─" * 70)
    
    diagnostic_2 = generate_diagnostic_for_failure(
        failure_type="verification_failed",
        goal="add_to_cart",
        context={
            "expected_signals": [
                "text_present:added",
                "element_visible:.cart-badge",
                "url_contains:/cart",
                "text_present:success",
            ],
            "found_signals": [],
            "before_state": {
                "title": "Product Page - Gymshark",
                "url": "https://www.gymshark.com/products/123",
            },
            "after_state": {
                "title": "Product Page - Gymshark",  # Title unchanged = likely modal
                "url": "https://www.gymshark.com/products/123",  # URL unchanged
            },
            "delta": [
                "div.modal-overlay visibility: hidden → visible",
                "p.confirmation-text text: (new)",
            ],
            "reason": "Button clicked but no success signal detected in visible page content",
        }
    )
    
    print(f"\n✗ FAILURE: {diagnostic_2.reason}")
    print(f"\n📋 Diagnostic Details:")
    print(f"   Expected: {diagnostic_2.expected}")
    print(f"   Actual: {diagnostic_2.actual}")
    print(f"\n🔍 Evidence:")
    for evidence in diagnostic_2.evidence:
        print(f"   • {evidence}")
    print(f"\n💡 Recommendations:")
    for rec in diagnostic_2.recommendations[:2]:
        print(f"   • {rec}")
    print(f"\n📊 Pattern: {diagnostic_2.pattern_category}")
    
    # Example 3: Variant Required
    print("\n" + "─" * 70)
    print("Example 3: Variant Selection Required")
    print("─" * 70)
    
    diagnostic_3 = generate_diagnostic_for_failure(
        failure_type="variant_required",
        goal="add_to_cart",
        context={
            "variants": ["XS", "S", "M", "L", "XL", "2XL"],
            "reason": "Size selector found but selection not confirmed before add-to-cart",
        }
    )
    
    print(f"\n✗ FAILURE: {diagnostic_3.reason}")
    print(f"\n📋 Diagnostic Details:")
    print(f"   Expected: {diagnostic_3.expected}")
    print(f"   Actual: {diagnostic_3.actual}")
    print(f"\n🔍 Evidence:")
    for evidence in diagnostic_3.evidence:
        print(f"   • {evidence}")
    print(f"\n💡 Recommendations:")
    for rec in diagnostic_3.recommendations[:2]:
        print(f"   • {rec}")
    
    # Example 4: LLM Tracing
    print("\n" + "─" * 70)
    print("Example 4: LLM Decision Tracing")
    print("─" * 70)
    
    llm_trace = LLMTrace(
        used=True,
        model="gemini-2.0-flash",
        decision="Inferred product added to cart from modal confirmation",
        reasoning="Model detected modal overlay with 'Item added' text and close button, indicating successful cart interaction",
        confidence=0.87,
        phase="verification",
        tokens_input=2841,
        tokens_output=156,
        input_data={
            "page_context": "Visible text includes 'Item added to cart'",
            "modal_detected": True,
            "url_unchanged": True,
        }
    )
    
    print(f"\n🤖 LLM TRACE: {llm_trace.decision}")
    print(f"\n📋 Model Details:")
    print(f"   Model: {llm_trace.model}")
    print(f"   Phase: {llm_trace.phase}")
    print(f"   Confidence: {llm_trace.confidence:.0%}")
    print(f"\n🧠 Reasoning:")
    print(f"   {llm_trace.reasoning}")
    print(f"\n📊 Tokens: {llm_trace.tokens_input} input → {llm_trace.tokens_output} output")
    
    # Example 5: Decision Trace
    print("\n" + "─" * 70)
    print("Example 5: Phase-Based Decision Trace")
    print("─" * 70)
    
    decision_trace = [
        DecisionTrace(
            timestamp=1234567890.12,
            phase="action_resolution",
            step_goal="find add-to-cart",
            decision="Try 5 selector patterns in priority order",
            outcome="Found button#addToCart",
            confidence=0.95,
        ),
        DecisionTrace(
            timestamp=1234567890.85,
            phase="action_execution",
            step_goal="click add-to-cart",
            decision="Execute click action",
            outcome="Click action succeeded",
            confidence=1.0,
        ),
        DecisionTrace(
            timestamp=1234567891.30,
            phase="verification",
            step_goal="verify cart state",
            decision="Check for success signals (text + modal)",
            outcome="Modal appeared but no confirmation text in main DOM",
            confidence=0.6,
            data={"modal_detected": True, "text_found": False},
        ),
        DecisionTrace(
            timestamp=1234567891.95,
            phase="recovery",
            step_goal="recover from verification failure",
            decision="Attempt soft recovery: look for confirmation modal",
            outcome="Modal found, proceeding to close",
            confidence=0.7,
        ),
    ]
    
    print(f"\n📍 DECISION TRACE: 4 phase transitions")
    for i, dt in enumerate(decision_trace, 1):
        print(f"\n   Step {i}: {dt.phase.upper()}")
        print(f"   ├─ Decision: {dt.decision}")
        print(f"   ├─ Outcome: {dt.outcome}")
        print(f"   └─ Confidence: {dt.confidence:.0%}")
    
    # Summary
    print("\n" + "="*70)
    print("PHASE 3 IMPACT SUMMARY")
    print("="*70)
    print("""
✅ Before Phase 3:
   "Verification failed"
   → User: "What happened? No idea."

✅ After Phase 3:
   "Modal confirmation blocked main content verification"
   → Evidence: Modal overlay detected, specific selectors didn't match
   → Next: Look for modal close button or wait for confirmation
   → Pattern: Common on Shopify/WooCommerce cart flows
   
✅ With LLM Trace:
   "Model inferred success from modal (87% confidence)"
   → Decision visible, not a black box

✅ With Decision Trace:
   Can see exact phase where things went wrong:
   - Action_resolution: OK ✓
   - Action_execution: OK ✓
   - Verification: FAILED ✗ (this specific phase)
   - Recovery: Attempted
    """)
    
    # Save example to JSON
    output_path = Path(__file__).parent.parent / "phase3_diagnostics_example.json"
    example_data = {
        "phase": "Phase 3 Demo",
        "features": [
            "Rich diagnostic context",
            "LLM decision tracing",
            "Phase-based decision traces",
            "Pattern categorization",
            "Actionable recommendations",
        ],
        "diagnostic_examples": [
            {
                "failure_type": "action_resolution_failed",
                "diagnostic": {
                    "reason": diagnostic_1.reason,
                    "pattern": diagnostic_1.pattern_category,
                }
            },
            {
                "failure_type": "verification_failed",
                "diagnostic": {
                    "reason": diagnostic_2.reason,
                    "pattern": diagnostic_2.pattern_category,
                }
            },
        ],
    }
    
    with open(output_path, "w") as f:
        json.dump(example_data, f, indent=2)
    
    print(f"\n✅ Example saved to: {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(demo_diagnostics())
