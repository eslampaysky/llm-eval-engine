from __future__ import annotations

import json
import os
import sys
from dataclasses import asdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agentic_qa import discover_site, plan_journeys
from core.models import ActionCandidate, AppType, JourneyPlan, JourneyStep, RecoveryEvent, SessionState, StepResult, StepType, SuccessSignal
from core.report_builder import build_journey_timeline


def test_structured_models_are_json_serializable() -> None:
    plan = JourneyPlan(
        name="user_checkout",
        app_type="ecommerce",
        steps=[
            JourneyStep(
                goal="login",
                intent="login",
                step_type=StepType.CLICK.value,
                action_candidates=[
                    ActionCandidate(type="click", intent="login button", role="button", name="Login")
                ],
                success_signals=[
                    SuccessSignal(type="url_contains", value="/dashboard", priority="high")
                ],
                expected_state_change={"is_logged_in": True},
            )
        ],
    )
    state = SessionState(base_url="https://example.com", current_url="https://example.com")
    step_result = StepResult(
        step_name="login",
        goal="login",
        status="passed",
        recovery_attempts=[
            asdict(
                RecoveryEvent(
                    choke_point="before_action",
                    blocker_type="cookie_consent",
                    action_taken="clicked_close",
                    success=True,
                    selector_used="button[aria-label*='close' i]",
                    notes="Cookie consent banner detected and dismissed before action",
                )
            )
        ],
    )

    payload = {
        "plan": asdict(plan),
        "state": asdict(state),
        "step": asdict(step_result),
    }

    encoded = json.dumps(payload)
    assert "user_checkout" in encoded
    assert "is_logged_in" in encoded
    assert "cookie_consent" in encoded
    assert StepType.CLICK.value in encoded


def test_build_journey_timeline_includes_failure_reason() -> None:
    timeline = build_journey_timeline(
        [
            {
                "journey": "checkout",
                "steps": [
                    {"step_name": "login", "status": "passed"},
                    {
                        "step_name": "payment",
                        "status": "failed",
                        "failure_type": "blocked",
                        "error": "popup obscured button",
                        "evidence_delta": ["URL changed from /cart to /checkout"],
                        "recovery_attempts": ["pre_action:button:has-text('Close')"],
                    },
                ],
            }
        ]
    )
    assert timeline[0]["status"] == "FAILED"
    assert timeline[0]["failed_step"] == "payment"
    assert timeline[0]["reason"] == "popup obscured button"


def test_routes_include_site_description_wiring() -> None:
    routes_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api", "routes.py"))
    with open(routes_path, encoding="utf-8") as fh:
        route_text = fh.read()

    assert "site_description=payload.site_description" in route_text
    assert "payload.site_description" in route_text


def test_routes_include_optional_timeline_fields() -> None:
    routes_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api", "routes.py"))
    with open(routes_path, encoding="utf-8") as fh:
        route_text = fh.read()

    assert '"journey_timeline": journey_timeline' in route_text
    assert '"step_results": step_results' in route_text


def test_marketing_site_discovery_prefers_marketing_template_family() -> None:
    crawl = {
        "title": "Cookiebot Pricing and Features",
        "text_snippet": "See pricing, request demo, contact sales, trusted by customers, integrations",
        "nav_links": [
            {"text": "Pricing", "href": "https://example.com/pricing"},
            {"text": "Features", "href": "https://example.com/features"},
            {"text": "Contact", "href": "https://example.com/contact"},
        ],
        "buttons": ["Request Demo", "Start free trial"],
        "forms": [],
    }

    context = discover_site(crawl, description="Cookie consent marketing website")

    assert context["app_type"] == AppType.MARKETING.value
    assert context["primary_goal"] == "explore marketing paths"
    assert "pricing" in context["features"]


def test_marketing_site_plan_uses_navigation_journeys() -> None:
    journeys = plan_journeys({"app_type": AppType.MARKETING.value})

    assert [journey.name for journey in journeys] == [
        "pricing_navigation",
        "features_navigation",
        "contact_navigation",
    ]
    assert journeys[0].steps[0].goal == "reach_pricing"
    assert journeys[0].steps[0].step_type == StepType.CLICK.value
