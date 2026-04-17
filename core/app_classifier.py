from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

from openai import OpenAI

from core.models import AppType

_log = logging.getLogger(__name__)

_DEFAULT_MODEL = os.getenv("AIBREAKER_CLASSIFIER_MODEL", "llama-3.3-70b-versatile")
_DEFAULT_BASE_URL = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
_VALID_APP_TYPES = {app_type.value for app_type in AppType}
_VALID_PHASE1_APP_TYPES = {
    AppType.ECOMMERCE.value,
    AppType.SAAS_AUTH.value,
    AppType.MARKETING.value,
    AppType.TASK_MANAGER.value,
    AppType.GENERIC.value,
}


def _truncate(value: Any, limit: int) -> str:
    text = str(value or "").strip()
    return text[:limit]


def _classifier_context(crawl: dict[str, Any], description: str | None = None) -> dict[str, Any]:
    nav_links = []
    for item in (crawl.get("nav_links") or [])[:12]:
        if not isinstance(item, dict):
            continue
        nav_links.append(
            {
                "text": _truncate(item.get("text"), 80),
                "href": _truncate(item.get("href"), 160),
            }
        )

    forms = []
    for item in (crawl.get("forms") or [])[:6]:
        if not isinstance(item, dict):
            continue
        forms.append(
            {
                "id": _truncate(item.get("id"), 80),
                "action": _truncate(item.get("action"), 120),
                "fields": item.get("fields"),
            }
        )

    return {
        "title": _truncate(crawl.get("title"), 200),
        "site_description": _truncate(description, 240),
        "text_snippet": _truncate(crawl.get("text_snippet"), 2000),
        "buttons": [_truncate(button, 80) for button in (crawl.get("buttons") or [])[:20]],
        "nav_links": nav_links,
        "forms": forms,
        "structural_signals": crawl.get("structural_signals") or {},
        "page_html_excerpt": _truncate(crawl.get("page_html"), 6000),
    }


def _phase1_classifier_context(
    url: str,
    visible_text: str,
    *,
    buttons: list[str] | None = None,
    forms: list[str] | None = None,
    links: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "url": _truncate(url, 240),
        "visible_text": _truncate(visible_text, 2500),
        "buttons": [_truncate(item, 80) for item in (buttons or [])[:20]],
        "forms": [_truncate(item, 80) for item in (forms or [])[:12]],
        "links": [_truncate(item, 120) for item in (links or [])[:20]],
    }


def _classification_prompt(context: dict[str, Any]) -> str:
    return f"""You are classifying a website into one app type for AiBreaker.

Allowed app_type values:
- ecommerce
- saas_auth
- task_manager
- dom_mutation
- marketing_site
- generic

Rules:
- Pick ecommerce when the page is primarily a storefront, catalog, or shopping flow.
- Pick saas_auth when login/signup is the main purpose and leads into an app/dashboard.
- Pick task_manager when the page is primarily CRUD for tasks/items/boards.
- Pick dom_mutation only for simple add/remove element demos.
- Pick marketing_site for product/company landing pages where pricing/features/contact/docs are primary.
- Pick generic only when none of the above clearly fit.
- requires_auth_first should be true only when the main path needs login before useful app actions.
- Return JSON only.

Website context:
{json.dumps(context, ensure_ascii=False, indent=2)}

Return exactly this JSON shape:
{{
  "app_type": "ecommerce|saas_auth|task_manager|dom_mutation|marketing_site|generic",
  "requires_auth_first": true,
  "confidence": 0,
  "reasoning": "short explanation"
}}
"""


def _phase1_classification_prompt(context: dict[str, Any]) -> str:
    return f"""Classify the website into exactly one app type for AiBreaker.

Allowed app_type values:
- ecommerce
- saas_auth
- marketing_site
- task_manager
- generic

Rules:
- ecommerce: product catalog, add-to-cart, cart, checkout, storefront signals
- saas_auth: login or signup is the main entry into an application/dashboard
- marketing_site: pricing, docs, features, signup, contact, product marketing dominate
- task_manager: CRUD/task/board/list management dominates
- generic: none of the above clearly fit
- Return JSON only
- Do not include markdown
- signals must be a short list of concise detected cues from the provided input
- confidence must be a float between 0.0 and 1.0

Input:
{json.dumps(context, ensure_ascii=False, indent=2)}

Return exactly this JSON:
{{
  "app_type": "ecommerce|saas_auth|marketing_site|task_manager|generic",
  "confidence": 0.0,
  "signals": ["signal one", "signal two"]
}}
"""


def _extract_json_object(text: str) -> dict[str, Any]:
    raw = str(text or "").strip()
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{.*\}", raw, flags=re.DOTALL)
    if not match:
        return {}
    try:
        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        return {}


def _normalize_classifier_output(payload: dict[str, Any]) -> dict[str, Any] | None:
    app_type = str(payload.get("app_type") or "").strip().lower()
    if app_type not in _VALID_APP_TYPES:
        return None

    try:
        confidence = int(payload.get("confidence", 0))
    except (TypeError, ValueError):
        confidence = 0

    return {
        "app_type": app_type,
        "requires_auth_first": bool(payload.get("requires_auth_first", False)),
        "confidence": max(0, min(100, confidence)),
        "reasoning": str(payload.get("reasoning") or "").strip(),
        "classification_source": "llm",
    }


def _normalize_phase1_output(payload: dict[str, Any]) -> dict[str, Any] | None:
    app_type = str(payload.get("app_type") or "").strip().lower()
    if app_type not in _VALID_PHASE1_APP_TYPES:
        return None

    try:
        confidence = float(payload.get("confidence", 0.0))
    except (TypeError, ValueError):
        confidence = 0.0

    raw_signals = payload.get("signals") or []
    if not isinstance(raw_signals, list):
        raw_signals = []
    signals = [str(item).strip() for item in raw_signals if str(item).strip()][:8]

    return {
        "app_type": app_type,
        "confidence": max(0.0, min(1.0, confidence)),
        "signals": signals,
    }


def _classify_with_groq(prompt: str) -> dict[str, Any] | None:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        return None

    client = OpenAI(base_url=_DEFAULT_BASE_URL, api_key=api_key, timeout=30.0)
    response = client.chat.completions.create(
        model=_DEFAULT_MODEL,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
    )
    content = response.choices[0].message.content or ""
    return _normalize_classifier_output(_extract_json_object(content))


def classify_app_type_llm(
    *,
    url: str,
    visible_text: str,
    buttons: list[str] | None = None,
    forms: list[str] | None = None,
    links: list[str] | None = None,
) -> dict[str, Any]:
    context = _phase1_classifier_context(
        url,
        visible_text,
        buttons=buttons,
        forms=forms,
        links=links,
    )
    prompt = _phase1_classification_prompt(context)

    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is required for classify_app_type_llm")

    client = OpenAI(base_url=_DEFAULT_BASE_URL, api_key=api_key, timeout=30.0)
    response = client.chat.completions.create(
        model=_DEFAULT_MODEL,
        temperature=0.0,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
    )
    content = response.choices[0].message.content or "{}"
    normalized = _normalize_phase1_output(_extract_json_object(content))
    if normalized is None:
        raise ValueError("LLM classifier returned invalid JSON payload")
    return normalized


def classify_site_with_llm(crawl: dict[str, Any], description: str | None = None) -> dict[str, Any] | None:
    try:
        links = []
        for item in (crawl.get("nav_links") or []):
            if not isinstance(item, dict):
                continue
            text = str(item.get("text") or "").strip()
            href = str(item.get("href") or "").strip()
            if text and href:
                links.append(f"{text} ({href})")
            elif text:
                links.append(text)
            elif href:
                links.append(href)

        forms = []
        for item in (crawl.get("forms") or []):
            if not isinstance(item, dict):
                continue
            action = str(item.get("action") or "").strip()
            form_id = str(item.get("id") or "").strip()
            fields = item.get("fields")
            parts = [piece for piece in (form_id, action, f"fields={fields}" if fields is not None else "") if piece]
            if parts:
                forms.append(" ".join(parts))

        phase1 = classify_app_type_llm(
            url=str(crawl.get("url") or ""),
            visible_text=" ".join(
                [
                    str(crawl.get("title") or ""),
                    str(crawl.get("text_snippet") or ""),
                    str(description or ""),
                ]
            ).strip(),
            buttons=[str(button) for button in (crawl.get("buttons") or [])],
            forms=forms,
            links=links,
        )

        app_type = phase1["app_type"]
        requires_auth_first = False
        reasoning = ", ".join(phase1.get("signals") or [])
        if app_type == AppType.ECOMMERCE.value:
            combined = " ".join(
                [
                    str(crawl.get("text_snippet") or ""),
                    str(crawl.get("page_html") or ""),
                    str(description or ""),
                ]
            ).lower()
            requires_auth_first = "login" in combined and any(
                token in combined for token in ("cart", "checkout", "inventory", "store", "shop", "products")
            )

        features: list[str] = []
        primary_goal = "explore site"
        if app_type == AppType.ECOMMERCE.value:
            features = ["login", "search", "cart", "checkout"] if requires_auth_first else ["search", "cart", "checkout"]
            primary_goal = "purchase item"
        elif app_type == AppType.TASK_MANAGER.value:
            features = ["create", "edit", "delete"]
            primary_goal = "manage records"
        elif app_type == AppType.SAAS_AUTH.value:
            features = ["login", "dashboard", "navigation"]
            primary_goal = "reach dashboard"
        elif app_type == AppType.MARKETING.value:
            features = ["pricing", "features", "contact"]
            primary_goal = "explore marketing paths"

        return {
            "app_type": app_type,
            "features": features,
            "primary_goal": primary_goal,
            "site_description": description,
            "requires_auth_first": requires_auth_first,
            "confidence": int(round(float(phase1.get("confidence", 0.0)) * 100)),
            "reasoning": reasoning,
            "signals": phase1.get("signals", []),
            "classification_source": "llm",
        }
    except Exception as exc:
        _log.warning("[Classifier] LLM classification failed: %s", exc)
        return None
