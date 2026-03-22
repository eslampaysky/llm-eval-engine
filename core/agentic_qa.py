"""
agentic_qa.py — Tier-aware orchestrator for AiBreaker agentic QA.

Ties together the Playwright crawler and Gemini visual judge with three
service tiers:

  vibe  — Visual scan, desktop + mobile screenshots, top 3 bugs, ~30s
  deep  — Full crawl + user journeys + video replay + all findings, ~60-90s
  fix   — Deep Dive + Groq/Llama code analysis + bundled fix prompt, ~90-120s
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field, asdict
from typing import Any, Callable

from core.models import AppType, JourneyPlan, JourneyStep, SuccessSignal, ActionCandidate, StepType, to_dict
from core.report_builder import build_fix_prompt_context, build_journey_timeline, infer_spec
from core.web_agent import AuditCanceledError, run_structured_journeys, run_web_audit
from core.gemini_judge import judge_visual

_log = logging.getLogger(__name__)


class AuditTimeoutError(RuntimeError):
    """Raised when an audit exceeds its tier-wide execution budget."""


# ── Data models ───────────────────────────────────────────────────────────────

@dataclass
class Finding:
    severity: str           # critical | high | medium | low
    category: str           # layout | functionality | accessibility | performance | content
    title: str
    description: str
    fix_prompt: str
    confidence: int | None = None


@dataclass
class AgenticQAResult:
    url: str
    tier: str
    score: int | None           # 0-100, None when no AI analysis available
    confidence: int | None      # 0-100, None when using fallback only
    findings: list[Finding] = field(default_factory=list)
    summary: str = ""
    bundled_fix_prompt: str | None = None
    video_path: str | None = None
    desktop_screenshot_b64: str | None = None
    mobile_screenshot_b64: str | None = None
    journey_results: list[dict] | None = None
    journey_timeline: list[dict] | None = None
    step_results: list[dict] | None = None
    error: str | None = None
    analysis_limited: bool = False      # True when AI analysis was unavailable
    user_key_exhausted: bool = False     # True when user's own API key hit quota


# ── Score computation ─────────────────────────────────────────────────────────

_SEVERITY_DEDUCTIONS = {
    "critical": 20,
    "high": 12,
    "medium": 6,
    "low": 2,
}


def compute_score(findings: list[Finding]) -> int:
    """Compute a 0-100 reliability score from findings."""
    score = 100
    for f in findings:
        deduction = _SEVERITY_DEDUCTIONS.get(f.severity, 5)
        score -= deduction
    return max(0, min(100, score))


# ── Bundled fix prompt ────────────────────────────────────────────────────────

def build_bundled_fix_prompt(findings: list[Finding], url: str) -> str:
    """
    Concatenate all individual fix prompts into a single numbered instruction
    that a non-technical founder can paste into their AI builder.
    """
    if not findings:
        return ""

    lines = [
        f"I ran a reliability audit on {url} and found the following issues.",
        "Please fix all of them:\n",
    ]
    for i, f in enumerate(findings, 1):
        lines.append(f"{i}. [{f.severity.upper()}] {f.title}")
        if f.fix_prompt:
            lines.append(f"   Fix: {f.fix_prompt}")
        lines.append("")

    lines.append(
        "After fixing all issues, make sure the site works correctly on both "
        "desktop (1280px) and mobile (390px) viewports."
    )
    return "\n".join(lines)


MARKETING_SIGNALS = (
    "/pricing",
    "/features",
    "/about",
    "/contact",
    "/blog",
    "/docs",
    "/solutions",
    "/enterprise",
    "get started",
    "start free trial",
    "request demo",
    "see pricing",
    "contact sales",
    "learn more",
    "trusted by",
    "customers",
    "integrations",
    "case studies",
    "testimonials",
)


def _nav_texts(crawl: dict[str, Any]) -> list[str]:
    return [
        str(item.get("text") or "").strip().lower()
        for item in (crawl.get("nav_links") or [])
        if isinstance(item, dict) and str(item.get("text") or "").strip()
    ]


def _combined_text(crawl: dict[str, Any], description: str | None = None) -> str:
    nav_links = crawl.get("nav_links") or []
    nav_texts = _nav_texts(crawl)
    nav_hrefs = " ".join(
        str(item.get("href") or "").lower()
        for item in nav_links
        if isinstance(item, dict)
    )
    return " ".join(
        [
            crawl.get("title") or "",
            crawl.get("text_snippet") or "",
            " ".join(nav_texts),
            nav_hrefs,
            " ".join(crawl.get("buttons") or []),
            description or "",
        ]
    ).lower()


def _page_html(crawl: dict[str, Any]) -> str:
    return str(crawl.get("page_html") or "").lower()


def _structural_counts(crawl: dict[str, Any]) -> dict[str, int]:
    html = _page_html(crawl)
    text = _combined_text(crawl)
    nav_texts = _nav_texts(crawl)
    buttons = " ".join(str(button).lower() for button in (crawl.get("buttons") or []))
    crawl_signals = crawl.get("structural_signals") or {}

    product_item_count = sum(
        html.count(token)
        for token in (
            'class="product',
            "class='product",
            "product-card",
            "data-product-id",
            "item-card",
            "categorycell",
            "shop_now",
            "popularitem",
            "product-item",
            "product-item-info",
            "product-item-link",
            "product-item-photo",
            "products-grid",
            "product-list",
            "productname",
            "product_name",
            "view details",
        )
    )
    product_detail_links = sum(
        html.count(token)
        for token in (
            "/product/",
            "#/product/",
            "/item/",
            "/shop/",
            "product-card",
            "view details",
            "product-item-link",
            "product-item-photo",
            "href=\"catalog",
            "href='catalog",
            "href=\"category",
            "href='category",
            "categorycell",
            "shop_now",
        )
    )
    rendered_list_item_count = sum(
        html.count(token)
        for token in ('class="task', "class='task", "todo-item", "data-task-id", "role=\"checkbox\"", "role='checkbox'", "type=\"checkbox\"", "type='checkbox'")
    )

    counts = {
        "has_add_to_cart_button": int(any(token in text for token in ("add to cart", "buy now", "add to bag", "add to cart", "add to bag", "add to basket"))),
        "has_product_detail_links": int(product_detail_links > 2),
        "product_item_count": product_item_count,
        "has_checkboxes": int(any(token in html for token in ('type="checkbox"', "type='checkbox'", "role=\"checkbox\"", "role='checkbox'", "todo-checkbox"))),
        "has_draggable_list_items": int(any(token in html for token in ('draggable="true"', "sortable-item", "data-drag-handle"))),
        "rendered_list_item_count": rendered_list_item_count,
        "has_inline_edit_interaction": int(any(token in html for token in ('contenteditable="true"', "editable-field", "inline-edit"))),
        "has_marketing_nav": int(any(token in nav_texts for token in ("pricing", "features", "product", "contact", "about", "resources", "enterprise"))),
        "has_todo_create_input": int(any(token in html for token in ("input.new-todo", "class='new-todo'", "class=\"new-todo\"", "placeholder=\"what needs", "placeholder='what needs"))),
        "placeholder_contains_todo": int(any(token in html for token in ("placeholder=\"todo", "placeholder='todo"))),
        "placeholder_contains_add_task": int(any(token in html for token in ("placeholder=\"add task", "placeholder='add task", "placeholder=\"new task", "placeholder='new task"))),
        "has_add_button": int(any(token in buttons for token in ("add element", "add", "create"))),
        "has_delete_or_remove_button": int(any(token in buttons for token in ("delete", "remove"))),
        "auth_form_is_visible": int(
            any(token in text for token in ("password", "sign in", "log in", "login", "username"))
            and ('type="password"' in html or "password" in text)
        ),
    }
    if "auth_form_is_visible" in crawl_signals:
        counts["auth_form_is_visible"] = int(bool(crawl_signals["auth_form_is_visible"]))
    return counts


def _has_auth_form(crawl: dict[str, Any], text: str) -> bool:
    page_html = str(crawl.get("page_html") or "").lower()
    forms = crawl.get("forms") or []
    form_actions = " ".join(
        str(item.get("action") or "").lower()
        for item in forms
        if isinstance(item, dict)
    )
    auth_keywords = ("login", "log in", "sign in", "password", "forgot password")
    has_password_field = 'type="password"' in page_html or "password" in text
    has_auth_action = any(keyword in form_actions for keyword in ("login", "signin", "sign-in", "auth"))
    has_auth_form_fields = bool(forms) and has_password_field
    has_auth_text = any(keyword in text for keyword in auth_keywords)
    return has_password_field or has_auth_action or (has_auth_text and has_auth_form_fields)


def _has_product_catalog(text: str) -> bool:
    return any(
        token in text
        for token in (
            "products",
            "shop",
            "collections",
            "buy now",
            "catalog",
            "store",
            "categories",
            "featured",
            "popular items",
            "view details",
        )
    )


def _has_cart_or_checkout(text: str) -> bool:
    return any(token in text for token in ("cart", "checkout", "add to cart", "basket"))


def _has_task_list_patterns(text: str) -> bool:
    return any(token in text for token in ("task", "board", "todo", "kanban", "project", "roadmap", "changelog"))


def _has_create_edit_delete(crawl: dict[str, Any], text: str) -> bool:
    page_html = str(crawl.get("page_html") or "").lower()
    buttons = " ".join(str(button).lower() for button in (crawl.get("buttons") or []))
    interactive_text = " ".join([text, buttons, page_html])
    return any(
        token in interactive_text
        for token in ("create", "add item", "new task", "edit", "delete", "remove", "new-todo", "input.new-todo")
    )


def _has_marketing_signals(text: str, nav_texts: list[str], has_real_cart: bool, has_real_crud: bool, structural: dict[str, int]) -> bool:
    positive = (
        any(signal in text for signal in MARKETING_SIGNALS)
        or any(token in nav_texts for token in ("pricing", "features", "product", "contact", "about", "resources"))
        or bool(structural.get("has_marketing_nav"))
    )
    has_real_catalog = bool(structural.get("has_add_to_cart_button")) or structural.get("product_item_count", 0) > 3
    return positive and not has_real_cart and not has_real_catalog and not has_real_crud


def _has_dom_mutation_patterns(structural: dict[str, int], has_task_patterns: bool, has_catalog: bool) -> bool:
    return bool(
        structural.get("has_add_button")
        and not has_task_patterns
        and not has_catalog
    )


def _has_login_first_commerce(text: str, has_visible_auth_form: bool) -> bool:
    commerce_intent = any(
        signal in text
        for signal in (
            "store",
            "shop",
            "products",
            "inventory",
            "swag",
            "cart",
            "checkout",
            "items",
            "ecommerce",
        )
    )
    return has_visible_auth_form and commerce_intent


def _detect_pre_journey_blocker(crawl: dict[str, Any]) -> dict[str, str] | None:
    title = str(crawl.get("title") or "").strip().lower()
    text = _combined_text(crawl)

    if any(
        token in text
        for token in (
            "access is temporarily restricted",
            "we detected unusual activity from your device or network",
            "temporarily restricted",
            "unusual activity from your device or network",
            "press & hold",
            "confirm you are a human",
            "before we continue",
        )
    ):
        return {
            "failure_type": "blocked_by_bot_protection",
            "summary": "Site access is temporarily restricted by bot protection.",
            "error": "Access temporarily restricted by bot protection",
        }

    if any(token in text for token in ("a shop is on its way", "explore back office")):
        return {
            "failure_type": "site_unavailable",
            "summary": "The site is currently showing a demo splash page, so user journeys could not run.",
            "error": "Site is currently showing a demo splash page",
        }

    if title == "application error" or (
        "application error" in text and not any(token in text for token in ("cart", "checkout", "login", "product"))
    ):
        return {
            "failure_type": "site_unavailable",
            "summary": "The site is currently returning an application error page, so user journeys could not run.",
            "error": "Site is currently unavailable",
        }

    return None


def discover_site(crawl: dict, description: str | None = None) -> dict[str, Any]:
    nav_texts = _nav_texts(crawl)
    text = _combined_text(crawl, description)
    structural = _structural_counts(crawl)

    app_type = AppType.GENERIC.value
    features: list[str] = []
    primary_goal = "explore site"

    has_description_fallback_catalog = (
        str(crawl.get("classification_note") or "").lower() == "discovery_timeout"
        and any(token in text for token in ("store", "shop", "catalog", "product catalog", "checkout", "cart"))
    )
    has_catalog = (
        _has_product_catalog(text)
        and (
            structural["has_product_detail_links"]
            or structural["product_item_count"] > 3
            or structural["has_add_to_cart_button"]
        )
    ) or has_description_fallback_catalog
    has_cart_or_checkout = _has_cart_or_checkout(text) or bool(structural["has_add_to_cart_button"])
    has_task_patterns = _has_task_list_patterns(text) and (
        structural["has_checkboxes"]
        or structural["has_draggable_list_items"]
        or structural["rendered_list_item_count"] > 2
    )
    has_empty_state_task_affordance = bool(
        structural["has_todo_create_input"]
        or structural["placeholder_contains_todo"]
        or structural["placeholder_contains_add_task"]
    )
    if has_empty_state_task_affordance:
        has_task_patterns = True
    has_crud_interactions = _has_create_edit_delete(crawl, text) and (
        structural["has_checkboxes"]
        or structural["has_inline_edit_interaction"]
        or structural["rendered_list_item_count"] > 2
    )
    if has_empty_state_task_affordance:
        has_crud_interactions = True
    has_login_form = _has_auth_form(crawl, text)
    has_visible_auth_form = has_login_form and bool(structural["auth_form_is_visible"])
    has_login_first_commerce = _has_login_first_commerce(text, has_visible_auth_form)
    has_real_cart = has_catalog and has_cart_or_checkout
    has_real_crud = has_task_patterns and has_crud_interactions
    has_dom_mutation = _has_dom_mutation_patterns(structural, has_task_patterns, has_catalog)
    has_marketing_signals = _has_marketing_signals(text, nav_texts, has_real_cart, has_real_crud, structural)

    if has_real_cart:
        app_type = AppType.ECOMMERCE.value
        features = ["login", "search", "cart", "checkout"]
        primary_goal = "purchase item"
    elif has_login_first_commerce or has_catalog:
        app_type = AppType.ECOMMERCE.value
        features = ["login", "search", "cart", "checkout"] if has_login_first_commerce else ["search", "cart", "checkout"]
        primary_goal = "purchase item"
    elif has_real_crud:
        app_type = AppType.TASK_MANAGER.value
        features = ["create", "edit", "delete"]
        primary_goal = "manage records"
    elif has_dom_mutation:
        app_type = AppType.DOM_MUTATION.value
        features = ["add", "remove"]
        primary_goal = "mutate DOM elements"
    elif has_visible_auth_form:
        app_type = AppType.SAAS_AUTH.value
        features = ["login", "dashboard", "navigation"]
        primary_goal = "reach dashboard"
    elif has_marketing_signals:
        app_type = AppType.MARKETING.value
        features = ["pricing", "features", "contact"]
        primary_goal = "explore marketing paths"

    inferred = {
        "app_type": app_type,
        "features": features,
        "primary_goal": primary_goal,
        "site_description": description,
        "requires_auth_first": has_login_first_commerce,
    }

    # Description-based boost - user hint overrides structural classifier
    # when structural signals are weak (generic fallback)
    if description:
        desc_lower = description.lower()
        if any(t in desc_lower for t in (
            "shop", "store", "cart", "checkout", "buy",
            "ecommerce", "e-commerce", "product catalog"
        )):
            if inferred.get("app_type") == AppType.GENERIC.value:
                inferred["app_type"] = AppType.ECOMMERCE.value
                inferred["features"] = ["search", "cart", "checkout"]
                inferred["primary_goal"] = "purchase item"
        elif (
            any(t in desc_lower for t in ("login", "sign in", "dashboard", "saas"))
            or (
                any(t in desc_lower for t in ("workspace", "app", "platform"))
                and not any(t in desc_lower for t in ("marketing", "pricing", "landing page", "product page"))
            )
        ):
            if inferred.get("app_type") in (
                AppType.GENERIC.value, AppType.MARKETING.value
            ):
                inferred["app_type"] = AppType.SAAS_AUTH.value
                inferred["features"] = ["login", "dashboard", "navigation"]
                inferred["primary_goal"] = "reach dashboard"
        elif any(t in desc_lower for t in (
            "marketing", "pricing", "landing page", "product page"
        )):
            if inferred.get("app_type") == AppType.GENERIC.value:
                inferred["app_type"] = AppType.MARKETING.value
                inferred["features"] = ["pricing", "features", "contact"]
                inferred["primary_goal"] = "explore marketing paths"
        if (
            inferred.get("app_type") == AppType.ECOMMERCE.value
            and not has_cart_or_checkout
            and not structural.get("has_add_to_cart_button")
            and any(t in desc_lower for t in ("waitlist", "contact sales", "marketing", "landing page", "email client"))
        ):
            inferred["app_type"] = AppType.MARKETING.value
            inferred["features"] = ["pricing", "features", "contact"]
            inferred["primary_goal"] = "explore marketing paths"

    anthropic_key = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
    if anthropic_key:
        try:
            inferred_spec = infer_spec(crawl)
            if inferred_spec.get("product_type"):
                inferred["app_type"] = str(inferred_spec["product_type"]).lower()
            if inferred_spec.get("critical_journeys"):
                inferred["critical_journeys"] = inferred_spec["critical_journeys"]
        except Exception:
            pass

    return inferred


def _login_step() -> JourneyStep:
    return JourneyStep(
        goal="login",
        intent="login or sign in",
        action_candidates=[
            ActionCandidate(
                type="fill",
                intent="username or email field",
                selectors=[
                    "input[data-test='username']",
                    "input[data-test='user-name']",
                    "input[name='username']",
                    "input[name='login']",
                    "input[name='user']",
                    "input[id='username']",
                    "input[name*='user' i]",
                    "input[id*='user' i]",
                    "input[name='email']",
                    "input[id='email']",
                    "input[name*='email' i]",
                    "input[id*='email' i]",
                    "input[placeholder*='username' i]",
                    "input[placeholder*='email' i]",
                    "input[placeholder*='user' i]",
                    "input[placeholder*='login' i]",
                    "input[aria-label*='username' i]",
                    "input[aria-label*='email' i]",
                    "input[id*='email' i]",
                    "input[id*='user' i]",
                    "input[type='email']",
                    "form input:not([type='password']):not([type='hidden'])",
                    "input[type='text']",
                ],
                role="textbox",
                name="Username",
                value="state.generated_credentials.username",
            ),
            ActionCandidate(
                type="fill",
                intent="password field",
                selectors=[
                    "input[data-test='password']",
                    "input[type='password']",
                    "input[name='password']",
                    "input[name='pass']",
                    "input[id='password']",
                    "input[name*='pass' i]",
                    "input[placeholder*='password' i]",
                    "input[aria-label*='password' i]",
                    "input[id*='pass' i]",
                ],
                role="textbox",
                name="Password",
                value="state.generated_credentials.password",
            ),
            ActionCandidate(
                type="click",
                intent="login button",
                selectors=[
                    "input[data-test='login-button']",
                    "*[data-test*='login']",
                    "#login-button",
                    "input[type='submit']",
                    "input[type='submit'][value='Login']",
                    "input[value='Login']",
                    "input[value='Sign in']",
                    "button[type='submit']",
                    "button:has-text('Login')",
                    "button:has-text('Log in')",
                    "button:has-text('Sign in')",
                    "button:has-text('Submit')",
                ],
                role="button",
                name="Login",
                text="Login",
            ),
            ActionCandidate(
                type="click",
                intent="sign in button",
                selectors=[
                    "input[type='submit']",
                    "#login-button",
                    "button:has-text('Sign in')",
                    "button:has-text('Log in')",
                    "button:has-text('Login')",
                ],
                role="button",
                name="Sign in",
                text="Sign in",
            ),
        ],
        input_bindings={
            "Username": "state.generated_credentials.username",
            "Password": "state.generated_credentials.password",
        },
        success_signals=[
            SuccessSignal(type="url_contains", value="/dashboard", priority="high", required=True),
            SuccessSignal(type="url_contains", value="/account", priority="high", required=True),
            SuccessSignal(type="url_contains", value="/home", priority="high", required=True),
            SuccessSignal(type="url_contains", value="/app", priority="high", required=True),
            SuccessSignal(type="url_contains", value="/secure", priority="high", required=True),
            SuccessSignal(type="url_contains", value="/workspace", priority="high", required=True),
            SuccessSignal(type="url_contains", value="/portal", priority="high", required=True),
            SuccessSignal(type="url_contains", value="inventory.html", priority="high", required=True),
            SuccessSignal(type="url_matches", value=r"/app\.html", priority="high", required=True),
            SuccessSignal(type="url_matches", value=r"/index", priority="high", required=True),
            SuccessSignal(type="element_visible", value="Logout", priority="medium", required=False),
            SuccessSignal(type="element_visible", value="Log out", priority="medium", required=False),
            SuccessSignal(type="element_visible", value="Sign out", priority="medium", required=False),
            SuccessSignal(type="text_present", value="Welcome", priority="medium", required=False),
            SuccessSignal(type="text_present", value="Dashboard", priority="medium", required=False),
            SuccessSignal(type="text_present", value="logged in", priority="medium", required=False),
            SuccessSignal(type="llm_fallback", value="Did login succeed based on this page?", priority="low", required=False),
        ],
        failure_hints=["Invalid credentials", "Incorrect password", "url still contains /login"],
        expected_state_change={"is_logged_in": True},
        allow_soft_recovery=True,
    )


def _cart_step() -> JourneyStep:
    return JourneyStep(
        goal="add_to_cart",
        intent="add to cart button on listing page",
        action_candidates=[
            ActionCandidate(
                type="click",
                intent="add to cart button",
                selectors=[
                    "[data-test*='add-to-cart']",
                    "[data-testid*='add-to-cart']",
                    "[data-cy*='add-to-cart']",
                    "button:has-text('Add to cart')",
                    "button:has-text('ADD TO CART')",
                    "button:has-text('Add To Cart')",
                    "button:has-text('Add to Cart')",
                    "button:has-text('Add to bag')",
                    "button:has-text('Add to Bag')",
                    "button:has-text('Add to basket')",
                    "button:has-text('Add to Basket')",
                    "button:has-text('ADD TO BASKET')",
                    "a:has-text('Add to cart')",
                    "a:has-text('Add to Cart')",
                    "a:has-text('ADD TO BASKET')",
                    "button[class*='add-to-cart']",
                    "button[class*='addtocart']",
                    "button[class*='add_to_cart']",
                    "button[class*='atc']",
                    "button[class*='btn-cart']",
                    "a[class*='add_to_cart_button']",
                    "button[name='add-to-cart']",
                    "input[name='add-to-cart']",
                    "input[name='submit.add-to-cart']",
                    "input[id='add-to-cart-button']",
                    "#add-to-cart-button",
                    ".btn-cart",
                    "button[id*='add-to-cart']",
                    "button[id*='addtocart']",
                    "[data-action*='cart']",
                    "[onclick*='addToCart']",
                    "[onclick*='add_to_cart']",
                    "form[action*='cart'] button[type='submit']",
                    "form[action*='cart'] input[type='submit']",
                ],
                role="button",
                name="Add to cart",
                text="Add to cart",
            ),
            ActionCandidate(
                type="click",
                intent="buy now",
                selectors=[
                    "button:has-text('Buy now')",
                    "button:has-text('Buy Now')",
                    "button:has-text('BUY NOW')",
                    "a:has-text('Buy now')",
                    "a:has-text('Buy Now')",
                    "[data-test*='buy-now']",
                    "button[class*='buy-now']",
                    "button:has-text('ADD TO BASKET')",
                    "a:has-text('ADD TO BASKET')",
                ],
                role="button",
                name="Buy now",
                text="Buy now",
            ),
            ActionCandidate(
                type="click",
                intent="shop now or first product",
                selectors=[
                    "a:has-text('Shop now')",
                    "a:has-text('Shop Now')",
                    "button:has-text('Shop now')",
                    ".product-item a:first-of-type",
                    ".product-card a:first-of-type",
                    "a[href*='/product/']:first-of-type",
                ],
                role="link",
                name="Shop now",
                text="Shop now",
            ),
        ],
        success_signals=[
            SuccessSignal(type="text_present", value="cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="1", priority="medium", required=False),
            SuccessSignal(type="url_contains", value="cart", priority="high", required=False),
            SuccessSignal(type="element_visible", value="Cart", priority="medium", required=False),
            SuccessSignal(type="state_assertion", value={"cart_has_items": True}, priority="medium", required=False),
        ],
        failure_hints=["Cart count did not change", "Item not added"],
        expected_state_change={"cart_has_items": True},
        allow_soft_recovery=True,
    )


def _open_product_step() -> JourneyStep:
    return JourneyStep(
        goal="open_product",
        intent="product detail link or view details button",
        step_type=StepType.CLICK.value,
        action_candidates=[
            ActionCandidate(type="click", intent="view details link", selectors=["a:has-text('View Details')", "a:has-text('View Product')", "a:has-text('See Details')", "a:has-text('More Info')"], role="link", name="View Details", text="View Details"),
            ActionCandidate(type="click", intent="product item link", selectors=["a[href*='prod.html']", "a[href*='product']", "a[href*='item']", "a[href*='/dp/']", ".card-title a", ".product-item-link", ".product-name a", ".product-title a", "h2 a", "h3 a", ".product-card a", ".product-item a"], role="link", name="Product", text="Product"),
            ActionCandidate(type="click", intent="shop now link", selectors=["a:has-text('Shop Now')", ".shop_now", "a:has-text('Explore')"], role="link", name="Shop Now", text="Shop Now"),
        ],
        success_signals=[
            SuccessSignal(type="url_contains", value="product", priority="high", required=True),
            SuccessSignal(type="url_contains", value="prod.html", priority="high", required=True),
            SuccessSignal(type="url_contains", value="item", priority="high", required=True),
            SuccessSignal(type="element_visible", value="Add to cart", priority="medium", required=True),
            SuccessSignal(type="text_present", value="description", priority="low", required=False),
        ],
        failure_hints=["product page did not load"],
        allow_soft_recovery=True,
    )


def _cart_from_detail_step() -> JourneyStep:
    return JourneyStep(
        goal="add_to_cart_from_detail",
        intent="add to cart button on product detail page",
        step_type=StepType.CLICK.value,
        action_candidates=[
            ActionCandidate(type="click", intent="add to cart button", selectors=["button:has-text('Add to cart')", "button:has-text('ADD TO CART')", "button:has-text('Add To Cart')", "button:has-text('ADD TO BASKET')", "a:has-text('Add to cart')", "a:has-text('ADD TO BASKET')", "[onclick*='addToCart']", "[onclick*='add_to_cart']", ".btn-cart", "a.btn-success", "a[class*='add_to_cart_button']", "input[name='submit.add-to-cart']", "input[id='add-to-cart-button']", "#add-to-cart-button"], role="button", name="Add to cart", text="Add to cart"),
        ],
        success_signals=[
            SuccessSignal(type="element_visible", value="Cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="added", priority="medium", required=False),
            SuccessSignal(type="text_present", value="Cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="View Basket", priority="medium", required=False),
            SuccessSignal(type="text_present", value="View Cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="items", priority="medium", required=False),
            SuccessSignal(type="url_contains", value="cart", priority="high", required=False),
            SuccessSignal(type="state_assertion", value={"cart_has_items": True}, priority="medium", required=False),
        ],
        failure_hints=["item not added", "cart unchanged"],
        expected_state_change={"cart_has_items": True},
        allow_soft_recovery=False,
    )


def _generic_explore_step() -> JourneyStep:
    return JourneyStep(
        goal="explore_main_content",
        intent="main navigation or primary CTA",
        action_candidates=[
            ActionCandidate(
                type="click",
                intent="get started CTA",
                selectors=[
                    "a:has-text('Get started')",
                    "button:has-text('Get started')",
                    "a:has-text('Start for free')",
                    "button:has-text('Start free')",
                    "a:has-text('Try free')",
                    "a:has-text('Try it free')",
                ],
                role="button", name="Get started", text="Get started",
            ),
            ActionCandidate(
                type="click",
                intent="sign up CTA",
                selectors=[
                    "a:has-text('Sign up')",
                    "button:has-text('Sign up')",
                    "a:has-text('Create account')",
                ],
                role="button", name="Sign up", text="Sign up",
            ),
            ActionCandidate(
                type="click",
                intent="learn more link",
                selectors=[
                    "a:has-text('Learn more')",
                    "a:has-text('See how')",
                    "a:has-text('See features')",
                ],
                role="link", name="Learn more", text="Learn more",
            ),
            ActionCandidate(
                type="click",
                intent="first nav link",
                selectors=[
                    "nav a:not([href='/']):not([href='#']):first-of-type",
                    "header a:not([href='/']):not([href='#']):first-of-type",
                ],
                role="link", name="Nav", text="",
            ),
        ],
        success_signals=[
            SuccessSignal(type="url_regex", value=r".+/.+", priority="high", required=False),
            SuccessSignal(type="text_present", value="welcome", priority="low", required=False),
            SuccessSignal(type="text_present", value="features", priority="low", required=False),
        ],
        failure_hints=["no navigation succeeded"],
        expected_state_change={},
        allow_soft_recovery=True,
    )


def _marketing_pricing_step() -> JourneyStep:
    return JourneyStep(
        goal="reach_pricing",
        intent="pricing page link",
        step_type=StepType.CLICK.value,
        action_candidates=[
            ActionCandidate(type="click", intent="pricing link", selectors=["a[href*='pricing']"], role="link", name="Pricing", text="Pricing"),
            ActionCandidate(type="click", intent="see pricing link", selectors=["a:has-text('See pricing')"], role="link", name="See pricing", text="See pricing"),
            ActionCandidate(type="click", intent="plans link", selectors=["a:has-text('Plans')"], role="link", name="Plans", text="Plans"),
        ],
        success_signals=[
            SuccessSignal(type="url_contains", value="pricing", priority="high"),
            SuccessSignal(type="text_present", value="pricing", priority="medium", required=False),
            SuccessSignal(type="text_present", value="plan", priority="medium", required=False),
        ],
        failure_hints=["pricing page not found", "link not reachable"],
        allow_soft_recovery=True,
    )


def _marketing_features_step() -> JourneyStep:
    return JourneyStep(
        goal="reach_features",
        intent="features or product page link",
        step_type=StepType.CLICK.value,
        action_candidates=[
            ActionCandidate(type="click", intent="features link", selectors=["a[href*='features']", "nav a:has-text('Features')"], role="link", name="Features", text="Features"),
            ActionCandidate(type="click", intent="product link", selectors=["a[href*='product']", "nav a:has-text('Product')"], role="link", name="Product", text="Product"),
        ],
        success_signals=[
            SuccessSignal(type="url_contains", value="feature", priority="high", required=False),
            SuccessSignal(type="url_contains", value="product", priority="high", required=False),
            SuccessSignal(type="text_present", value="feature", priority="medium", required=False),
        ],
        failure_hints=["features page not found"],
        allow_soft_recovery=True,
    )


def _marketing_contact_step() -> JourneyStep:
    return JourneyStep(
        goal="reach_contact_or_demo",
        intent="contact or request demo link",
        step_type=StepType.CLICK.value,
        action_candidates=[
            ActionCandidate(type="click", intent="contact link", selectors=["a[href*='contact']", "a:has-text('Contact')"], role="link", name="Contact", text="Contact"),
            ActionCandidate(type="click", intent="request demo link", selectors=["a[href*='demo']", "a:has-text('Request demo')", "a:has-text('Talk to sales')"], role="link", name="Request demo", text="Request demo"),
        ],
        success_signals=[
            SuccessSignal(type="url_contains", value="contact", priority="high", required=False),
            SuccessSignal(type="url_contains", value="demo", priority="high", required=False),
            SuccessSignal(type="text_present", value="contact", priority="medium", required=False),
            SuccessSignal(type="element_visible", value={"selector": "form"}, priority="medium", required=False),
        ],
        failure_hints=["contact page not found"],
        allow_soft_recovery=True,
    )


def _crud_steps() -> list[JourneyStep]:
    return [
        JourneyStep(
            goal="create_record",
            intent="new item input field",
            step_type=StepType.FILL_SUBMIT.value,
            action_candidates=[
                ActionCandidate(
                    type="fill",
                    intent="todo input field",
                    selectors=[
                        "input.new-todo",
                        "input[placeholder*='todo' i]",
                        "input[placeholder*='add' i]",
                        "input[type='text']",
                    ],
                    role="textbox",
                    name="What needs to be done?",
                    value="Buy milk",
                ),
                ActionCandidate(
                    type="submit",
                    intent="submit new item",
                    fallback_value="Enter",
                ),
            ],
            input_bindings={"value": "Buy milk"},
            success_signals=[
                SuccessSignal(type="text_present", value="Buy milk", priority="high"),
                SuccessSignal(type="text_present", value="1 item left", priority="medium", required=False),
            ],
            failure_hints=["input not found", "text did not appear"],
            expected_state_change={"record_created": True},
            allow_soft_recovery=False,
        )
    ]


def _dom_mutation_steps() -> list[JourneyStep]:
    return [
        JourneyStep(
            goal="add_element",
            intent="add or create button",
            step_type=StepType.CLICK.value,
            action_candidates=[
                ActionCandidate(type="click", intent="add element button", selectors=["button:has-text('Add Element')", "button:has-text('Add')", "button[id*='add' i]"], role="button", name="Add Element", text="Add Element"),
            ],
            success_signals=[
                SuccessSignal(type="element_visible", value="Delete", priority="high", required=False),
                SuccessSignal(type="element_visible", value="Remove", priority="high", required=False),
                SuccessSignal(type="text_present", value="Delete", priority="medium", required=False),
            ],
            failure_hints=["no new element appeared"],
            allow_soft_recovery=False,
        ),
        JourneyStep(
            goal="remove_element",
            intent="delete or remove button",
            step_type=StepType.CLICK.value,
            action_candidates=[
                ActionCandidate(type="click", intent="delete button", selectors=["button:has-text('Delete')", "button:has-text('Remove')", "button[id*='delete' i]", "button[id*='remove' i]"], role="button", name="Delete", text="Delete"),
            ],
            success_signals=[
                SuccessSignal(type="text_absent", value="Delete", priority="high", required=False),
                SuccessSignal(type="element_visible", value="Add Element", priority="medium", required=False),
            ],
            failure_hints=["element still present after delete"],
            allow_soft_recovery=False,
        ),
    ]


def plan_journeys(context: dict[str, Any]) -> list[JourneyPlan]:
    app_type = str(context.get("app_type") or "generic").lower()
    if "commerce" in app_type or app_type == AppType.ECOMMERCE.value:
        if context.get("requires_auth_first"):
            return [
                JourneyPlan(name="auth_first_direct_add_to_cart", app_type="ecommerce", steps=[_login_step(), _cart_step()]),
                JourneyPlan(name="auth_first_detail_then_cart", app_type="ecommerce", steps=[_login_step(), _open_product_step(), _cart_from_detail_step()]),
            ]
        return [
            JourneyPlan(name="direct_add_to_cart", app_type="ecommerce", steps=[_cart_step()]),
            JourneyPlan(name="detail_then_cart", app_type="ecommerce", steps=[_open_product_step(), _cart_from_detail_step()]),
        ]
    if app_type in {AppType.SAAS_AUTH.value, "saas"} or "dashboard" in app_type:
        return [
            JourneyPlan(name="register_login", app_type="saas", steps=[_login_step()]),
        ]
    if app_type in {AppType.TASK_MANAGER.value, "crud", "task"}:
        return [JourneyPlan(name="core_crud", app_type="crud", steps=_crud_steps())]
    if app_type == AppType.DOM_MUTATION.value:
        return [JourneyPlan(name="dom_mutation_basic", app_type=AppType.DOM_MUTATION.value, steps=_dom_mutation_steps())]
    if app_type == AppType.MARKETING.value:
        return [
            JourneyPlan(name="pricing_navigation", app_type=AppType.MARKETING.value, steps=[_marketing_pricing_step()]),
            JourneyPlan(name="features_navigation", app_type=AppType.MARKETING.value, steps=[_marketing_features_step()]),
            JourneyPlan(name="contact_navigation", app_type=AppType.MARKETING.value, steps=[_marketing_contact_step()]),
        ]
    return [JourneyPlan(name="core_exploration", app_type="generic", steps=[_generic_explore_step()])]


def _coerce_structured_journeys(journeys: list[dict] | None, context: dict[str, Any]) -> tuple[list[JourneyPlan] | None, list[dict] | None]:
    if not journeys:
        return plan_journeys(context), None

    first = journeys[0]
    if isinstance(first, dict) and "action" in first:
        return None, journeys

    plans: list[JourneyPlan] = []
    for item in journeys:
        if isinstance(item, dict) and "steps" in item:
            plans.append(JourneyPlan.from_dict(item))
        elif isinstance(item, dict):
            plans.append(JourneyPlan(name=item.get("goal") or "journey", app_type=context.get("app_type") or "generic", steps=[JourneyStep.from_dict(item)]))
    return plans, None


# ── Code-level analysis via Groq (Fix tier only) ─────────────────────────────

def _run_code_analysis(findings: list[Finding], crawl: dict) -> str | None:
    """
    Use Groq/Llama 3.3 to generate deeper code-level fix suggestions.
    Analyses the actual page HTML (not just metadata) for concrete fixes.
    Returns an enhanced bundled fix prompt, or None if Groq is unavailable.
    """
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if not groq_key:
        _log.warning("[FixTier] GROQ_API_KEY not set — skipping code analysis")
        return None

    try:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_key,
            timeout=120.0,
        )

        findings_text = "\n".join(
            f"- [{f.severity}] {f.title}: {f.description}" for f in findings
        )

        # Build crawl context with page HTML for deeper analysis
        crawl_summary = json.dumps(
            {
                "url": crawl.get("url"),
                "title": crawl.get("title"),
                "console_errors": crawl.get("console_errors", [])[:5],
                "failed_requests": crawl.get("failed_requests", [])[:5],
                "nav_links": crawl.get("nav_links", [])[:5],
                "buttons": crawl.get("buttons", [])[:10],
                "forms": crawl.get("forms", [])[:5],
                "text_snippet": (crawl.get("text_snippet", "") or "")[:300],
            },
            indent=2,
        )

        # Include actual page HTML for code-level analysis
        page_html = crawl.get("page_html") or ""
        # Truncate to fit Groq context — keep first 12k chars
        html_section = ""
        if page_html:
            html_section = f"\n\nHomepage HTML (truncated):\n```html\n{page_html[:12000]}\n```"

        # Also include extra page HTML if available
        extra_pages = crawl.get("extra_pages") or []
        for ep in extra_pages[:2]:  # max 2 extra pages
            ep_html = ep.get("html", "") or ""
            if ep_html:
                html_section += (
                    f"\n\nAdditional page ({ep.get('url', 'unknown')}) HTML (truncated):\n"
                    f"```html\n{ep_html[:8000]}\n```"
                )

        prompt = f"""You are a senior full-stack developer. A QA audit found these issues on a web app:

{findings_text}

Crawl data:
{crawl_summary}{html_section}

Using the actual HTML code above, write a SINGLE, comprehensive fix prompt that a non-technical founder can paste into an AI code editor (like Lovable, Bolt.new, or Replit Agent) to fix ALL issues at once.

The prompt should:
1. Reference specific HTML elements, classes, and IDs from the actual code
2. Include both desktop (1280px) and mobile (390px) fixes
3. Identify exact CSS classes, component names, or HTML structures that need changing
4. Be written as clear instructions, not raw code
5. Be thorough but concise — one prompt to fix everything

Return ONLY the fix prompt text, nothing else."""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=2000,
            temperature=0.3,
        )
        return response.choices[0].message.content.strip()

    except Exception as exc:
        _log.error("[FixTier] Code analysis failed: %s", exc, exc_info=True)
        return None


# ── Main orchestrator ─────────────────────────────────────────────────────────

def run_agentic_qa(
    url: str,
    tier: str = "vibe",
    journeys: list[dict] | None = None,
    *,
    on_progress: callable | None = None,
    should_cancel: Callable[[], bool] | None = None,
    user_api_key: str | None = None,
    site_description: str | None = None,
    credentials: dict[str, str] | None = None,
) -> AgenticQAResult:
    """
    Run an agentic QA audit against a URL.

    Args:
        url: The URL to audit.
        tier: "vibe", "deep", or "fix".
        journeys: Optional list of user journey steps (for deep/fix tiers).
        on_progress: Optional callback(step, total, message) for progress updates.
        user_api_key: Optional per-user Gemini API key.

    Returns:
        AgenticQAResult with score, findings, screenshots, etc.
    """
    tier = tier.lower().strip()
    if tier not in ("vibe", "deep", "fix"):
        tier = "vibe"
    audit_timeout_seconds = 60 if tier == "vibe" else 180
    started_at = time.monotonic()

    def _progress(step: int, total: int, msg: str):
        if on_progress:
            try:
                on_progress(step, total, msg)
            except Exception:
                pass

    def _raise_if_canceled():
        if should_cancel and should_cancel():
            raise AuditCanceledError("Agentic QA canceled by user")

    def _seconds_remaining() -> float:
        return max(1.0, audit_timeout_seconds - (time.monotonic() - started_at))

    def _raise_if_timed_out():
        if time.monotonic() - started_at > audit_timeout_seconds:
            raise AuditTimeoutError("Audit exceeded maximum allowed time")

    total_steps = {"vibe": 4, "deep": 5, "fix": 6}[tier]

    # Step 1: Browser crawl
    _raise_if_canceled()
    _raise_if_timed_out()
    _progress(1, total_steps, "Opening browser and crawling site...")

    # ── Tier-specific crawl parameters ────────────────────────────────────
    record_video = False
    run_journeys = journeys if tier in ("deep", "fix") else None
    max_pages = 3 if tier in ("deep", "fix") else 1

    try:
        crawl = asyncio.run(
            asyncio.wait_for(
                run_web_audit(
                    url,
                    record_video=record_video,
                    run_journeys=run_journeys if journeys and isinstance(journeys[0], dict) and "action" in journeys[0] else None,
                    max_pages=max_pages,
                    should_cancel=should_cancel,
                ),
                timeout=_seconds_remaining(),
            )
        )
    except AuditCanceledError:
        raise
    except asyncio.TimeoutError:
        return AgenticQAResult(
            url=url,
            tier=tier,
            score=0,
            confidence=0,
            summary="Audit exceeded maximum allowed time.",
            error="Audit exceeded maximum allowed time",
        )
    except Exception as exc:
        _log.error("[AgenticQA] Crawl failed: %s", exc, exc_info=True)
        return AgenticQAResult(
            url=url,
            tier=tier,
            score=0,
            confidence=0,
            summary="Could not load the site. Please check the URL and try again.",
            error="Site could not be loaded",
        )

    if crawl.get("error") and not crawl.get("desktop_screenshot_b64"):
        return AgenticQAResult(
            url=url,
            tier=tier,
            score=0,
            confidence=0,
            summary="Could not load the site. Please check the URL and try again.",
            error="Site could not be loaded",
        )

    # Step 2: Merge extra page data into crawl for deep/fix tiers
    _raise_if_canceled()
    _raise_if_timed_out()
    if tier in ("deep", "fix") and crawl.get("extra_pages"):
        _progress(2, total_steps, f"Analyzing {len(crawl['extra_pages'])} additional pages...")
        for ep in crawl["extra_pages"]:
            # Merge console errors from extra pages
            for err in (ep.get("console_errors") or []):
                crawl["console_errors"].append(f"[{ep.get('url', '?')}] {err}")
            # Merge failed requests from extra pages
            for fr in (ep.get("failed_requests") or []):
                fr_copy = dict(fr)
                fr_copy["source_page"] = ep.get("url", "")
                crawl["failed_requests"].append(fr_copy)
    else:
        _progress(2, total_steps, "Preparing analysis...")

    structured_plans: list[JourneyPlan] | None = None
    structured_journey_run: dict[str, Any] | None = None
    journey_results: list[dict] | None = crawl.get("journey_results")
    journey_timeline: list[dict] | None = None
    step_results: list[dict] | None = None
    discovery_context = discover_site(crawl, description=site_description)
    hard_blocker = _detect_pre_journey_blocker(crawl)
    if hard_blocker:
        blocker_snapshot = {
            "url": crawl.get("url") or url,
            "title": crawl.get("title") or "",
            "text_snippet": crawl.get("text_snippet") or "",
        }
        return AgenticQAResult(
            url=url,
            tier=tier,
            score=0,
            confidence=0,
            findings=[],
            summary=hard_blocker["summary"],
            journey_timeline=[{
                "journey": "site_access",
                "app_type": discovery_context.get("app_type"),
                "status": "FAILED",
                "failed_step": "site access",
                "reason": hard_blocker["error"],
                "steps": [{
                    "step": "site access",
                    "status": "failed",
                    "failure_type": hard_blocker["failure_type"],
                    "evidence_delta": [],
                    "recovery_attempts": [],
                }],
            }],
            step_results=[{
                "step_name": "site access",
                "goal": "site_access",
                "status": "failed",
                "chosen_action": None,
                "verification": {
                    "success": False,
                    "passed_signals": [],
                    "failed_signals": [],
                    "delta_summary": [],
                    "failure_type": hard_blocker["failure_type"],
                    "llm_used": False,
                },
                "evidence_delta": [],
                "recovery_attempts": [],
                "failure_type": hard_blocker["failure_type"],
                "error": hard_blocker["error"],
                "notes": [],
                "before_snapshot": blocker_snapshot,
                "after_snapshot": blocker_snapshot,
                "screenshot_path": None,
            }],
            error=hard_blocker["error"],
            analysis_limited=True,
        )

    if tier in ("deep", "fix"):
        _raise_if_canceled()
        _raise_if_timed_out()
        _progress(3, total_steps, "Planning and executing verified user journeys...")
        structured_plans, legacy_journeys = _coerce_structured_journeys(journeys, discovery_context)
        if structured_plans:
            try:
                structured_journey_run = asyncio.run(
                    asyncio.wait_for(
                        run_structured_journeys(
                            url,
                            structured_plans,
                            record_video=True,
                            base_context=discovery_context,
                            generated_credentials=credentials,
                            should_cancel=should_cancel,
                        ),
                        timeout=_seconds_remaining(),
                    )
                )
                journey_results = structured_journey_run.get("journey_results")
            except AuditCanceledError:
                raise
            except asyncio.TimeoutError:
                return AgenticQAResult(
                    url=url,
                    tier=tier,
                    score=0,
                    confidence=0,
                    summary="Audit exceeded maximum allowed time.",
                    error="Audit exceeded maximum allowed time",
                )
            except Exception as exc:
                _log.error("[AgenticQA] Structured journeys failed: %s", exc, exc_info=True)
        elif legacy_journeys:
            journey_results = crawl.get("journey_results")

        if journey_results:
            journey_timeline = build_journey_timeline(journey_results)
            step_results = [
                step
                for journey in journey_results
                for step in (journey.get("steps") or [])
            ]

    # Step 3: Visual analysis via Gemini (with full fallback chain)
    _raise_if_canceled()
    _raise_if_timed_out()
    _progress(4 if tier in ("deep", "fix") else 3, total_steps, "Running AI visual analysis...")

    try:
        verdict = judge_visual(crawl, user_api_key=user_api_key)
    except Exception as exc:
        _log.error("[AgenticQA] Gemini judge failed: %s", exc, exc_info=True)
        # Never expose raw error messages — use Playwright fallback data
        verdict = {
            "score": None,
            "confidence": None,
            "findings": [],
            "summary": "AI visual analysis was unavailable. Showing basic technical audit.",
            "analysis_limited": True,
        }

    # Detect if analysis was limited (fallback mode)
    analysis_limited = verdict.get("analysis_limited", False)
    user_key_exhausted = verdict.get("user_key_exhausted", False)

    # Build findings
    findings = [
        Finding(
            severity=f.get("severity", "medium"),
            category=f.get("category", "functionality"),
            title=f.get("title", "Untitled"),
            description=f.get("description", ""),
            fix_prompt=f.get("fix_prompt", ""),
            confidence=verdict.get("confidence"),
        )
        for f in verdict.get("findings", [])
    ]

    # ── Tier-specific finding limits ──────────────────────────────────────
    # Vibe: top 3 findings only (quick scan)
    # Deep/Fix: ALL findings (comprehensive audit)
    if tier == "vibe" and len(findings) > 3:
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        findings.sort(key=lambda f: severity_order.get(f.severity, 99))
        findings = findings[:3]

    # Compute score and confidence
    if analysis_limited:
        # In fallback mode: compute score from findings if we have any, else None
        score = compute_score(findings) if findings else None
        confidence = None
    else:
        # Normal AI mode: compute from findings
        score = compute_score(findings)
        confidence = verdict.get("confidence", 50)

    # Step 4: Build fix prompt bundle
    _raise_if_canceled()
    _raise_if_timed_out()
    _progress(5 if tier in ("deep", "fix") else 4, total_steps, "Generating fix prompts...")
    bundled = build_bundled_fix_prompt(findings, url)
    if journey_results:
        extra_context = build_fix_prompt_context(
            journey_results,
            state_snapshot_summary=structured_journey_run.get("journey_results", [{}])[0].get("state_snapshot_summary")
            if structured_journey_run and structured_journey_run.get("journey_results")
            else discovery_context,
        )
        if extra_context:
            bundled = (bundled + "\n\nJourney context:\n" + extra_context).strip()

    # Step 5 (fix tier only): Code-level analysis using actual page HTML
    if tier == "fix":
        _raise_if_canceled()
        _raise_if_timed_out()
        _progress(6, total_steps, "Running code-level analysis on page HTML...")
        code_fix = _run_code_analysis(findings, crawl)
        if code_fix:
            bundled = code_fix  # Replace basic bundle with enhanced HTML-aware version
            if not findings:
                findings.append(Finding(
                    severity="info",
                    category="code",
                    title="AI Code Analysis Complete",
                    description="Groq analyzed your page HTML and generated improvement recommendations. See the fix plan below.",
                    fix_prompt=""
                ))

    _raise_if_canceled()
    _raise_if_timed_out()
    _progress(total_steps, total_steps, "Done!")

    # ── Determine what to include in result per tier ──────────────────────
    # Vibe: no video path (even if accidentally recorded)
    video_path = None
    if tier in ("deep", "fix"):
        video_path = (
            (structured_journey_run or {}).get("video_path")
            or crawl.get("video_path")
        )

    return AgenticQAResult(
        url=url,
        tier=tier,
        score=score,
        confidence=confidence,
        findings=findings,
        summary=verdict.get("summary", ""),
        bundled_fix_prompt=bundled or None,
        video_path=video_path,
        desktop_screenshot_b64=crawl.get("desktop_screenshot_b64"),
        mobile_screenshot_b64=crawl.get("mobile_screenshot_b64"),
        journey_results=journey_results,
        journey_timeline=journey_timeline,
        step_results=step_results,
        analysis_limited=analysis_limited,
        user_key_exhausted=user_key_exhausted,
    )


def result_to_dict(result: AgenticQAResult) -> dict[str, Any]:
    """Convert an AgenticQAResult to a JSON-serializable dict."""
    d = asdict(result)
    d["findings"] = [asdict(f) for f in result.findings]
    return d
