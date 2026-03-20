from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import asdict

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core.agentic_qa import _login_step, _open_product_step, discover_site, plan_journeys
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
    assert "payload.credentials" in route_text


def test_routes_include_optional_timeline_fields() -> None:
    routes_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api", "routes.py"))
    with open(routes_path, encoding="utf-8") as fh:
        route_text = fh.read()

    assert '"journey_timeline": journey_timeline' in route_text
    assert '"step_results": step_results' in route_text


def test_job_queue_defaults_to_two_workers() -> None:
    queue_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "api", "job_queue.py"))
    with open(queue_path, encoding="utf-8") as fh:
        queue_text = fh.read()

    assert 'JOB_WORKERS", "2"' in queue_text


def test_web_agent_uses_container_safe_chromium_flags() -> None:
    agent_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "core", "web_agent.py"))
    with open(agent_path, encoding="utf-8") as fh:
        agent_text = fh.read()

    assert '"--disable-dev-shm-usage"' in agent_text
    assert '"--single-process"' in agent_text
    assert '"--no-zygote"' in agent_text


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


def test_marketing_site_with_login_cta_but_no_auth_form_stays_marketing() -> None:
    crawl = {
        "title": "Cookiebot by Usercentrics",
        "text_snippet": "LOG IN Pricing Contact Sales Start free trial",
        "nav_links": [
            {"text": "Pricing", "href": "https://example.com/pricing"},
            {"text": "Contact", "href": "https://example.com/contact"},
            {"text": "Log in", "href": "https://example.com/login"},
        ],
        "buttons": ["Start free trial", "Contact sales"],
        "forms": [{"id": "search", "action": "/search", "fields": 1}],
        "page_html": "<form action='/search'><input type='search' /></form>",
    }

    context = discover_site(crawl, description="Marketing homepage with pricing and contact links")

    assert context["app_type"] == AppType.MARKETING.value


def test_stripe_like_marketing_site_is_not_misclassified_as_ecommerce() -> None:
    crawl = {
        "title": "Stripe payments infrastructure for the internet",
        "text_snippet": "Pricing plans enterprise contact sales trusted by millions of businesses",
        "nav_links": [
            {"text": "Pricing", "href": "https://example.com/pricing"},
            {"text": "Enterprise", "href": "https://example.com/enterprise"},
            {"text": "Docs", "href": "https://example.com/docs"},
        ],
        "buttons": ["Contact sales", "Start now"],
        "forms": [],
        "page_html": "<main><section><h1>Payments infrastructure</h1><a href='/pricing'>Pricing</a></section></main>",
    }

    context = discover_site(crawl, description="Payments infrastructure marketing site")

    assert context["app_type"] == AppType.MARKETING.value


def test_linear_like_marketing_site_is_not_misclassified_as_task_manager() -> None:
    crawl = {
        "title": "Linear",
        "text_snippet": "Features pricing changelog request demo get started roadmap for product teams",
        "nav_links": [
            {"text": "Features", "href": "https://example.com/features"},
            {"text": "Pricing", "href": "https://example.com/pricing"},
            {"text": "Changelog", "href": "https://example.com/changelog"},
        ],
        "buttons": ["Request demo", "Get started"],
        "forms": [],
        "page_html": "<main><section><h2>Changelog</h2><a href='/features'>Features</a></section></main>",
    }

    context = discover_site(crawl, description="Project management marketing site")

    assert context["app_type"] == AppType.MARKETING.value


def test_notion_like_marketing_site_is_not_misclassified_as_task_manager() -> None:
    crawl = {
        "title": "Notion",
        "text_snippet": "Get Notion free templates pricing enterprise docs workspace for every team",
        "nav_links": [
            {"text": "Pricing", "href": "https://example.com/pricing"},
            {"text": "Enterprise", "href": "https://example.com/enterprise"},
            {"text": "Docs", "href": "https://example.com/docs"},
        ],
        "buttons": ["Get Notion free", "Request a demo"],
        "forms": [],
        "page_html": "<main><section><h2>Templates</h2><a href='/pricing'>Pricing</a></section></main>",
    }

    context = discover_site(crawl, description="Workspace collaboration marketing site")

    assert context["app_type"] == AppType.MARKETING.value


def test_real_task_app_still_classifies_as_task_manager() -> None:
    crawl = {
        "title": "Todo App",
        "text_snippet": "todos add new task complete delete",
        "nav_links": [],
        "buttons": ["Create", "Delete"],
        "forms": [{"id": "todo-form", "action": "/todos", "fields": 1}],
        "page_html": """
            <main>
              <input class="new-todo" />
              <input type="checkbox" />
              <input type="checkbox" />
              <input type="checkbox" />
              <div contenteditable="true"></div>
              <li class="todo-item"></li>
              <li class="todo-item"></li>
              <li class="todo-item"></li>
            </main>
        """,
    }

    context = discover_site(crawl, description="Task management app")

    assert context["app_type"] == AppType.TASK_MANAGER.value


def test_todomvc_empty_state_classifies_as_task_manager() -> None:
    crawl = {
        "title": "TodoMVC: React",
        "text_snippet": "todos what needs to be done",
        "nav_links": [],
        "buttons": [],
        "forms": [],
        "page_html": "<main><input class='new-todo' placeholder='What needs to be done?' /></main>",
    }

    context = discover_site(crawl, description="Todo app with empty list state")

    assert context["app_type"] == AppType.TASK_MANAGER.value


def test_task_manager_with_items_still_classifies_correctly() -> None:
    crawl = {
        "title": "Todo App",
        "text_snippet": "todos buy milk walk dog",
        "nav_links": [],
        "buttons": ["Delete"],
        "forms": [],
        "page_html": "<main><input class='new-todo'/><input type='checkbox'/><input type='checkbox'/><input type='checkbox'/></main>",
    }

    context = discover_site(crawl, description="Task app with existing items")

    assert context["app_type"] == AppType.TASK_MANAGER.value


def test_add_remove_page_classifies_as_dom_mutation() -> None:
    crawl = {
        "title": "Add Remove Elements",
        "text_snippet": "Add Remove Elements",
        "nav_links": [],
        "buttons": ["Add Element", "Delete"],
        "forms": [],
        "page_html": "<main><button>Add Element</button><button>Delete</button></main>",
    }

    context = discover_site(crawl, description="Simple DOM mutation page")

    assert context["app_type"] == AppType.DOM_MUTATION.value


def test_dom_mutation_plan_uses_add_remove_steps() -> None:
    journeys = plan_journeys({"app_type": AppType.DOM_MUTATION.value})

    assert len(journeys) == 1
    assert journeys[0].name == "dom_mutation_basic"
    assert [step.goal for step in journeys[0].steps] == ["add_element", "remove_element"]


def test_commerce_with_hidden_auth_modal_classifies_as_ecommerce() -> None:
    crawl = {
        "title": "Advantage Shopping",
        "text_snippet": "shop products add to cart checkout",
        "nav_links": [{"text": "Shop", "href": "https://example.com/shop"}],
        "buttons": ["Add to cart"],
        "forms": [{"id": "loginModal", "action": "/login", "fields": 2}],
        "page_html": "<main><div class='product-card'></div><div class='product-card'></div><div class='product-card'></div><div class='product-card'></div><a href='/product/1'></a><a href='/product/2'></a><a href='/product/3'></a><input type='password' style='display:none'></main>",
    }

    context = discover_site(crawl, description="Shopping app with hidden login modal")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_visible_auth_form_still_classifies_as_saas_auth() -> None:
    crawl = {
        "title": "Login",
        "text_snippet": "login username password sign in",
        "nav_links": [],
        "buttons": ["Sign in"],
        "forms": [{"id": "login", "action": "/login", "fields": 2}],
        "page_html": "<form action='/login'><input type='text' name='username'><input type='password' name='password'></form>",
        "structural_signals": {"auth_form_is_visible": True},
    }

    context = discover_site(crawl, description="Visible auth form")

    assert context["app_type"] == AppType.SAAS_AUTH.value


def test_advantage_pattern_hidden_modal_does_not_trigger_saas_auth() -> None:
    crawl = {
        "title": "Advantage Shopping",
        "text_snippet": "shop products add to cart checkout login",
        "nav_links": [{"text": "Shop", "href": "https://example.com/shop"}],
        "buttons": ["Add to cart"],
        "forms": [{"id": "loginModal", "action": "/login", "fields": 2}],
        "page_html": "<main><div class='product-card'></div><div class='product-card'></div><div class='product-card'></div><div class='product-card'></div><a href='/product/1'></a><a href='/product/2'></a><a href='/product/3'></a><input type='password'></main>",
        "structural_signals": {"auth_form_is_visible": False},
    }

    context = discover_site(crawl, description="Shopping app with hidden auth modal")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_calibration_manifest_has_four_saas_targets_with_credentials() -> None:
    manifest_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "configs", "calibration_targets.json"))
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)

    saas_targets = manifest["groups"]["saas_auth"]
    assert len(saas_targets) == 4
    assert all(target.get("credentials", {}).get("password") for target in saas_targets)


def test_calibration_manifest_skips_blocked_ecommerce_targets_and_adds_replacements() -> None:
    manifest_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "configs", "calibration_targets.json"))
    with open(manifest_path, encoding="utf-8") as fh:
        manifest = json.load(fh)

    ecommerce_targets = manifest["groups"]["ecommerce"]
    skipped = [target for target in ecommerce_targets if target.get("skip_reason")]
    names = [target["name"] for target in ecommerce_targets]

    assert {target["name"] for target in skipped} == {"OpenCart Demo", "Magento Demo"}
    assert "Demoblaze" in names
    assert "Fake Store API Products" not in names


def test_login_page_classifies_as_saas_auth_not_generic() -> None:
    crawl = {
        "title": "Login",
        "text_snippet": "login username password",
        "nav_links": [],
        "buttons": ["Login"],
        "forms": [{"id": "login", "action": "/login", "fields": 2}],
        "page_html": "<form action='/login'><input type='text' name='username'><input type='password' name='password'></form>",
    }

    context = discover_site(crawl, description="Simple auth page")

    assert context["app_type"] == AppType.SAAS_AUTH.value


def test_login_page_outranks_marketing_when_password_field_exists() -> None:
    crawl = {
        "title": "Get started and sign in",
        "text_snippet": "get started pricing login password sign in",
        "nav_links": [{"text": "Pricing", "href": "https://example.com/pricing"}],
        "buttons": ["Get started", "Sign in"],
        "forms": [{"id": "login", "action": "/signin", "fields": 2}],
        "page_html": "<form action='/signin'><input type='email'><input type='password'></form>",
    }

    context = discover_site(crawl, description="Hybrid page with real auth form")

    assert context["app_type"] == AppType.SAAS_AUTH.value


def test_password_field_candidate_is_prioritized_for_login_step() -> None:
    step = _login_step()
    password_candidate = step.action_candidates[1]

    assert password_candidate.selectors[0] == "input[data-test='password']"


def test_saucedemo_data_test_selectors_are_prioritized_for_login_step() -> None:
    step = _login_step()
    username_candidate = step.action_candidates[0]
    password_candidate = step.action_candidates[1]
    submit_candidate = step.action_candidates[2]

    assert username_candidate.selectors[0] == "input[data-test='username']"
    assert password_candidate.selectors[0] == "input[data-test='password']"
    assert submit_candidate.selectors[0] == "input[data-test='login-button']"
    assert submit_candidate.selectors.index("input[type='submit']") < submit_candidate.selectors.index("button[type='submit']")


def test_login_input_submit_before_button_submit() -> None:
    candidates = _login_step().action_candidates[2].selectors

    assert candidates.index("input[type='submit']") < candidates.index("button[type='submit']")


def test_orangehrm_dashboard_index_matches_auth_success_signals() -> None:
    step = _login_step()
    matching_signals = [
        signal for signal in step.success_signals
        if signal.type == "url_matches" and re.search(str(signal.value), "/dashboard/index")
    ]

    assert matching_signals


def test_applitools_app_html_matches_auth_success_signals() -> None:
    step = _login_step()
    matching_signals = [
        signal for signal in step.success_signals
        if signal.type == "url_matches" and re.search(str(signal.value), "/app.html")
    ]

    assert matching_signals


def test_saas_auth_plan_is_login_only() -> None:
    journeys = plan_journeys({"app_type": AppType.SAAS_AUTH.value})

    assert len(journeys) == 1
    assert [step.goal for step in journeys[0].steps] == ["login"]


def test_saucedemo_login_first_commerce_routes_to_ecommerce() -> None:
    crawl = {
        "title": "Swag Labs",
        "text_snippet": "Swag Labs store inventory login username password cart",
        "nav_links": [],
        "buttons": ["Login"],
        "forms": [{"id": "login", "action": "/login", "fields": 2}],
        "page_html": "<form action='/login'><input type='text' name='user-name'><input type='password' name='password'></form>",
        "structural_signals": {"auth_form_is_visible": True},
    }

    context = discover_site(crawl, description="Demo ecommerce store with auth and checkout")

    assert context["app_type"] == AppType.ECOMMERCE.value
    assert context["requires_auth_first"] is True


def test_auth_first_ecommerce_plan_prepends_login_step() -> None:
    journeys = plan_journeys({"app_type": AppType.ECOMMERCE.value, "requires_auth_first": True})

    assert len(journeys) == 2
    assert [journey.name for journey in journeys] == ["auth_first_direct_add_to_cart", "auth_first_detail_then_cart"]
    assert [step.goal for step in journeys[0].steps] == ["login", "add_to_cart"]
    assert [step.goal for step in journeys[1].steps] == ["login", "open_product", "add_to_cart_from_detail"]


def test_magento_catalog_routes_to_ecommerce() -> None:
    crawl = {
        "title": "Magento Store",
        "text_snippet": "shop products gear bags fitness add to cart checkout",
        "nav_links": [{"text": "Shop", "href": "https://example.com/catalog"}],
        "buttons": ["Add to Cart"],
        "forms": [],
        "page_html": """
            <main class='products-grid'>
              <div class='product-item'></div>
              <div class='product-item-info'></div>
              <a class='product-item-link' href='/catalog/product/view/id/1'></a>
              <a class='product-item-photo' href='/catalog/product/view/id/2'></a>
              <button class='action tocart'>Add to Cart</button>
            </main>
        """,
    }

    context = discover_site(crawl, description="Magento demo store with product catalog and checkout")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_advantage_category_tiles_route_to_ecommerce() -> None:
    crawl = {
        "title": "Advantage Online Shopping",
        "text_snippet": "tablets laptops speakers popular items view details checkout",
        "nav_links": [{"text": "Products", "href": "https://example.com/#/category"}],
        "buttons": ["ADD TO CART"],
        "forms": [{"id": "loginModal", "action": "/login", "fields": 2}],
        "page_html": """
            <main>
              <div class='categoryCell'></div>
              <div class='categoryCell'></div>
              <div class='productName'></div>
              <a href='#/product/3'>View Details</a>
              <a class='shop_now' href='#/category/1'></a>
              <input type='password' />
            </main>
        """,
        "structural_signals": {"auth_form_is_visible": False},
    }

    context = discover_site(crawl, description="Electronics store with category tiles product catalog and cart")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_automation_exercise_commerce_beats_marketing() -> None:
    crawl = {
        "title": "Automation Exercise",
        "text_snippet": "shop products features contact add to cart cart checkout",
        "nav_links": [
            {"text": "Features", "href": "https://example.com/features"},
            {"text": "Contact", "href": "https://example.com/contact"},
            {"text": "Products", "href": "https://example.com/products"},
        ],
        "buttons": ["Add to cart", "Contact us"],
        "forms": [],
        "page_html": """
            <main>
              <div class='product-card'></div>
              <div class='product-card'></div>
              <div class='product-card'></div>
              <div class='product-card'></div>
              <a href='/product/1'>View Product</a>
              <a href='/product/2'>View Product</a>
              <a href='/product/3'>View Product</a>
            </main>
        """,
    }

    context = discover_site(crawl, description="Ecommerce demo site with overlays and cart flow")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_discovery_timeout_falls_back_to_description_classification() -> None:
    crawl = {
        "title": "",
        "text_snippet": "",
        "nav_links": [],
        "buttons": [],
        "forms": [],
        "page_html": "",
        "classification_note": "discovery_timeout",
    }

    context = discover_site(crawl, description="OpenCart demo store with product catalog and checkout")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_advantage_after_hydration_classifies_as_ecommerce() -> None:
    crawl = {
        "title": "Advantage Shopping",
        "text_snippet": "tablets laptops speakers popular items view details shopping cart",
        "nav_links": [{"text": "ShoppingCart", "href": "https://example.com/#/shoppingCart"}],
        "buttons": ["Shop Now", "View Details"],
        "forms": [{"id": "loginModal", "action": "/login", "fields": 2}],
        "page_html": """
            <main>
              <div class='categoryCell'></div>
              <div class='categoryCell'></div>
              <div class='categoryCell'></div>
              <div class='categoryCell'></div>
              <div class='productName'></div>
              <div class='productName'></div>
              <a href='#/product/1'>View Details</a>
              <a href='#/product/2'>View Details</a>
              <a href='#/shoppingCart'>Cart</a>
              <input type='password' />
            </main>
        """,
        "structural_signals": {"auth_form_is_visible": False},
    }

    context = discover_site(crawl, description="Electronics store with category tiles product catalog and cart")

    assert context["app_type"] == AppType.ECOMMERCE.value


def test_hydration_wait_changes_do_not_break_auth_classification() -> None:
    crawl = {
        "title": "Login",
        "text_snippet": "login username password",
        "nav_links": [],
        "buttons": ["Login"],
        "forms": [{"id": "login", "action": "/login", "fields": 2}],
        "page_html": "<form action='/login'><input type='text' name='username'><input type='password' name='password'></form>",
        "structural_signals": {"auth_form_is_visible": True},
    }

    context = discover_site(crawl, description="Simple auth page")

    assert context["app_type"] == AppType.SAAS_AUTH.value


def test_detail_first_journey_exists_in_ecommerce_template() -> None:
    journeys = plan_journeys({"app_type": AppType.ECOMMERCE.value})

    assert [journey.name for journey in journeys] == ["direct_add_to_cart", "detail_then_cart"]


def test_open_product_has_advantage_and_demoblaze_candidates() -> None:
    selectors = _open_product_step().action_candidates[1].selectors

    assert any("product/" in selector for selector in selectors)
    assert any("card-title" in selector for selector in selectors)


def test_detail_then_cart_success_signals_cover_cart_confirmation() -> None:
    journeys = plan_journeys({"app_type": AppType.ECOMMERCE.value})
    detail_step = journeys[1].steps[1]
    signal_values = [
        str(signal.value).lower()
        for signal in detail_step.success_signals
        if signal.type in {"text_present", "element_visible", "url_contains"}
    ]

    assert any("cart" in value for value in signal_values)
