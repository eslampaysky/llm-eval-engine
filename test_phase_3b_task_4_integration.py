"""
Test Phase 3b Task 4: Result Integration Layer

Validates that result_to_dict() automatically includes:
1. diagnostics_summary (structured summaries)
2. execution_context (metadata about decision traces and LLM usage)
3. Raw step_results (unchanged, for debugging)
"""

import pytest
from dataclasses import dataclass
from typing import Any
from core.agentic_qa import result_to_dict, AgenticQAResult, Finding


class TestPhase3bTask4Integration:
    """Test result integration layer - communication layer for diagnostics."""
    
    def test_result_to_dict_includes_diagnostics_summary(self):
        """Verify diagnostics_summary is included in result dict."""
        # Create a result with step results containing failures
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "diagnostic": {
                    "reason": "Element not found",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Try alternative selector", "Wait for element"]
                }
            },
            {
                "step_name": "step_2",
                "status": "success"
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        
        # Verify diagnostics_summary exists
        assert "diagnostics_summary" in result_dict, "diagnostics_summary missing from result"
        
        # Verify structure
        summary = result_dict["diagnostics_summary"]
        assert "summary" in summary, "summary missing from diagnostics_summary"
        assert "issues" in summary, "issues missing from diagnostics_summary"
        
        # Verify summary structure
        summary_data = summary["summary"]
        assert "total_steps" in summary_data
        assert "failed_steps" in summary_data
        assert "primary_issue" in summary_data
        assert summary_data["total_steps"] == 2
        assert summary_data["failed_steps"] == 1
    
    def test_result_to_dict_includes_execution_context(self):
        """Verify execution_context is included with decision traces and LLM info."""
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "decision_trace": [
                    {"phase": "action_execution", "action": "click", "confidence": 0.8}
                ],
                "diagnostic": {
                    "reason": "Click failed",
                    "pattern_category": "execution_error",
                    "recommendations": ["Retry"]
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace={"model": "gpt-4", "decision": "ecommerce"},
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        
        # Verify execution_context exists
        assert "execution_context" in result_dict, "execution_context missing"
        
        context = result_dict["execution_context"]
        assert "decision_traces_captured" in context
        assert "llm_used_for_classification" in context
        assert context["decision_traces_captured"] == 1
        assert context["llm_used_for_classification"] is True
    
    def test_result_to_dict_without_step_results(self):
        """Verify result_to_dict handles no step_results gracefully."""
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=None,  # No step results
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        
        # Should not crash, should not include diagnostics
        assert "diagnostics_summary" not in result_dict
        assert "execution_context" not in result_dict
    
    def test_result_to_dict_preserves_raw_data(self):
        """Verify raw step_results are preserved in output."""
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "diagnostic": {
                    "reason": "Test error",
                    "pattern_category": "test",
                    "recommendations": []
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        
        # Raw data should be preserved
        assert result_dict["step_results"] == step_results
        # Summaries should be added, not replace raw data
        assert "diagnostics_summary" in result_dict
    
    def test_aggregation_identifies_primary_issue(self):
        """Verify primary_issue is correctly identified as most common failure type."""
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector error 1",
                    "pattern_category": "selector_mismatch",
                    "recommendations": []
                }
            },
            {
                "step_name": "step_2",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector error 2",
                    "pattern_category": "selector_mismatch",
                    "recommendations": []
                }
            },
            {
                "step_name": "step_3",
                "status": "failed",
                "diagnostic": {
                    "reason": "Timeout error",
                    "pattern_category": "timeout",
                    "recommendations": []
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary = result_dict["diagnostics_summary"]["summary"]
        
        # Primary issue should be selector_mismatch (2 occurrences vs 1 timeout)
        assert "selector_mismatch" in summary["primary_issue"]
        assert summary["failed_steps"] == 3
    
    def test_issues_sorted_by_impact(self):
        """Verify issues are sorted by frequency (count), not by appearance order."""
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "diagnostic": {
                    "reason": "Timeout",
                    "pattern_category": "timeout",
                    "recommendations": ["Increase wait"]
                }
            },
            {
                "step_name": "step_2",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector error",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Check page"]
                }
            },
            {
                "step_name": "step_3",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector error 2",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Check page"]
                }
            },
            {
                "step_name": "step_4",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector error 3",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Check page"]
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        issues = result_dict["diagnostics_summary"]["issues"]
        
        # First issue should be selector_mismatch (3 occurrences)
        assert len(issues) == 2
        assert issues[0]["type"] == "selector_mismatch"
        assert issues[0]["count"] == 3
        assert issues[1]["type"] == "timeout"
        assert issues[1]["count"] == 1
    
    def test_issues_capped_at_max_issues(self):
        """Verify issue list is capped to prevent overwhelming users."""
        step_results = []
        for i in range(10):
            step_results.append({
                "step_name": f"step_{i}",
                "status": "failed",
                "diagnostic": {
                    "reason": f"Error {i}",
                    "pattern_category": f"error_type_{i}",
                    "recommendations": []
                }
            })
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        issues = result_dict["diagnostics_summary"]["issues"]
        
        # Should be capped at MAX_ISSUES (5), not all 10
        assert len(issues) <= 5, f"Expected max 5 issues, got {len(issues)}"
    
    def test_affected_steps_tracked(self):
        """Verify affected steps are tracked for each issue type."""
        step_results = [
            {
                "step_name": "click_button",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector not found",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Try wait"]
                }
            },
            {
                "step_name": "fill_form",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector not found",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Try wait"]
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        issues = result_dict["diagnostics_summary"]["issues"]
        
        # Should have affected_steps field
        assert len(issues) == 1
        assert "affected_steps" in issues[0]
        assert "click_button" in issues[0]["affected_steps"]
        assert "fill_form" in issues[0]["affected_steps"]
        assert issues[0]["count"] == 2


class TestPhase3bTask4InternalErrorFiltering:
    """Test that internal_error is suppressed when real issues exist."""
    
    def test_internal_error_suppressed_when_real_issues_exist(self):
        """internal_error should be hidden if any real issue exists."""
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "diagnostic": {
                    "reason": "Selector not found",
                    "pattern_category": "selector_mismatch",
                    "recommendations": ["Try wait"]
                }
            },
            {
                "step_name": "step_2",
                "status": "failed",
                "diagnostic": {
                    "reason": "Internal error occurred",
                    "pattern_category": "internal_error",
                    "recommendations": ["Check logs"]
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary = result_dict["diagnostics_summary"]["summary"]
        issues = result_dict["diagnostics_summary"]["issues"]
        
        # primary_issue should be selector_mismatch, NOT internal_error
        assert "selector_mismatch" in summary["primary_issue"]
        assert "internal_error" not in summary["primary_issue"]
        
        # issues list should NOT contain internal_error
        assert len(issues) == 1
        assert issues[0]["type"] == "selector_mismatch"
        assert not any(issue["type"] == "internal_error" for issue in issues)
    
    def test_internal_error_shown_when_only_issue(self):
        """internal_error SHOULD be shown if it's the ONLY issue."""
        step_results = [
            {
                "step_name": "step_1",
                "status": "failed",
                "diagnostic": {
                    "reason": "Internal error occurred",
                    "pattern_category": "internal_error",
                    "recommendations": ["Check logs"]
                }
            }
        ]
        
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="generic",
            classifier_confidence=50,
            classifier_source="fallback",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=step_results,
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary = result_dict["diagnostics_summary"]["summary"]
        issues = result_dict["diagnostics_summary"]["issues"]
        
        # primary_issue SHOULD be internal_error since it's the only one
        assert "internal_error" in summary["primary_issue"]
        
        # issues list SHOULD contain internal_error
        assert len(issues) == 1
        assert issues[0]["type"] == "internal_error"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
