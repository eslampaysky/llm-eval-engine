#!/usr/bin/env python3
"""
Test Phase 3b Task 5: Human-Readable Summaries

Validates that structured diagnostics are converted to clear, 
human-readable narrative text.
"""

import pytest
from core.agentic_qa import result_to_dict, AgenticQAResult, _generate_human_readable_summary


class TestPhase3bTask5HumanReadable:
    """Test human-readable summary generation."""
    
    def test_no_issues_produces_success_message(self):
        """When no failures, summary should indicate success."""
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
            step_results=[
                {"step_name": "step_1", "status": "success"},
                {"step_name": "step_2", "status": "success"},
            ],
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary_text = result_dict.get("summary_text", "")
        
        assert "successfully" in summary_text.lower()
    
    def test_selector_mismatch_produces_human_text(self):
        """Selector mismatch should produce readable explanation."""
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
            step_results=[
                {
                    "step_name": "click_button",
                    "status": "failed",
                    "diagnostic": {
                        "reason": "Element not found",
                        "pattern_category": "selector_mismatch",
                        "recommendations": ["Try waiting for element", "Update selector"]
                    }
                }
            ],
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary_text = result_dict.get("summary_text", "")
        
        # Should contain title
        assert "Element Selection Failed" in summary_text
        # Should contain explanation
        assert "Could not locate" in summary_text or "selectors" in summary_text.lower()
        # Should contain impact
        assert "Impact" in summary_text
    
    def test_variant_required_produces_specific_text(self):
        """Variant required should have ecommerce-specific explanation."""
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=None,
            confidence=None,
            app_type="ecommerce",
            classifier_confidence=80,
            classifier_source="llm",
            classifier_signals=[],
            findings=[],
            summary="Test",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_results=None,
            journey_timeline=None,
            step_results=[
                {
                    "step_name": "add_to_cart",
                    "status": "failed",
                    "diagnostic": {
                        "reason": "Size required but not selected",
                        "pattern_category": "variant_required",
                        "recommendations": ["Select product size first"]
                    }
                }
            ],
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary_text = result_dict.get("summary_text", "")
        
        assert "Required Selection" in summary_text
        assert "variant" in summary_text.lower() or "option" in summary_text.lower()
        assert "add-to-cart" in summary_text.lower() or "checkout" in summary_text.lower()
    
    def test_multiple_issues_shows_details(self):
        """Multiple issues should show detailed issue list."""
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
            step_results=[
                {
                    "step_name": "step_1",
                    "status": "failed",
                    "diagnostic": {
                        "reason": "Element not found",
                        "pattern_category": "selector_mismatch",
                        "recommendations": ["Wait for element"]
                    }
                },
                {
                    "step_name": "step_2",
                    "status": "failed",
                    "diagnostic": {
                        "reason": "Page load too slow",
                        "pattern_category": "timeout",
                        "recommendations": ["Increase timeout"]
                    }
                }
            ],
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary_text = result_dict.get("summary_text", "")
        
        # Should have details section
        assert "Details of Issues Found" in summary_text
        # Should list issues
        assert "selector_mismatch" in summary_text
        assert "timeout" in summary_text
    
    def test_affected_steps_listed(self):
        """Affected steps should be mentioned in summary."""
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
            step_results=[
                {
                    "step_name": "click_add_to_cart",
                    "status": "failed",
                    "diagnostic": {
                        "reason": "Button not found",
                        "pattern_category": "selector_mismatch",
                        "recommendations": ["Check selector"]
                    }
                }
            ],
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        summary_text = result_dict.get("summary_text", "")
        
        # Should mention the affected step
        assert "Affected" in summary_text
        assert "click_add_to_cart" in summary_text
    
    def test_summary_text_in_result_dict(self):
        """summary_text field should be present in result dict."""
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
            step_results=[
                {
                    "step_name": "step_1",
                    "status": "failed",
                    "diagnostic": {
                        "reason": "Test",
                        "pattern_category": "unknown",
                        "recommendations": []
                    }
                }
            ],
            llm_trace=None,
            analysis_limited=False,
            user_key_exhausted=False,
        )
        
        result_dict = result_to_dict(result)
        
        # summary_text should be a key in the result
        assert "summary_text" in result_dict
        
        # It should be non-empty
        assert result_dict["summary_text"]
        assert len(result_dict["summary_text"]) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
