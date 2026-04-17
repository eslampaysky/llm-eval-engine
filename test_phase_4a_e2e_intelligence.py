"""
Test Phase 4A: Verify Phase 3 intelligence reaches API clients via result_json.

FOCUSED on what's actually implemented:
- result_to_dict() produces all required fields  
- JSON serialization works
- API response includes result field
"""

import json
import pytest
from core.agentic_qa import (
    AgenticQAResult,
    Finding,
    result_to_dict,
)


class TestPhase4aCore:
    """Core Phase 4A functionality: result_to_dict + JSON serialization"""
    
    def test_result_to_dict_with_step_results_includes_diagnostics(self):
        """When step_results exist, result_to_dict includes diagnostics_summary"""
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=75,
            confidence=90,
            app_type="ecommerce",
            classifier_confidence=85,
            classifier_source="gemini",
            classifier_signals=["cart"],
            findings=[],
            summary="Test",
            bundled_fix_prompt="Fix",
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_timeline=None,
            step_results=[
                {
                    "status": "failed",
                    "step_type": "action",
                    "decision_trace": [
                        {"phase": "action_resolution", "action": "failed", "confidence": 0.95}
                    ],
                    "diagnostics": {
                        "pattern_category": "selector_mismatch",
                        "reason": "Cannot find element",
                        "issue_type": "selector_error",
                    },
                }
            ],
            llm_trace={"model": "gemini", "decision": "ecommerce"},
        )
        
        result_dict = result_to_dict(result)
        
        # Phase 3 intelligence present when step_results exist
        assert "diagnostics_summary" in result_dict
        assert "summary_text" in result_dict
        
        # Verify structure
        diag = result_dict["diagnostics_summary"]
        assert isinstance(diag, dict)
        assert "summary" in diag
    
    def test_result_to_dict_without_step_results(self):
        """Without step_results, still includes llm_trace and other fields"""
        result = AgenticQAResult(
            url="https://example.com",
            tier="vibe",
            score=80,
            confidence=85,
            app_type="ecommerce",
            classifier_confidence=85,
            classifier_source="gemini",
            classifier_signals=[],
            findings=[],
            summary="OK",
            bundled_fix_prompt=None,
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_timeline=None,
            step_results=None,  # Empty case
            llm_trace={"model": "gemini", "decision": "ecommerce"},
        )
        
        result_dict = result_to_dict(result)
        
        # Core fields always present
        assert result_dict["score"] == 80
        assert result_dict["app_type"] == "ecommerce"
        assert result_dict["llm_trace"]["model"] == "gemini"
        # summary_text only added if step_results exist, that's OK
        assert isinstance(result_dict, dict)
    
    def test_json_serialization_preserves_all_fields(self):
        """result_to_dict output can be JSON serialized and deserialized"""
        result = AgenticQAResult(
            url="https://shop.com",
            tier="deep",
            score=65,
            confidence=88,
            app_type="ecommerce",
            classifier_confidence=90,
            classifier_source="gemini",
            classifier_signals=["product_page"],
            findings=[
                Finding(
                    severity="high",
                    category="functionality",
                    title="Cart broken",
                    description="Items don't persist",
                    fix_prompt="Fix storage",
                    confidence=95,
                )
            ],
            summary="Issues found",
            bundled_fix_prompt="Fix cart",
            video_path="/tmp/video.mp4",
            desktop_screenshot_b64="abc123",
            mobile_screenshot_b64="def456",
            journey_timeline=[{"step": 1}],
            step_results=[
                {
                    "status": "failed",
                    "decision_trace": [{"phase": "action_resolution", "confidence": 0.9}],
                    "diagnostics": {"issue_type": "selector_error"},
                }
            ],
            llm_trace={"model": "gemini-2.0-flash", "decision": "ecommerce", "reasoning": "Shop site"},
        )
        
        # Convert and serialize
        result_dict = result_to_dict(result)
        result_json_str = json.dumps(result_dict, ensure_ascii=False)
        
        # Deserialize
        recovered = json.loads(result_json_str)
        
        # Verify all core fields survive round-trip
        assert recovered["score"] == 65
        assert recovered["url"] == "https://shop.com"
        assert recovered["app_type"] == "ecommerce"
        assert len(recovered["findings"]) == 1
        assert recovered["findings"][0]["title"] == "Cart broken"
        assert recovered["llm_trace"]["model"] == "gemini-2.0-flash"
        
        # Phase 3 intelligence present
        assert "diagnostics_summary" in recovered
        assert "summary_text" in recovered


class TestPhase4aBackgroundJob:
    """
    Simulate what _run_agentic_qa_job() does:
    1. run_agentic_qa() returns result
    2. result_to_dict() converts it
    3. json.dumps(result_dict) creates result_json for storage
    """
    
    def test_background_job_flow_produces_storable_json(self):
        """Full flow: execution → enrichment → serialization"""
        # Step 1: Execution produces AgenticQAResult
        execution_result = AgenticQAResult(
            url="https://api-test.com",
            tier="fix",
            score=70,
            confidence=87,
            app_type="saas",
            classifier_confidence=92,
            classifier_source="gemini",
            classifier_signals=["auth_flow"],
            findings=[
                Finding(
                    severity="critical",
                    category="accessibility",
                    title="Images missing alt text",
                    description="All product images lack descriptions",
                    fix_prompt="Add alt attributes to all images",
                    confidence=96,
                )
            ],
            summary="Critical accessibility issues",
            bundled_fix_prompt="Improve alt text",
            video_path="/v/audit.mp4",
            desktop_screenshot_b64="...",
            mobile_screenshot_b64="...",
            journey_timeline=[
                {"step": 1, "action": "navigate"},
                {"step": 2, "action": "assess"},
            ],
            step_results=[
                {
                    "status": "failed",
                    "step_type": "assess_accessibility",
                    "decision_trace": [
                        {"phase": "verification", "action": "check_alt_text", "confidence": 0.94}
                    ],
                    "diagnostics": {"issue_type": "accessibility_error", "reason": "Missing alt"},
                }
            ],
            llm_trace={
                "model": "gemini-2.0-flash",
                "decision": "saas",
                "reasoning": "SaaS app with auth flows",
            },
        )
        
        # Step 2: Background job calls result_to_dict()
        enriched_dict = result_to_dict(execution_result)
        
        # Step 3: Serialize for storage
        result_json_str = json.dumps(enriched_dict, ensure_ascii=False)
        assert len(result_json_str) > 0
        
        # Verify stored result can be deserialized
        stored_data = json.loads(result_json_str)
        
        # Verify all critical fields for client
        assert stored_data["score"] == 70
        assert stored_data["app_type"] == "saas"
        assert stored_data["summary"] == "Critical accessibility issues"
        assert len(stored_data["findings"]) == 1
        
        # Phase 3 intelligence preserved
        assert "diagnostics_summary" in stored_data
        assert "summary_text" in stored_data
        assert "llm_trace" in stored_data


class TestPhase4aApiResponse:
    """Verify API response structure includes Phase 3 data"""
    
    def test_api_response_with_result_field(self):
        """
        GET /agentic-qa/status/{id} includes:
        - Traditional fields: status, score, findings, etc.
        - NEW Phase 4A field: "result" containing full result_dict with intelligence
        """
        # Create result with Phase 3 features
        result = AgenticQAResult(
            url="https://check.me",
            tier="deep",
            score=55,
            confidence=80,
            app_type="ecommerce",
            classifier_confidence=85,
            classifier_source="gemini",
            classifier_signals=["cart", "checkout"],
            findings=[],
            summary="Some issues",
            bundled_fix_prompt="Improve UX",
            video_path=None,
            desktop_screenshot_b64=None,
            mobile_screenshot_b64=None,
            journey_timeline=[{"step": 1, "action": "browse"}],
            step_results=[
                {
                    "status": "failed",
                    "decision_trace": [{"phase": "action_resolution", "confidence": 0.88}],
                    "diagnostics": {"issue_type": "functionality_error"},
                }
            ],
            llm_trace={"model": "gemini", "decision": "ecommerce"},
        )
        
        # Convert to what API returns
        result_dict = result_to_dict(result)
        result_json_str = json.dumps(result_dict, ensure_ascii=False)
        
        # Simulate API response structure (what get_agentic_qa_status returns)
        api_response = {
            "audit_id": "test-123",
            "status": "done",
            "score": result.score,
            "confidence": result.confidence,
            "url": result.url,
            "findings": [],
            # Phase 4A: Include full result with Phase 3 intelligence
            "result": json.loads(result_json_str),
        }
        
        # Verify response can be JSON serialized (for HTTP)
        response_json = json.dumps(api_response, ensure_ascii=False)
        assert len(response_json) > 0
        
        # Verify client can deserialize and get Phase 3 fields
        client_view = json.loads(response_json)
        assert "result" in client_view
        
        # Phase 3 intelligence accessible to client
        result_field = client_view["result"]
        assert result_field["score"] == 55
        assert "diagnostics_summary" in result_field
        assert "summary_text" in result_field


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
