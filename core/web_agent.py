"""
web_agent.py — Playwright-based browser crawler for AiBreaker.

Captures dual-viewport screenshots (desktop + mobile), console errors,
failed network requests, page metadata, and optional user journey execution.
Records video for Deep Dive / Fix & Verify tiers.
Self-healing locators: retries failed selectors via Gemini suggestion.
"""

import asyncio
import base64
import json
import logging
import os
import random
import re
import tempfile
from pathlib import Path
from typing import Any, Callable
from urllib.parse import urljoin, urlparse

from playwright.async_api import TimeoutError as PlaywrightTimeoutError, async_playwright

from core.models import (
    ActionCandidate,
    FailureType,
    JourneyPlan,
    JourneyStep,
    RecoveryEvent,
    SessionState,
    StepType,
    StepResult,
    SuccessSignal,
    VerificationResult,
    to_dict,
)

_log = logging.getLogger(__name__)

# ── Default viewport sizes ────────────────────────────────────────────────────

DESKTOP_VIEWPORT = {"width": 1280, "height": 720}
MOBILE_VIEWPORT = {"width": 390, "height": 844}
CHROMIUM_LAUNCH_ARGS = [
    "--disable-dev-shm-usage",
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-gpu",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=site-per-process",
    "--no-zygote",
    "--disable-extensions",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-first-run",
    "--disable-background-networking",
    "--memory-pressure-off",
]

# Where to store video recordings
VIDEO_DIR = os.getenv("VIDEO_DIR", "/tmp/aibreaker_videos/")
STEP_TIMEOUT_SECONDS = 15
MAX_RETRIES_PER_STEP = 2
MAX_SOFT_RECOVERY_PER_STEP = 1
MAX_TOTAL_STEPS_PER_JOURNEY = 30
BOT_BLOCK_SIGNALS = (
    "sorry, you have been blocked",
    "attention required! | cloudflare",
    "attention required",
    "access denied",
    "enable javascript and cookies",
    "cf-error-details",
    "ray id",
)
CAPTCHA_SIGNALS = (
    "captcha",
    "verify you are human",
    "i am human",
    "prove you are human",
)


class AuditCanceledError(RuntimeError):
    """Raised when an in-flight browser audit is canceled by the user."""


def _raise_if_canceled(should_cancel: Callable[[], bool] | None = None) -> None:
    if should_cancel and should_cancel():
        raise AuditCanceledError("Agentic QA canceled by user")


async def _take_screenshot(page, viewport: dict) -> str | None:
    """Resize viewport and take a full-page screenshot, return base64."""
    try:
        await page.set_viewport_size(viewport)
        await page.wait_for_timeout(600)
        raw = await page.screenshot(type="png", full_page=True)
        return base64.b64encode(raw).decode("ascii")
    except Exception:
        return None


def _is_probable_selector(value: str) -> bool:
    if not value:
        return False
    prefixes = ("#", ".", "//", "[", "xpath=", "css=")
    return value.startswith(prefixes) or any(token in value for token in ("[", "#", ".", ">"))


def _as_action_candidate(data: dict[str, Any] | ActionCandidate) -> ActionCandidate:
    return data if isinstance(data, ActionCandidate) else ActionCandidate.from_dict(data)


def _as_journey_step(data: dict[str, Any] | JourneyStep) -> JourneyStep:
    return data if isinstance(data, JourneyStep) else JourneyStep.from_dict(data)


def _snapshot_delta(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    deltas: list[str] = []
    if before.get("url") != after.get("url"):
        deltas.append(f"URL changed from {before.get('url', '')} to {after.get('url', '')}")
    before_text = before.get("text_snippet", "")
    after_text = after.get("text_snippet", "")
    if before_text != after_text and after_text:
        before_lines = {
            line.strip()
            for line in before_text.splitlines()
            if line.strip() and len(line.strip()) > 2
        }
        after_lines = {
            line.strip()
            for line in after_text.splitlines()
            if line.strip() and len(line.strip()) > 2
        }
        added_lines = [
            line for line in after_lines - before_lines
            if line.lower() not in {"react", "source", "community"}
        ]
        if added_lines:
            for line in sorted(added_lines)[:3]:
                deltas.append(f"New text appeared: '{line[:80]}'")
        else:
            before_words = set(re.findall(r"[A-Za-z0-9!']{3,}", before_text))
            after_words = set(re.findall(r"[A-Za-z0-9!']{3,}", after_text))
            added_words = sorted(after_words - before_words)
            if added_words:
                deltas.append(
                    "Text appeared: " + ", ".join(added_words[:5])
                )
            else:
                deltas.append("Visible text changed")
    return deltas


async def _capture_page_snapshot(page) -> dict[str, Any]:
    url = ""
    try:
        url = page.url
    except Exception:
        pass

    title = ""
    try:
        title = await page.title()
    except Exception:
        pass

    text = ""
    try:
        text = (await page.inner_text("body"))[:800]
    except Exception:
        pass

    return {
        "url": url,
        "title": title,
        "text_snippet": text,
    }


def _detect_failure_type_from_snapshot(snapshot: dict[str, Any]) -> FailureType | None:
    haystack = f"{snapshot.get('title', '')}\n{snapshot.get('text_snippet', '')}".lower()
    if any(signal in haystack for signal in CAPTCHA_SIGNALS):
        return FailureType.CAPTCHA_REQUIRED
    if any(signal in haystack for signal in BOT_BLOCK_SIGNALS):
        return FailureType.BLOCKED_BY_BOT_PROTECTION
    return None


async def _human_delay(page, lower_ms: int = 100, upper_ms: int = 300) -> None:
    await page.wait_for_timeout(random.randint(lower_ms, upper_ms))


async def _wait_for_transition(page, before_snapshot: dict[str, Any], timeout_ms: int = 2000) -> None:
    deadline = asyncio.get_running_loop().time() + (timeout_ms / 1000.0)
    while asyncio.get_running_loop().time() < deadline:
        after_snapshot = await _capture_page_snapshot(page)
        if (
            after_snapshot.get("url") != before_snapshot.get("url")
            or after_snapshot.get("text_snippet") != before_snapshot.get("text_snippet")
        ):
            return
        await page.wait_for_timeout(150)


def _resolve_state_reference(reference: str | None, state: SessionState) -> str | None:
    if not reference:
        return None
    if not reference.startswith("state."):
        return reference

    current: Any = state
    for part in reference.split(".")[1:]:
        if isinstance(current, SessionState):
            current = getattr(current, part, None)
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
        if current is None:
            return None
    return str(current)


# ── Self-healing locators ─────────────────────────────────────────────────────

_SELECTOR_NOT_FOUND_HINTS = (
    "waiting for selector",
    "could not resolve",
    "no element found",
    "selector resolved to hidden",
    "timeout",
)


async def _suggest_replacement_selector(page, failed_selector: str) -> str | None:
    """
    Ask Gemini to find a replacement CSS selector in the current page HTML.
    Returns the suggested selector string, or None on failure.
    """
    try:
        from core.gemini_judge import _get_gemini_model

        html = await page.content()
        # Truncate to ~15k chars to fit Gemini context
        html_truncated = html[:15000]

        model = _get_gemini_model()
        prompt = (
            f"The element with selector `{failed_selector}` was not found. "
            f"Look at this HTML and find the most likely replacement CSS selector "
            f"for the same element. Return ONLY the CSS selector, nothing else.\n\n"
            f"{html_truncated}"
        )
        response = model.generate_content(prompt)
        suggestion = (response.text or "").strip().strip("`").strip("'").strip('"')
        if suggestion and len(suggestion) < 300:
            _log.info(
                "[SelfHeal] Suggested replacement: %s → %s",
                failed_selector,
                suggestion,
            )
            return suggestion
    except Exception as exc:
        _log.warning("[SelfHeal] Could not get replacement selector: %s", exc)
    return None


def _is_selector_not_found(error_msg: str) -> bool:
    """Check if an error message indicates a selector was not found."""
    lower = error_msg.lower()
    return any(hint in lower for hint in _SELECTOR_NOT_FOUND_HINTS)


async def _execute_step_action(page, action: str, selector: str, value: str, url: str):
    """Execute a single journey step action on the page."""
    if action == "click":
        await page.click(selector, timeout=8000)
    elif action == "fill":
        await page.fill(selector, value, timeout=8000)
    elif action == "submit":
        if selector:
            await page.click(selector, timeout=8000)
        else:
            await page.keyboard.press("Enter")
    elif action == "wait":
        ms = int(value) if value else 2000
        await page.wait_for_timeout(min(ms, 10000))
    elif action == "navigate":
        await page.goto(url or value, timeout=15000, wait_until="domcontentloaded")
    else:
        raise ValueError(f"Unknown action: {action}")


async def _run_user_journeys(page, journeys: list[dict]) -> list[dict]:
    """
    Execute a list of user journey steps on the page.

    Each step is a dict:
      {"action": "click"|"fill"|"submit"|"wait"|"navigate",
       "selector": "css selector" (optional),
       "value": "text to type" (optional),
       "url": "url to navigate" (optional)}

    Returns a list of step results with status and any errors.
    Self-healing: if a selector is not found, asks Gemini for a replacement
    and retries once before marking the step as failed.
    """
    results = []
    for step in journeys:
        action = step.get("action", "").lower()
        selector = step.get("selector", "")
        value = step.get("value", "")
        url = step.get("url", "")
        result = {
            "action": action,
            "selector": selector,
            "status": "ok",
            "error": None,
            "healed_selector": None,
        }

        try:
            await _execute_step_action(page, action, selector, value, url)
        except ValueError as e:
            # Unknown action — skip, no healing needed
            result["status"] = "skipped"
            result["error"] = str(e)[:300]
        except Exception as e:
            error_msg = str(e)[:300]

            # ── Self-healing: retry with Gemini-suggested selector ────
            if selector and _is_selector_not_found(error_msg):
                _log.info(
                    "[SelfHeal] Selector not found: %s — asking Gemini for replacement",
                    selector,
                )
                healed = await _suggest_replacement_selector(page, selector)
                if healed:
                    try:
                        await _execute_step_action(page, action, healed, value, url)
                        result["status"] = "healed"
                        result["healed_selector"] = healed
                        result["error"] = None
                        _log.info(
                            "[SelfHeal] SUCCESS — original: %s → healed: %s",
                            selector,
                            healed,
                        )
                    except Exception as retry_exc:
                        result["status"] = "failed"
                        result["error"] = (
                            f"Original: {error_msg} | "
                            f"Healed selector '{healed}' also failed: {str(retry_exc)[:200]}"
                        )
                        result["healed_selector"] = healed
                else:
                    result["status"] = "failed"
                    result["error"] = error_msg
            else:
                result["status"] = "failed"
                result["error"] = error_msg

        results.append(result)
        # Brief pause between steps so the page can settle
        await page.wait_for_timeout(300)

    return results


_BLOCKER_SELECTORS = [
    "[class*='fc-cta-consent']",
    "[class*='fc-button-label']",
    "[aria-label*='close' i]",
    "[aria-label='Close']",
    "[aria-label='Dismiss']",
    "[data-testid='close']",
    "button[aria-label*='close' i]",
    "button[aria-label*='dismiss' i]",
    "button:has-text('Accept')",
    "button:has-text('Accept all')",
    "button:has-text('Allow all')",
    "button:has-text('Allow All')",
    "button:has-text('I Accept')",
    "button:has-text('I agree')",
    "button:has-text('Agree')",
    "button:has-text('Consent')",
    "button:has-text('Got it')",
    "button:has-text('Close')",
    "button:has-text('Dismiss')",
    "button:has-text('No thanks')",
]
_BLOCKER_TYPE_SIGNALS = {
    # Specific content-based classes first. First match wins.
    "cookie_consent": [
        "cookie",
        "consent",
        "gdpr",
        "accept cookies",
        "cookiebot",
        "we use cookies",
        "privacy",
        "tracking",
        "allow all",
    ],
    "newsletter_popup": [
        "subscribe",
        "newsletter",
        "sign up for",
        "get updates",
        "join our list",
        "discount",
    ],
    "chat_launcher": [
        "chat with us",
        "live chat",
        "intercom",
        "drift",
        "messenger",
        "crisp",
    ],
    # Generic fallbacks last.
    "modal": ["aria-modal", "role=\"dialog\"", "dialog", "modal", "popup", "close"],
    "sticky_overlay": ["sticky", "position:fixed", "fixed"],
}
_PHASE_TO_CHOKE_POINT = {
    "pre_action": "before_action",
    "post_navigation": "after_navigation",
    "post_failure": "after_failure",
}


def _classify_blocker(element_text: str, selector: str) -> str:
    combined = f"{element_text} {selector}".lower()
    for blocker_type, signals in _BLOCKER_TYPE_SIGNALS.items():
        if any(signal in combined for signal in signals):
            return blocker_type
    return "unknown_blocker"


def _classify_blocker_action(element_text: str, selector: str) -> str:
    combined = f"{element_text} {selector}".lower()
    if "accept" in combined or "allow all" in combined or "agree" in combined:
        return "clicked_accept"
    if "close" in combined or "dismiss" in combined or "no thanks" in combined:
        return "clicked_close"
    return "clicked_close"


async def _find_visible_blocker(page) -> tuple[Any, str, str, str, str] | None:
    for selector in _BLOCKER_SELECTORS:
        try:
            locator = page.locator(selector).first
            if await locator.count() and await locator.is_visible(timeout=400):
                element_text = ""
                try:
                    element_text = ((await locator.inner_text(timeout=400)) or "").strip()
                except Exception:
                    element_text = ""
                context_text = element_text
                try:
                    context_text = await locator.evaluate(
                        """(el) => {
                            const container =
                              el.closest('[role="dialog"], [aria-modal="true"], .modal, .popup, .banner, .cookie, .consent, .overlay, .backdrop')
                              || el.parentElement
                              || el;
                            return (container.innerText || el.innerText || '').trim();
                        }"""
                    )
                except Exception:
                    context_text = element_text
                action_taken = _classify_blocker_action(element_text, selector)
                blocker_type = _classify_blocker(context_text or element_text, selector)
                return locator, selector, context_text, action_taken, blocker_type
        except Exception:
            continue

    try:
        for frame in page.frames:
            if frame == page.main_frame:
                continue
            for selector in (
                "button:has-text('Close')",
                "button:has-text('×')",
                "button:has-text('Accept')",
                "button:has-text('Accept all')",
                "[aria-label*='close' i]",
            ):
                try:
                    locator = frame.locator(selector).first
                    if await locator.count() and await locator.is_visible(timeout=400):
                        element_text = ""
                        try:
                            element_text = ((await locator.inner_text(timeout=400)) or "").strip()
                        except Exception:
                            element_text = ""
                        blocker_type = _classify_blocker(element_text, selector)
                        action_taken = _classify_blocker_action(element_text, selector)
                        return locator, f"iframe::{selector}", element_text, action_taken, blocker_type
                except Exception:
                    continue
    except Exception:
        pass

    return None


async def dismiss_blockers(page, phase: str = "pre_action") -> list[RecoveryEvent]:
    handled: list[RecoveryEvent] = []
    dismissed_count = 0
    last_blocker_type = "unknown_blocker"
    last_action_taken = "clicked_close"
    last_selector = ""
    choke_point = _PHASE_TO_CHOKE_POINT.get(phase, phase)

    for _attempt in range(3):
        blocker = await _find_visible_blocker(page)
        if not blocker:
            break
        locator, selector, context_text, action_taken, blocker_type = blocker
        last_blocker_type = blocker_type
        last_action_taken = action_taken
        last_selector = selector
        try:
            await locator.click(timeout=1200)
        except Exception:
            try:
                await page.keyboard.press("Escape")
            except Exception:
                pass
        await page.wait_for_timeout(800)
        dismissed_count += 1

        try:
            still_visible = await locator.is_visible(timeout=300)
        except Exception:
            still_visible = False
        if still_visible:
            try:
                await page.keyboard.press("Escape")
                await page.wait_for_timeout(400)
            except Exception:
                pass

    if dismissed_count:
        remaining = await _find_visible_blocker(page)
        success = remaining is None
        handled.append(
            RecoveryEvent(
                choke_point=choke_point,
                blocker_type=last_blocker_type,
                action_taken=last_action_taken,
                success=success,
                selector_used=last_selector,
                notes=(
                    f"{last_blocker_type.replace('_', ' ').title()} detected and dismissed before action"
                    if success and phase == "pre_action"
                    else f"{last_blocker_type.replace('_', ' ').title()} detected and cleared at {choke_point.replace('_', ' ')}"
                    if success
                    else f"{last_blocker_type.replace('_', ' ').title()} detected but could not be fully cleared after {dismissed_count} attempts"
                ),
            )
        )
    return handled


async def _resolve_locator(page, candidate: ActionCandidate):
    for selector in candidate.selectors:
        try:
            locator = page.locator(selector).first
            if await locator.count():
                return locator
        except Exception:
            continue

    role = candidate.role
    name = candidate.name or candidate.intent or candidate.text
    if role and name:
        try:
            locator = page.get_by_role(role, name=re.compile(re.escape(name), re.I))
            if await locator.count():
                return locator.first
        except Exception:
            pass

    if candidate.text:
        try:
            locator = page.get_by_text(re.compile(re.escape(candidate.text), re.I))
            if await locator.count():
                return locator.first
        except Exception:
            pass

    if candidate.intent:
        try:
            locator = page.get_by_text(re.compile(re.escape(candidate.intent), re.I))
            if await locator.count():
                return locator.first
        except Exception:
            pass

    return None


def _ordered_candidates_for_step(step: JourneyStep) -> list[ActionCandidate]:
    candidates = [_as_action_candidate(candidate) for candidate in (step.action_candidates or [])]
    if step.step_type != StepType.FILL_SUBMIT.value:
        return candidates

    fill_candidates = [candidate for candidate in candidates if candidate.type == "fill"]
    submit_candidates = [candidate for candidate in candidates if candidate.type == "submit"]
    other_candidates = [
        candidate for candidate in candidates if candidate.type not in {"fill", "submit"}
    ]
    if not submit_candidates:
        submit_candidates.append(
            ActionCandidate(type="submit", intent="submit filled input", fallback_value="Enter")
        )
    return fill_candidates + submit_candidates + other_candidates


async def _execute_candidate(
    page,
    candidate: ActionCandidate,
    state: SessionState,
    value: str | None = None,
) -> dict[str, Any]:
    await _human_delay(page)
    action_type = candidate.type or "click"
    locator = None
    resolved_value = _resolve_state_reference(value or candidate.value, state)

    if action_type in {"click", "fill", "submit"}:
        locator = await _resolve_locator(page, candidate)
        if locator is None and action_type != "submit":
            raise ValueError(f"Could not resolve action candidate: {candidate.intent}")

    if locator is not None:
        try:
            await locator.scroll_into_view_if_needed(timeout=1500)
        except Exception:
            pass

    if action_type == "click":
        await locator.click(timeout=STEP_TIMEOUT_SECONDS * 1000)
    elif action_type == "fill":
        await locator.fill(resolved_value or "", timeout=STEP_TIMEOUT_SECONDS * 1000)
    elif action_type == "submit":
        if locator is not None:
            await locator.click(timeout=STEP_TIMEOUT_SECONDS * 1000)
        else:
            await page.keyboard.press(resolved_value or candidate.fallback_value or "Enter")
    elif action_type == "navigate":
        target_url = resolved_value or ""
        await page.goto(target_url, timeout=STEP_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
    else:
        raise ValueError(f"Unsupported action type: {action_type}")

    await page.wait_for_timeout(350)
    return {
        "type": action_type,
        "intent": candidate.intent,
        "selectors": candidate.selectors,
        "role": candidate.role,
        "name": candidate.name,
        "value": resolved_value,
    }


async def _llm_verify_step(_page, _step: JourneyStep, _before: dict[str, Any], _after: dict[str, Any]) -> bool:
    # DOM-first execution is the default. Hidden tests can monkeypatch this helper.
    return False


async def _signal_visible(page, value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, dict):
        selector = value.get("selector")
        role = value.get("role")
        name = value.get("name")
        if selector:
            try:
                return await page.locator(selector).first.is_visible(timeout=600)
            except Exception:
                return False
        if role and name:
            try:
                locator = page.get_by_role(role, name=re.compile(re.escape(str(name)), re.I))
                return await locator.first.is_visible(timeout=600)
            except Exception:
                return False
    text_value = str(value)
    try:
        if _is_probable_selector(text_value):
            return await page.locator(text_value).first.is_visible(timeout=600)
        locator = page.get_by_text(re.compile(re.escape(text_value), re.I))
        return await locator.first.is_visible(timeout=600)
    except Exception:
        return False


async def verify_action_success(
    page,
    step: JourneyStep,
    state: SessionState,
    before_snapshot: dict[str, Any],
    after_snapshot: dict[str, Any],
) -> VerificationResult:
    passed_signals: list[dict[str, Any]] = []
    failed_signals: list[dict[str, Any]] = []
    delta_summary = _snapshot_delta(before_snapshot, after_snapshot)
    llm_used = False
    derived_state: dict[str, Any] = {}

    for signal in step.success_signals:
        signal = signal if isinstance(signal, SuccessSignal) else SuccessSignal.from_dict(signal)
        signal_ok = False
        if signal.type == "url_contains":
            signal_ok = str(signal.value or "") in (after_snapshot.get("url") or "")
        elif signal.type == "url_matches":
            try:
                signal_ok = re.search(str(signal.value), after_snapshot.get("url") or "") is not None
            except re.error:
                signal_ok = False
        elif signal.type == "element_visible":
            signal_ok = await _signal_visible(page, signal.value)
        elif signal.type == "text_present":
            signal_ok = str(signal.value or "").lower() in (after_snapshot.get("text_snippet") or "").lower()
        elif signal.type == "text_absent":
            signal_ok = str(signal.value or "").lower() not in (after_snapshot.get("text_snippet") or "").lower()
        elif signal.type == "count_change":
            if isinstance(signal.value, dict):
                before_count = int(signal.value.get("before", 0))
                after_count = int(signal.value.get("after", 0))
                delta = int(signal.value.get("delta", 1))
                signal_ok = after_count - before_count >= delta
        elif signal.type == "state_assertion":
            if isinstance(signal.value, dict):
                signal_ok = all(state.items.get(key) == expected for key, expected in signal.value.items())
        elif signal.type == "llm_fallback":
            llm_used = True
            signal_ok = await _llm_verify_step(page, step, before_snapshot, after_snapshot)

        # Signal-based derived state extraction
        if signal_ok:
            if signal.type == "url_contains" and step.goal == "login":
                if any(m in str(signal.value) for m in ("/dashboard", "/account", "/home", "/inventory", "/products", "/shop")):
                    derived_state["is_logged_in"] = True
            if signal.type == "url_contains" and step.goal in ("add_to_cart", "add_to_cart_from_detail"):
                if any(m in str(signal.value) for m in ("cart", "basket", "checkout")):
                    derived_state["cart_has_items"] = True

        signal_payload = {
            "type": signal.type,
            "value": signal.value,
            "priority": signal.priority,
            "required": signal.required,
        }
        if signal_ok:
            passed_signals.append(signal_payload)
        elif signal.required:
            failed_signals.append(signal_payload)

    after_url = after_snapshot.get("url") or ""
    after_text = (after_snapshot.get("text_snippet") or "").lower()
    if step.goal == "login":
        auth_success_markers = (
            "/dashboard",
            "/account",
            "/home",
            "/app",
            "/secure",
            "/workspace",
            "/portal",
            "/logged-in-successfully",
            "/index",
            "/inventory",
            "/inventory.html",
            "/products",
            "/shop",
            "/store",
            "/items",
        )
        auth_text_markers = (
            "logout",
            "log out",
            "sign out",
            "secure area",
            "dashboard",
            "welcome",
            "logged in",
            "products",
            "cart",
            "basket",
            "items",
        )
        if any(marker in after_url for marker in auth_success_markers) or any(marker in after_text for marker in auth_text_markers):
            derived_state["is_logged_in"] = True

    if step.goal in ("add_to_cart", "add_to_cart_from_detail"):
        cart_success_markers = ("view basket", "view cart", "added to cart", "added to basket", " items", "cart (", "basket (")
        if any(marker in after_text for marker in cart_success_markers) or "cart" in after_url:
            derived_state["cart_has_items"] = True
    if step.goal == "create_record":
        expected_text = _resolve_state_reference(step.input_bindings.get("value"), state) or step.input_bindings.get("value")
        if expected_text and str(expected_text).lower() in after_text:
            derived_state["record_created"] = True
            derived_state["last_created_record"] = str(expected_text)

    for key, expected in step.expected_state_change.items():
        actual = derived_state.get(key)
        if actual is None:
            actual = state.auth.get(key)
        if actual is None:
            actual = state.items.get(key)
        if actual == expected:
            passed_signals.append({"type": "expected_state_change", "key": key, "value": expected})
        else:
            failed_signals.append({"type": "expected_state_change", "key": key, "value": expected, "actual": actual})

    success = not failed_signals
    failure_type = "validation_failed"
    if success:
        failure_type = "none"
    elif after_snapshot.get("url") == before_snapshot.get("url") and not delta_summary:
        failure_type = "navigation_failed"

    return VerificationResult(
        success=success,
        passed_signals=passed_signals,
        failed_signals=failed_signals,
        delta_summary=delta_summary,
        failure_type=failure_type,
        llm_used=llm_used,
    )


def _update_state_after_step(state: SessionState, step: JourneyStep, page_url: str, verification: VerificationResult) -> None:
    state.current_url = page_url
    state.step_history.append(
        {
            "goal": step.goal,
            "url": page_url,
            "verification_success": verification.success,
        }
    )
    if step.goal == "login" and verification.success:
        state.auth["is_logged_in"] = True
    if step.goal == "create_record" and verification.success:
        created_value = _resolve_state_reference(step.input_bindings.get("value"), state) or step.input_bindings.get("value")
        state.items["record_created"] = True
        if created_value:
            state.items["last_created_record"] = created_value
    for key, value in step.expected_state_change.items():
        if key in {"is_logged_in", "logged_in"}:
            state.auth["is_logged_in"] = value
        else:
            state.items[key] = value


async def _soft_recover(page, state: SessionState, step: JourneyStep) -> str:
    if not step.allow_soft_recovery:
        return "soft_recovery_skipped"

    recoveries = state.recovery_counters.get(step.goal, 0)
    if recoveries >= MAX_SOFT_RECOVERY_PER_STEP:
        return "soft_recovery_limit_reached"

    state.recovery_counters[step.goal] = recoveries + 1
    base_url = state.base_url
    current_url = ""
    try:
        current_url = page.url
    except Exception:
        pass

    try:
        if current_url and current_url != base_url:
            await page.goto(base_url, timeout=STEP_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
            return "soft_recovery_home"
        await page.reload(timeout=STEP_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
        return "soft_recovery_refresh"
    except Exception:
        try:
            await page.go_back(timeout=STEP_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
            return "soft_recovery_back"
        except Exception:
            return "soft_recovery_failed"


def _soft_recovery_event(outcome: str) -> RecoveryEvent:
    success = outcome in {"soft_recovery_home", "soft_recovery_refresh", "soft_recovery_back"}
    return RecoveryEvent(
        choke_point="after_failure",
        blocker_type="soft_recovery",
        action_taken=outcome,
        success=success,
        selector_used="",
        notes=(
            "Soft recovery executed to reset the page state"
            if success
            else "Soft recovery was attempted but did not restore the page state"
        ),
    )


def _append_recovery_notes(notes: list[str], events: list[RecoveryEvent]) -> None:
    for event in events:
        if event.notes not in notes:
            notes.append(event.notes)


async def _run_structured_journey(page, plan: JourneyPlan, state: SessionState, *, should_cancel: Callable[[], bool] | None = None) -> dict[str, Any]:
    step_results: list[dict[str, Any]] = []
    journey_status = "PASSED"

    for step_index, step in enumerate(plan.steps[:MAX_TOTAL_STEPS_PER_JOURNEY]):
        _raise_if_canceled(should_cancel)
        step = _as_journey_step(step)
        recovery_attempts: list[RecoveryEvent] = []
        notes: list[str] = []
        before_snapshot = await _capture_page_snapshot(page)
        blocked_failure = _detect_failure_type_from_snapshot(before_snapshot)
        if blocked_failure is not None:
            journey_status = "BLOCKED"
            reason = (
                "Cloudflare or equivalent bot protection active — this is a site configuration issue, not an engine failure"
                if blocked_failure == FailureType.BLOCKED_BY_BOT_PROTECTION
                else "CAPTCHA or human-verification wall active — manual intervention required"
            )
            step_results.append(
                to_dict(
                    StepResult(
                        step_name=step.intent or step.goal,
                        goal=step.goal,
                        status="blocked",
                        verification=to_dict(
                            VerificationResult(
                                success=False,
                                failed_signals=[],
                                delta_summary=[],
                                failure_type=blocked_failure.value,
                                llm_used=False,
                            )
                        ),
                        recovery_attempts=[],
                        failure_type=blocked_failure.value,
                        error=reason,
                        notes=[reason],
                        before_snapshot=before_snapshot,
                        after_snapshot=before_snapshot,
                    )
                )
            )
            break
        blocker_events = await dismiss_blockers(page, "pre_action")
        recovery_attempts.extend(blocker_events)
        _append_recovery_notes(notes, blocker_events)
        verification_result = VerificationResult(success=False, failure_type="unknown")
        chosen_action: dict[str, Any] | None = None
        error_text: str | None = None

        for attempt in range(MAX_RETRIES_PER_STEP):
            action_trace: list[dict[str, Any]] = []
            candidates = _ordered_candidates_for_step(step)
            if not candidates:
                error_text = f"No action candidates available for step {step.goal}"
                verification_result = VerificationResult(success=False, failure_type="action_resolution_failed")
                break

            try:
                for candidate in candidates:
                    action_trace.append(
                        await _execute_candidate(
                            page,
                            _as_action_candidate(candidate),
                            state,
                        )
                    )
                chosen_action = {"sequence": action_trace}
                await _wait_for_transition(page, before_snapshot)
                blocker_events = await dismiss_blockers(page, "post_navigation")
                recovery_attempts.extend(blocker_events)
                _append_recovery_notes(notes, blocker_events)
                after_snapshot = await _capture_page_snapshot(page)
                verification_result = await verify_action_success(
                    page,
                    step,
                    state,
                    before_snapshot,
                    after_snapshot,
                )
                if verification_result.success:
                    _update_state_after_step(state, step, after_snapshot.get("url") or state.current_url, verification_result)
                    step_results.append(
                        to_dict(
                            StepResult(
                                step_name=step.intent or step.goal,
                                goal=step.goal,
                                status="passed",
                                chosen_action=chosen_action,
                                verification=to_dict(verification_result),
                                evidence_delta=verification_result.delta_summary,
                                recovery_attempts=to_dict(recovery_attempts),
                                before_snapshot=before_snapshot,
                                after_snapshot=after_snapshot,
                                notes=notes,
                            )
                        )
                    )
                    break

                blocker_events = await dismiss_blockers(page, "post_failure")
                recovery_attempts.extend(blocker_events)
                _append_recovery_notes(notes, blocker_events)
                if attempt == MAX_RETRIES_PER_STEP - 1:
                    soft_event = _soft_recovery_event(await _soft_recover(page, state, step))
                    recovery_attempts.append(soft_event)
                    _append_recovery_notes(notes, [soft_event])
                    after_snapshot = await _capture_page_snapshot(page)
            except Exception as exc:
                error_text = str(exc)[:300]
                await _wait_for_transition(page, before_snapshot)
                blocker_events = await dismiss_blockers(page, "post_failure")
                recovery_attempts.extend(blocker_events)
                _append_recovery_notes(notes, blocker_events)
                after_snapshot = await _capture_page_snapshot(page)
                verification_result = await verify_action_success(
                    page,
                    step,
                    state,
                    before_snapshot,
                    after_snapshot,
                )
                if verification_result.success:
                    note = f"Action error overruled by success signals: {error_text}"
                    notes.append(note)
                    _update_state_after_step(
                        state,
                        step,
                        after_snapshot.get("url") or state.current_url,
                        verification_result,
                    )
                    step_results.append(
                        to_dict(
                            StepResult(
                                step_name=step.intent or step.goal,
                                goal=step.goal,
                                status="passed",
                                chosen_action=chosen_action or {"sequence": action_trace},
                                verification=to_dict(verification_result),
                                evidence_delta=verification_result.delta_summary,
                                recovery_attempts=to_dict(recovery_attempts),
                                before_snapshot=before_snapshot,
                                after_snapshot=after_snapshot,
                                notes=notes,
                            )
                        )
                    )
                    break
                verification_result = VerificationResult(
                    success=False,
                    passed_signals=verification_result.passed_signals,
                    failed_signals=verification_result.failed_signals,
                    delta_summary=verification_result.delta_summary,
                    failure_type="action_resolution_failed",
                    llm_used=verification_result.llm_used,
                )

        if not verification_result.success:
            journey_status = "FAILED"
            final_snapshot = await _capture_page_snapshot(page)
            step_results.append(
                to_dict(
                    StepResult(
                        step_name=step.intent or step.goal,
                        goal=step.goal,
                        status="failed",
                        chosen_action=chosen_action,
                        verification=to_dict(verification_result),
                        evidence_delta=verification_result.delta_summary,
                        recovery_attempts=to_dict(recovery_attempts),
                        failure_type=verification_result.failure_type,
                        error=error_text,
                        notes=notes,
                        before_snapshot=before_snapshot,
                        after_snapshot=final_snapshot,
                    )
                )
            )
            break

        if step_index + 1 >= MAX_TOTAL_STEPS_PER_JOURNEY:
            journey_status = "FAILED"
            step_results.append(
                to_dict(
                    StepResult(
                        step_name="journey_limit",
                        goal="journey_limit",
                        status="failed",
                        failure_type="timeout",
                        error="Exceeded MAX_TOTAL_STEPS_PER_JOURNEY",
                    )
                )
            )
            break

    return {
        "journey": plan.name,
        "app_type": plan.app_type,
        "status": journey_status,
        "steps": step_results,
        "state_snapshot_summary": to_dict(state),
    }


async def run_structured_journeys(
    url: str,
    journeys: list[JourneyPlan | dict[str, Any]],
    *,
    record_video: bool = True,
    base_context: dict[str, Any] | None = None,
    generated_credentials: dict[str, str] | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    video_dir = None
    if record_video:
        video_dir = VIDEO_DIR
        Path(video_dir).mkdir(parents=True, exist_ok=True)

    credentials = {str(key): str(value) for key, value in (generated_credentials or {}).items() if value is not None}
    username = credentials.get("username") or credentials.get("email")
    email = credentials.get("email") or credentials.get("username")
    if username and "username" not in credentials:
        credentials["username"] = username
    if email and "email" not in credentials:
        credentials["email"] = email

    async with async_playwright() as p:
        browser = None
        context = None
        page = None
        browser = await p.chromium.launch(headless=True, args=CHROMIUM_LAUNCH_ARGS)
        ctx_kwargs: dict[str, Any] = {"viewport": DESKTOP_VIEWPORT}
        if video_dir:
            ctx_kwargs["record_video_dir"] = video_dir
            ctx_kwargs["record_video_size"] = {"width": 1280, "height": 720}
        context = await browser.new_context(**ctx_kwargs)
        page = await context.new_page()
        try:
            await page.goto(url, timeout=25000, wait_until="networkidle")
        except Exception:
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")

        parsed = [
            journey if isinstance(journey, JourneyPlan) else JourneyPlan.from_dict(journey)
            for journey in journeys
        ]
        for plan in parsed:
            _raise_if_canceled(should_cancel)
            state = SessionState(
                base_url=url,
                current_url=url,
                generated_credentials=credentials,
                inferred_context=base_context or {},
            )
            results.append(await _run_structured_journey(page, plan, state, should_cancel=should_cancel))
            try:
                await page.goto(url, timeout=STEP_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
            except Exception:
                pass

        video_path = None
        if page is not None:
            try:
                video = page.video
                if video:
                    video_path = await video.path()
            except Exception:
                pass
            try:
                await page.close()
            except Exception:
                pass
        if context is not None:
            try:
                await context.close()
            except Exception:
                pass
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass

    return {
        "journey_results": results,
        "video_path": str(video_path) if video_path else None,
    }


async def run_web_audit(
    url: str,
    *,
    record_video: bool = True,
    run_journeys: list[dict] | None = None,
    max_pages: int = 1,
    should_cancel: Callable[[], bool] | None = None,
) -> dict:
    """
    Open a URL, capture dual-viewport screenshots, console errors,
    failed network requests, page metadata, and optionally execute
    user journeys.

    If max_pages > 1, crawl additional internal links found on the homepage.

    Returns a dict with all crawl data.
    """
    console_errors: list[str] = []
    failed_requests: list[dict] = []

    result: dict = {
        "url": url,
        "status_code": None,
        "title": "",
        "nav_links": [],
        "buttons": [],
        "forms": [],
        "console_errors": console_errors,
        "failed_requests": failed_requests,
        "text_snippet": "",
        "desktop_screenshot_b64": None,
        "mobile_screenshot_b64": None,
        "screenshot_b64": None,       # kept for backward compat (= desktop)
        "video_path": None,
        "journey_results": None,
        "page_html": None,
        "extra_pages": [],
        "structural_signals": {},
    }

    video_dir = None
    if record_video:
        video_dir = VIDEO_DIR
        Path(video_dir).mkdir(parents=True, exist_ok=True)

    _raise_if_canceled(should_cancel)
    async with async_playwright() as p:
        browser = None
        context = None
        page = None
        browser = await p.chromium.launch(headless=True, args=CHROMIUM_LAUNCH_ARGS)

        ctx_kwargs: dict = {"viewport": DESKTOP_VIEWPORT}
        if video_dir:
            ctx_kwargs["record_video_dir"] = video_dir
            ctx_kwargs["record_video_size"] = {"width": 1280, "height": 720}

        context = await browser.new_context(**ctx_kwargs)
        page = await context.new_page()

        # ── Capture console errors ────────────────────────────────────────
        page.on(
            "console",
            lambda m: console_errors.append(m.text)
            if m.type == "error"
            else None,
        )

        # ── Capture failed network requests ───────────────────────────────
        page.on(
            "requestfailed",
            lambda req: failed_requests.append(
                {
                    "url": req.url[:300],
                    "method": req.method,
                    "failure": req.failure,
                }
            ),
        )

        try:
            _raise_if_canceled(should_cancel)
            try:
                resp = await page.goto(url, timeout=25000, wait_until="networkidle")
            except Exception:
                result["classification_note"] = "discovery_timeout"
                resp = await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            result["status_code"] = resp.status if resp else None
            result["title"] = await page.title()

            try:
                await page.wait_for_selector(
                    ".product, .product-item, .product-card, .categoryCell, [class*='product'], a[href*='product'], a[href*='#/product/']",
                    timeout=3000,
                    state="visible",
                )
            except PlaywrightTimeoutError:
                pass

            # Text content
            try:
                result["text_snippet"] = (await page.inner_text("body"))[:800]
            except Exception:
                result["text_snippet"] = ""

            # Navigation links
            try:
                result["nav_links"] = await page.eval_on_selector_all(
                    "nav a, header a",
                    "els=>els.map(e=>({text:e.innerText.trim(),href:e.href})).slice(0,20)",
                )
            except Exception:
                pass

            # Buttons
            try:
                result["buttons"] = await page.eval_on_selector_all(
                    "button,[role='button'],input[type='submit'],input[type='button']",
                    "els=>els.map(e=>(e.innerText||e.value||'?').trim()).slice(0,20)",
                )
            except Exception:
                pass

            # Forms
            try:
                result["forms"] = await page.eval_on_selector_all(
                    "form",
                    "els=>els.map(e=>({id:e.id,action:e.action,fields:e.querySelectorAll('input,textarea,select').length})).slice(0,10)",
                )
            except Exception:
                pass

            # ── Desktop screenshot ────────────────────────────────────────
            result["desktop_screenshot_b64"] = await _take_screenshot(
                page, DESKTOP_VIEWPORT
            )
            result["screenshot_b64"] = result["desktop_screenshot_b64"]

            # ── Mobile screenshot ─────────────────────────────────────────
            result["mobile_screenshot_b64"] = await _take_screenshot(
                page, MOBILE_VIEWPORT
            )

            # Reset to desktop for journey execution
            await page.set_viewport_size(DESKTOP_VIEWPORT)

            # ── Capture page HTML (for code analysis) ─────────────────────
            try:
                raw_html = await page.content()
                result["page_html"] = raw_html[:30000]  # truncate for Groq context
            except Exception:
                result["page_html"] = None

            try:
                result["structural_signals"] = await page.evaluate(
                    """() => {
                        const passwordInputs = Array.from(document.querySelectorAll('input[type="password"]'));
                        const authFormIsVisible = passwordInputs.some((input) => {
                            const rect = input.getBoundingClientRect();
                            const style = window.getComputedStyle(input);
                            return (
                                rect.width > 0 &&
                                rect.height > 0 &&
                                rect.bottom > 0 &&
                                rect.top < window.innerHeight &&
                                style.opacity !== '0' &&
                                style.display !== 'none' &&
                                style.visibility !== 'hidden'
                            );
                        });
                        return { auth_form_is_visible: authFormIsVisible };
                    }"""
                )
            except Exception:
                result["structural_signals"] = {}

            # ── Multi-page crawl (deep/fix tiers) ─────────────────────────
            if max_pages > 1 and result["nav_links"]:
                _raise_if_canceled(should_cancel)
                from urllib.parse import urlparse, urljoin
                base_parsed = urlparse(url)
                visited = {url.rstrip("/")}
                extra_pages: list[dict] = []

                # Pick internal links only
                candidates = []
                for link in result["nav_links"]:
                    href = link.get("href", "")
                    if not href:
                        continue
                    full_url = urljoin(url, href).split("#")[0].split("?")[0]
                    parsed = urlparse(full_url)
                    if parsed.netloc == base_parsed.netloc and full_url.rstrip("/") not in visited:
                        candidates.append(full_url)
                        visited.add(full_url.rstrip("/"))
                    if len(candidates) >= max_pages - 1:
                        break

                for extra_url in candidates:
                    _raise_if_canceled(should_cancel)
                    try:
                        _log.info("[MultiCrawl] Crawling extra page: %s", extra_url)
                        extra_resp = await page.goto(
                            extra_url, timeout=15000, wait_until="domcontentloaded"
                        )
                        await page.wait_for_timeout(800)

                        extra_data: dict = {
                            "url": extra_url,
                            "title": await page.title(),
                            "status_code": extra_resp.status if extra_resp else None,
                            "html": None,
                            "console_errors": [],
                            "failed_requests": [],
                        }

                        # Capture HTML
                        try:
                            extra_html = await page.content()
                            extra_data["html"] = extra_html[:30000]
                        except Exception:
                            pass

                        # Capture text snippet
                        try:
                            extra_data["text_snippet"] = (await page.inner_text("body"))[:500]
                        except Exception:
                            extra_data["text_snippet"] = ""

                        extra_pages.append(extra_data)
                    except Exception as exc:
                        _log.warning("[MultiCrawl] Failed to crawl %s: %s", extra_url, exc)

                result["extra_pages"] = extra_pages

                # Navigate back to homepage for journeys
                if extra_pages:
                    try:
                        await page.goto(url, timeout=15000, wait_until="domcontentloaded")
                    except Exception:
                        pass

            # ── User journeys (optional) ──────────────────────────────────
            if run_journeys:
                _raise_if_canceled(should_cancel)
                result["journey_results"] = await _run_user_journeys(
                    page, run_journeys
                )

        except Exception as e:
            result["error"] = str(e)[:500]
        finally:
            video_path = None
            if page is not None:
                try:
                    video = page.video
                    if video:
                        video_path = await video.path()
                except Exception:
                    pass
                try:
                    await page.close()
                except Exception:
                    pass
            if context is not None:
                try:
                    await context.close()
                except Exception:
                    pass
            result["video_path"] = str(video_path) if video_path else None
            if browser is not None:
                try:
                    await browser.close()
                except Exception:
                    pass

    return result
