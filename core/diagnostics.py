"""
Phase 3: Diagnostic Information Generation

Converts bare failure types into rich diagnostic context.
Provides actionable insights for why failures occurred.
"""

from core.models import DiagnosticInfo, FailureType


def generate_action_resolution_diagnostic(
    goal: str,
    intent: str,
    selectors_tried: list[str],
    reason: str = "",
) -> DiagnosticInfo:
    """Generate diagnostic for action resolution failures."""
    return DiagnosticInfo(
        reason=reason or f"Could not find '{intent}' element for '{goal}'",
        expected=f"At least one selector from {len(selectors_tried)} candidates to match",
        actual="No selectors matched any DOM elements",
        evidence=[
            f"Tried {len(selectors_tried)} selectors: {', '.join(selectors_tried[:5])}{'...' if len(selectors_tried) > 5 else ''}",
            f"Intent: {intent}",
            f"Step goal: {goal}",
        ],
        recommendations=[
            "Verify selectors are correct for this site",
            "Check if element is hidden or lazy-loaded",
            "Look for dynamic selector generation (React, Vue, Angular)",
            "Increase discovery timeout for slow-loading pages",
        ],
        pattern_category="selector_mismatch",
    )


def generate_verification_failed_diagnostic(
    signals_expected: list[str],
    signals_found: list[str],
    before_state: dict,
    after_state: dict,
    delta: list[str],
    reason: str = "",
) -> DiagnosticInfo:
    """Generate diagnostic for verification failures."""
    missing_signals = [s for s in signals_expected if s not in signals_found]
    
    return DiagnosticInfo(
        reason=reason or f"Action executed but {len(missing_signals)} success signals not detected",
        expected=f"Success signals: {', '.join(signals_expected)}",
        actual=f"Only found: {', '.join(signals_found) if signals_found else '(none)'}",
        evidence=[
            f"Missing signals: {', '.join(missing_signals) if missing_signals else 'none'}",
            f"Page changes detected: {len(delta)} DOM deltas",
            f"Before state: {before_state.get('title', '?')} @ {before_state.get('url', '?')}",
            f"After state: {after_state.get('title', '?')} @ {after_state.get('url', '?')}",
        ],
        recommendations=[
            "Element may require additional confirmation (modal, button click)",
            "Page may use async updates (wait longer for DOM to settle)",
            "Success signal patterns may not match this site's UI",
            "Check browser console for errors during action",
        ],
        pattern_category="verification_mismatch",
    )


def generate_variant_required_diagnostic(
    variants_found: list[str] = None,
    reason: str = "",
) -> DiagnosticInfo:
    """Generate diagnostic for variant selection failures."""
    return DiagnosticInfo(
        reason=reason or "Product requires variant selection (size, color, etc) before adding to cart",
        expected="Variant selector to be visible and selectable",
        actual=f"Attempted selection but could not confirm: {len(variants_found or [])} options found",
        evidence=[
            f"Detected variant options: {', '.join(variants_found) if variants_found else '(searching...)'}",
            "Common patterns: size dropdown, color buttons, quantity input",
        ],
        recommendations=[
            "Product page requires explicit variant selection",
            "Look for size/color/variant dropdowns or buttons",
            "Try selecting default/first option before add-to-cart",
            "Check if options are radio buttons, dropdowns, or button groups",
        ],
        pattern_category="variant_selection_required",
    )


def generate_timeout_diagnostic(
    timeout_ms: float,
    phase: str = "navigation",
    reason: str = "",
) -> DiagnosticInfo:
    """Generate diagnostic for timeout failures."""
    return DiagnosticInfo(
        reason=reason or f"Operation exceeded {timeout_ms}ms timeout during {phase}",
        expected=f"Completion within {timeout_ms}ms",
        actual=f"Timeout after {timeout_ms}ms during {phase}",
        evidence=[
            f"Phase: {phase}",
            f"Timeout limit: {timeout_ms}ms",
            "Possible causes: network latency, slow server, heavy JavaScript",
        ],
        recommendations=[
            "Increase timeout for slow networks (try 30s+ instead of default)",
            "Check network performance in DevTools",
            "Site may have CloudFlare/WAF rate limiting",
            "Try at different time to avoid server load",
        ],
        pattern_category="timeout",
    )


def generate_bot_protection_diagnostic(
    detected_by: str = "CAPTCHA",
    reason: str = "",
) -> DiagnosticInfo:
    """Generate diagnostic for bot protection blocks."""
    return DiagnosticInfo(
        reason=reason or f"Blocked by {detected_by} detection",
        expected="Successful site access and navigation",
        actual=f"Access blocked by {detected_by or 'bot protection'} system",
        evidence=[
            f"Detection method: {detected_by}",
            "Site has anti-bot measures enabled",
        ],
        recommendations=[
            "Reduce request frequency and add delays between actions",
            "Use residential proxy or different IP if available",
            "Wait 15-30 minutes before retrying (rate limit)",
            "Site may require JavaScript execution (Playwright handles this)",
            "Check if site blocks automation tools specifically",
        ],
        pattern_category="bot_protection",
    )


def generate_diagnostic_for_failure(
    failure_type: str,
    goal: str = "",
    context: dict = None,
) -> DiagnosticInfo | None:
    """Generate appropriate diagnostic based on failure type."""
    if not context:
        context = {}
    
    if failure_type == FailureType.ACTION_RESOLUTION_FAILED.value:
        return generate_action_resolution_diagnostic(
            goal=goal,
            intent=context.get("intent", ""),
            selectors_tried=context.get("selectors", []),
            reason=context.get("reason", ""),
        )
    elif failure_type == FailureType.VERIFICATION_FAILED.value:
        return generate_verification_failed_diagnostic(
            signals_expected=context.get("expected_signals", []),
            signals_found=context.get("found_signals", []),
            before_state=context.get("before_state", {}),
            after_state=context.get("after_state", {}),
            delta=context.get("delta", []),
            reason=context.get("reason", ""),
        )
    elif failure_type == FailureType.VARIANT_REQUIRED.value:
        return generate_variant_required_diagnostic(
            variants_found=context.get("variants", []),
            reason=context.get("reason", ""),
        )
    elif failure_type == FailureType.TIMEOUT.value:
        return generate_timeout_diagnostic(
            timeout_ms=context.get("timeout_ms", 30000),
            phase=context.get("phase", "execution"),
            reason=context.get("reason", ""),
        )
    elif failure_type == FailureType.BLOCKED_BY_BOT_PROTECTION.value:
        return generate_bot_protection_diagnostic(
            detected_by=context.get("detected_by", "CAPTCHA"),
            reason=context.get("reason", ""),
        )
    
    return None


def summarize_diagnostic(diagnostic: DiagnosticInfo) -> str:
    """Generate human-readable summary from diagnostic."""
    summary_parts = [diagnostic.reason]
    
    if diagnostic.evidence:
        summary_parts.append(f"Evidence: {' • '.join(diagnostic.evidence[:2])}")
    
    if diagnostic.recommendations:
        summary_parts.append(f"Try: {diagnostic.recommendations[0]}")
    
    return " | ".join(summary_parts)
