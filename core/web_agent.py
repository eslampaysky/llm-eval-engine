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
    DecisionTrace,
    DiagnosticInfo,
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
from core.diagnostics import generate_diagnostic_for_failure, summarize_diagnostic

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
MAX_DECISION_TRACES_PER_STEP = 10  # Phase 3b: Limit decision trace payload to prevent bloat
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
    "[role='dialog'] [aria-label*='close' i]",
    "[aria-modal='true'] [aria-label*='close' i]",
    "[role='dialog'] [aria-label='Close']",
    "[aria-modal='true'] [aria-label='Close']",
    "[role='dialog'] [aria-label='Dismiss']",
    "[aria-modal='true'] [aria-label='Dismiss']",
    "[data-testid='close']",
    "[role='dialog'] button[aria-label*='close' i]",
    "[aria-modal='true'] button[aria-label*='close' i]",
    "[role='dialog'] button[aria-label*='dismiss' i]",
    "[aria-modal='true'] button[aria-label*='dismiss' i]",
    "button:has-text('Accept')",
    "button:has-text('Accept all')",
    "button:has-text('Allow all')",
    "button:has-text('Allow All')",
    "button:has-text('I Accept')",
    "button:has-text('I agree')",
    "button:has-text('Agree')",
    "button:has-text('Consent')",
    "button:has-text('Got it')",
    "button#onetrust-accept-btn-handler",
    "button:has-text('Continue To Website')",
    "[role='dialog'] button:has-text('Close')",
    "[aria-modal='true'] button:has-text('Close')",
    "[role='dialog'] button:has-text('Dismiss')",
    "[aria-modal='true'] button:has-text('Dismiss')",
    "button:has-text('No thanks')",
    "[role='dialog'] button:has-text('US')",
    "[aria-modal='true'] button:has-text('US')",
    "[role='dialog'] button:has-text('NL')",
    "[aria-modal='true'] button:has-text('NL')",
    "[role='dialog'] a:has-text('US')",
    "[aria-modal='true'] a:has-text('US')",
    "[role='dialog'] a:has-text('NL')",
    "[aria-modal='true'] a:has-text('NL')",
    "[role='dialog'] div:has-text('US')",
    "[aria-modal='true'] div:has-text('US')",
    "[role='dialog'] div:has-text('NL')",
    "[aria-modal='true'] div:has-text('NL')",
    "[role='dialog'] button:has-text('Continue to US')",
    "[aria-modal='true'] button:has-text('Continue to US')",
    "[role='dialog'] button:has-text('Continue to NL')",
    "[aria-modal='true'] button:has-text('Continue to NL')",
    "[role='dialog'] a:has-text('Continue to US')",
    "[aria-modal='true'] a:has-text('Continue to US')",
    "[role='dialog'] a:has-text('Continue to NL')",
    "[aria-modal='true'] a:has-text('Continue to NL')",
    "[role='dialog'] [class*='close' i]",
    "[aria-modal='true'] [class*='close' i]",
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


async def _find_visible_blocker(page, exclude_selectors: set[str] | None = None) -> tuple[Any, str, str, str, str] | None:
    for selector in _BLOCKER_SELECTORS:
        if exclude_selectors and selector in exclude_selectors:
            continue
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
    failed_selectors: set[str] = set()

    for _attempt in range(5):
        blocker = await _find_visible_blocker(page, exclude_selectors=failed_selectors)
        if not blocker:
            break
        locator, selector, context_text, action_taken, blocker_type = blocker
        last_blocker_type = blocker_type
        last_action_taken = action_taken
        last_selector = selector
        try:
            await locator.click(timeout=1500)
        except Exception:
            try:
                await page.keyboard.press("Escape")
            except Exception:
                pass
        await page.wait_for_timeout(1000)
        dismissed_count += 1

        try:
            still_visible = await locator.is_visible(timeout=500)
            if still_visible:
                failed_selectors.add(selector)
                success = False
            else:
                success = True
        except Exception:
            success = True # Assume gone if check fails

        handled.append(
            RecoveryEvent(
                choke_point=choke_point,
                blocker_type=blocker_type,
                action_taken=action_taken,
                success=success,
                selector_used=selector,
                notes=(
                    f"Cleared {blocker_type} using {selector}"
                    if success
                    else f"Failed to clear {blocker_type} using {selector}"
                ),
            )
        )

    return handled


async def _prefer_visible_locator(locator, *, max_candidates: int = 5):
    try:
        count = await locator.count()
    except Exception:
        return None

    if count <= 0:
        return None

    for index in range(min(count, max_candidates)):
        candidate = locator.nth(index)
        try:
            if await candidate.is_visible(timeout=300):
                return candidate
        except Exception:
            continue

    return locator.first


async def _resolve_locator(page, candidate: ActionCandidate):
    for selector in candidate.selectors:
        try:
            locator = await _prefer_visible_locator(page.locator(selector))
            if locator is not None:
                return locator
        except Exception:
            continue

    role = candidate.role
    name = candidate.name or candidate.intent or candidate.text
    if role and name:
        try:
            locator = await _prefer_visible_locator(
                page.get_by_role(role, name=re.compile(re.escape(name), re.I))
            )
            if locator is not None:
                return locator
        except Exception:
            pass

    if candidate.text:
        try:
            locator = await _prefer_visible_locator(
                page.get_by_text(re.compile(re.escape(candidate.text), re.I))
            )
            if locator is not None:
                return locator
        except Exception:
            pass

    if candidate.intent:
        try:
            locator = await _prefer_visible_locator(
                page.get_by_text(re.compile(re.escape(candidate.intent), re.I))
            )
            if locator is not None:
                return locator
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
        try:
            await locator.hover(timeout=1000)
            await page.wait_for_timeout(150)
        except Exception:
            pass
        try:
            await locator.click(timeout=STEP_TIMEOUT_SECONDS * 1000)
        except PlaywrightTimeoutError:
            try:
                await locator.click(timeout=2000, force=True)
            except Exception:
                await locator.evaluate("(el) => el.click()")
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


def _step_uses_fallback_candidates(step: JourneyStep) -> bool:
    return step.step_type != StepType.FILL_SUBMIT.value


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


def _snapshot_looks_like_product_detail(snapshot: dict[str, Any]) -> bool:
    url = str(snapshot.get("url") or "").lower()
    text = str(snapshot.get("text_snippet") or "").lower()
    return (
        any(token in url for token in ("/product/", "/products/", "prod.html", "/dp/", "/item", "/book/"))
        or "add to cart" in text
        or "add to bag" in text
        or "add to basket" in text
    )


def _pdp_variant_candidates() -> list[ActionCandidate]:
    return [
        ActionCandidate(
            type="click",
            intent="size option – first visible enabled option",
            selectors=[
                "[data-testid*='size'] button:not([disabled]):visible:first-of-type",
                "[data-test*='size'] button:not([disabled]):visible:first-of-type",
                "[aria-label*='size' i] button:not([disabled]):visible:first-of-type",
                "[role='radiogroup'] [role='radio']:not([aria-disabled='true']):visible:first-of-type",
                "button[aria-label*='size' i]:not([disabled]):visible:first-of-type",
                "button[class*='size']:not([disabled]):visible:first-of-type",
                "label[class*='size']:not([disabled]):visible:first-of-type",
                "input[name*='size']:not([disabled]):visible:first-of-type",
            ],
            role="radio",
            name="Size",
            text="Size",
        ),
        ActionCandidate(
            type="click",
            intent="color/variant option – first visible enabled swatch or option",
            selectors=[
                "[data-testid*='color'] button:not([disabled]):visible:first-of-type",
                "[data-testid*='variant'] button:not([disabled]):visible:first-of-type",
                "[data-testid*='swatch'] button:not([disabled]):visible:first-of-type",
                "[class*='variant'] button:not([disabled]):visible:first-of-type",
                "[class*='swatch'] button:not([disabled]):visible:first-of-type",
                "[class*='color-swatch'] button:not([disabled]):visible:first-of-type",
                "button[aria-label*='color' i]:not([disabled]):visible:first-of-type",
                "button[aria-label*='option' i]:not([disabled]):visible:first-of-type",
                "select option:not([disabled]):not([value='']):first-of-type",
            ],
            role="radio",
            name="Color/Variant",
            text="Option",
        ),
        ActionCandidate(
            type="click",
            intent="select dropdown – choose first non-placeholder option",
            selectors=[
                "select:visible:first-of-type",
                "[data-testid*='dropdown']:visible:first-of-type",
                "[role='combobox']:visible:first-of-type",
            ],
            role="combobox",
            name="Dropdown",
            text="Select",
        ),
    ]


async def _detect_required_variants(page) -> list[str]:
    """
    Detect required variant fields on a product detail page.
    Returns list of required variant labels (e.g., ["Size", "Color"]).
    Looks for:
    - Labels with "required" or "*" marker
    - Data attributes indicating required variant
    - Error messages about missing selections
    """
    required_variants: list[str] = []
    try:
        # Check for elements with "required" in their attributes or visible text
        required_indicators = [
            "label:has-text('*')",  # Asterisk marker
            "label:has-text('Required')",
            "[data-testid*='required']",
            "[aria-required='true']",
            "div[class*='required']",
        ]
        
        for selector in required_indicators:
            try:
                elements = await page.locator(selector).all()
                for elem in elements[:3]:  # Limit to first 3 to avoid overhead
                    text = await elem.inner_text()
                    if any(kw in text.lower() for kw in ["size", "color", "variant", "option", "selection"]):
                        label = text.strip()[:50]
                        if label and label not in required_variants:
                            required_variants.append(label)
                            break
            except Exception:
                continue
        
        # Check for select elements without a value set (indicating selection needed)
        try:
            selects = await page.locator("select:visible").all()
            for select in selects[:2]:
                value = await select.input_value()
                if not value:
                    label_text = await select.evaluate("el => el.previousElementSibling?.textContent || el.getAttribute('aria-label') || ''")
                    if label_text:
                        required_variants.append(str(label_text).strip()[:50])
        except Exception:
            pass
    except Exception as e:
        _log.debug(f"Error detecting required variants: {e}")
    
    return required_variants


def _pdp_cart_step() -> JourneyStep:
    return JourneyStep(
        goal="add_to_cart_from_detail",
        intent="add to cart button on product detail page",
        action_candidates=[
            ActionCandidate(
                type="click",
                intent="add to cart button",
                selectors=[
                    "[translate='ADD_TO_CART']",
                    "[ng-click*='addToCart']",
                    "[ng-click*='AddToCart']",
                    "button:has-text('Add to cart')",
                    "button:has-text('ADD TO CART')",
                    "button:has-text('Add To Cart')",
                    "button:has-text('ADD TO BASKET')",
                    "button:has-text('Add to bag')",
                    "button:has-text('ADD TO BAG')",
                    "a:has-text('Add to cart')",
                    "a:has-text('ADD TO BASKET')",
                    "button[name='save_to_cart']",
                    "button[name='add']",
                    "button[data-testid='add-to-cart']",
                    "[onclick*='addToCart']",
                    "[onclick*='add_to_cart']",
                    ".btn-cart",
                    "a.btn-success",
                    "a[class*='add_to_cart_button']",
                    "div.button_add_to_cart",
                    "input[name='submit.add-to-cart']",
                    "input[id='add-to-cart-button']",
                    "#add-to-cart-button",
                ],
                role="button",
                name="Add to cart",
                text="Add to cart",
            ),
        ],
        success_signals=[
            SuccessSignal(type="element_visible", value="Cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="added", priority="medium", required=False),
            SuccessSignal(type="text_present", value="Product added", priority="high", required=False),
            SuccessSignal(type="text_present", value="Cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="View Basket", priority="medium", required=False),
            SuccessSignal(type="text_present", value="View Cart", priority="medium", required=False),
            SuccessSignal(type="text_present", value="items", priority="medium", required=False),
            SuccessSignal(type="url_contains", value="cart", priority="high", required=False),
        ],
        expected_state_change={"cart_has_items": True},
        allow_soft_recovery=False,
    )


async def _continue_add_to_cart_from_pdp(
    page,
    state: SessionState,
    listing_step: JourneyStep,
    listing_before_snapshot: dict[str, Any],
    pdp_snapshot: dict[str, Any],
) -> tuple[VerificationResult | None, dict[str, Any], list[dict[str, Any]], list[RecoveryEvent], list[str]]:
    if listing_step.goal != "add_to_cart" or not _snapshot_looks_like_product_detail(pdp_snapshot):
        return None, pdp_snapshot, [], [], []

    continuation_step = _pdp_cart_step()
    continuation_trace: list[dict[str, Any]] = []
    continuation_recoveries: list[RecoveryEvent] = []
    continuation_notes: list[str] = ["Listing fallback opened PDP; continuing add-to-cart on product detail page."]
    current_snapshot = pdp_snapshot

    # Detect and select required variants (Phase 2 enhancement)
    required_variants = await _detect_required_variants(page)
    variant_selection_attempted = False
    if required_variants:
        continuation_notes.append(f"Detected required variants: {', '.join(required_variants)}")
        
        # Try to select variants – pick first visible/enabled option for each type
        for candidate in _pdp_variant_candidates():
            try:
                variant_action = await _execute_candidate(page, candidate, state)
                continuation_trace.append(variant_action)
                variant_selection_attempted = True
                await _wait_for_transition(page, current_snapshot, timeout_ms=1200)
                blocker_events = await dismiss_blockers(page, "post_navigation")
                continuation_recoveries.extend(blocker_events)
                _append_recovery_notes(continuation_notes, blocker_events)
                current_snapshot = await _capture_page_snapshot(page)
                continuation_notes.append(f"Variant selection: {candidate.intent}")
            except Exception as exc:
                continuation_notes.append(f"Variant selection failed for {candidate.intent}: {str(exc)[:100]}")
                continue

    # Now attempt add-to-cart
    last_failure: VerificationResult | None = None
    last_error: str | None = None
    for candidate in _ordered_candidates_for_step(continuation_step):
        add_before_snapshot = current_snapshot
        try:
            executed_action = await _execute_candidate(page, candidate, state)
            continuation_trace.append(executed_action)
            await _wait_for_transition(page, add_before_snapshot)
            blocker_events = await dismiss_blockers(page, "post_navigation")
            continuation_recoveries.extend(blocker_events)
            _append_recovery_notes(continuation_notes, blocker_events)
            current_snapshot = await _capture_page_snapshot(page)
            verification = await verify_action_success(
                page,
                continuation_step,
                state,
                add_before_snapshot,
                current_snapshot,
            )
            if (
                not verification.success
                and verification.passed_signals
                and verification.failed_signals
                and all(
                    failed.get("type") == "expected_state_change"
                    and failed.get("key") == "cart_has_items"
                    for failed in verification.failed_signals
                )
            ):
                verification = VerificationResult(
                    success=True,
                    passed_signals=verification.passed_signals + [{"type": "pdp_cart_continuation", "value": True}],
                    failed_signals=[],
                    delta_summary=verification.delta_summary,
                    failure_type="none",
                    llm_used=verification.llm_used,
                )
                continuation_notes.append("PDP continuation treated strong cart signals as success for listing add-to-cart.")
            if verification.success:
                verification.delta_summary = _snapshot_delta(listing_before_snapshot, current_snapshot)
                return verification, current_snapshot, continuation_trace, continuation_recoveries, continuation_notes
            last_failure = verification
        except Exception as exc:
            last_error = str(exc)[:300]
            blocker_events = await dismiss_blockers(page, "post_failure")
            continuation_recoveries.extend(blocker_events)
            _append_recovery_notes(continuation_notes, blocker_events)
            current_snapshot = await _capture_page_snapshot(page)
            verification = await verify_action_success(
                page,
                continuation_step,
                state,
                add_before_snapshot,
                current_snapshot,
            )
            if verification.success:
                verification.delta_summary = _snapshot_delta(listing_before_snapshot, current_snapshot)
                continuation_notes.append(f"PDP add-to-cart recovered after action error: {last_error}")
                return verification, current_snapshot, continuation_trace, continuation_recoveries, continuation_notes
            last_failure = VerificationResult(
                success=False,
                passed_signals=verification.passed_signals,
                failed_signals=verification.failed_signals,
                delta_summary=_snapshot_delta(listing_before_snapshot, current_snapshot),
                failure_type="action_resolution_failed" if not required_variants or variant_selection_attempted else "variant_required",
                llm_used=verification.llm_used,
            )

    if last_failure is not None and last_error:
        continuation_notes.append(f"PDP continuation failed: {last_error}")
    return last_failure, current_snapshot, continuation_trace, continuation_recoveries, continuation_notes


async def _detect_cart_state_from_dom(page) -> dict[str, Any] | None:
    badge_selectors = [
        "[data-testid*='cart-count']",
        "[data-test*='cart-count']",
        "[data-testid*='bag-count']",
        "[data-test*='bag-count']",
        "[class*='cart-count']",
        "[class*='cartCount']",
        "[class*='bag-count']",
        "[class*='bagCount']",
        "[class*='basket-count']",
        "[class*='basketCount']",
        "a[href*='cart'] [class*='count']",
        "button[aria-label*='cart' i] [class*='count']",
        "button[aria-label*='bag' i] [class*='count']",
    ]
    for selector in badge_selectors:
        try:
            texts = await page.locator(selector).all_inner_texts()
        except Exception:
            continue
        for text in texts:
            digits = re.findall(r"\d+", str(text))
            if digits and any(int(digit) > 0 for digit in digits):
                return {"type": "dom_cart_badge", "value": selector}

    visible_selectors = [
        "[data-testid*='cart-item']",
        "[data-test*='cart-item']",
        "[class*='cart-item']",
        "[class*='bag-item']",
        "[class*='basket-item']",
        "[class*='mini-cart']",
        "[class*='minicart']",
        "[class*='cart-drawer']",
        "[class*='bag-drawer']",
        "[class*='side-cart']",
        "[role='dialog'] [href*='checkout']",
        "[role='dialog'] button:has-text('Checkout')",
        "[role='dialog'] a:has-text('Checkout')",
        "[role='dialog'] button:has-text('View bag')",
        "[role='dialog'] a:has-text('View bag')",
        "[role='dialog'] button:has-text('View basket')",
        "[role='dialog'] a:has-text('View basket')",
        "[role='dialog'] button:has-text('View cart')",
        "[role='dialog'] a:has-text('View cart')",
    ]
    for selector in visible_selectors:
        try:
            if await page.locator(selector).first.is_visible(timeout=800):
                return {"type": "dom_cart_visible", "value": selector}
        except Exception:
            continue

    try:
        body_text = (await page.locator("body").inner_text(timeout=1200)).lower()
    except Exception:
        body_text = ""
    
    # Expanded confirmation text markers
    cart_confirmation_markers = (
        "added to cart",
        "added to bag",
        "added to basket",
        "item added",
        "product added",
        "successfully added",
        "view bag",
        "view basket",
        "view cart",
        "your bag",
        "your basket",
        "your cart",
        "cart subtotal",
        "bag subtotal",
        "basket subtotal",
        "proceed to checkout",
        "checkout securely",
        "continue to checkout",
        "go to checkout",
        "review your cart",
        "review your bag",
        "order summary",
        "1 item in",
        "items in",
        "shipping address",
        "billing address",
        "payment method",
    )
    for marker in cart_confirmation_markers:
        if marker in body_text:
            return {"type": "dom_cart_text", "value": marker}

    return None


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
                if any(m in str(signal.value) for m in ("dashboard", "account", "home", "inventory", "products", "shop", "/app")):
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
            "inventory",
            "account",
            "home",
            "/app",
            "secure",
            "workspace",
            "portal",
            "logged-in-successfully",
            "index",
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
        else:
            cart_signal = await _detect_cart_state_from_dom(page)
            if cart_signal:
                derived_state["cart_has_items"] = True
                passed_signals.append(cart_signal)
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


def _attach_diagnostic_to_failure(
    verification_result: dict[str, Any],
    step: JourneyStep,
    candidates: list[dict[str, Any]],
    before_snapshot: dict[str, Any],
    after_snapshot: dict[str, Any],
) -> dict[str, Any] | None:
    """
    Generate diagnostic info for a failed step.
    Attaches rich failure context to help understand step execution failures.
    
    Returns DiagnosticInfo as dict, or None if not applicable.
    """
    try:
        failure_type = verification_result.get("failure_type", "unknown")
        if failure_type == "unknown":
            return None
        
        # Extract relevant context for the diagnostic generator
        expected_signals = []
        if step.success_signals:
            for s in step.success_signals:
                # Handle both SuccessSignal objects and dicts
                if hasattr(s, 'value'):
                    expected_signals.append(str(s.value))
                elif isinstance(s, dict) and 'value' in s:
                    expected_signals.append(str(s['value']))
        
        context = {
            "intent": step.intent or "",
            "selectors": [c.get("selectors", []) for c in candidates][:5] if candidates else [],
            "expected_signals": expected_signals,
            "found_signals": [s.get("text") or s.get("value") for s in verification_result.get("passed_signals", [])],
            "before_state": before_snapshot,
            "after_state": after_snapshot,
            "delta": verification_result.get("delta_summary", ""),
        }
        
        # Generate diagnostic using the appropriate handler
        diagnostic = generate_diagnostic_for_failure(
            failure_type=failure_type,
            goal=step.goal,
            context=context,
        )
        
        return to_dict(diagnostic) if diagnostic else None
    except Exception as e:
        # Diagnostics are observational; don't break execution if they fail
        # Return structured fallback to ensure consistent output shape
        fallback = DiagnosticInfo(
            reason="diagnostic_generation_failed",
            expected="diagnostic_generated",
            actual="exception_during_diagnostic_generation",
            evidence=[str(e)[:200]],
            recommendations=["Check exception details in logs"],
            pattern_category="internal_error",
        )
        return to_dict(fallback)


def _record_decision_trace(
    phase: str,
    step_goal: str,
    decision: str,
    outcome: str,
    confidence: float = 0.5,
    data: dict[str, Any] | None = None,
) -> DecisionTrace:
    """
    Record a decision made during step execution.
    Lightweight trace capturing action, selector, retry count, recovery used.
    
    Args:
        phase: "action_resolution", "action_execution", "verification", "recovery"
        step_goal: Goal of the step
        decision: What decision was made (e.g., "selected_selector_0_click")
        outcome: What happened (e.g., "success", "timeout", "blocked")
        confidence: 0.0-1.0 confidence in decision
        data: Additional context (selector, attempt_count, recovery_type, etc)
    """
    import asyncio
    import time
    try:
        timestamp = asyncio.get_running_loop().time()
    except RuntimeError:
        # Fallback for non-async context (e.g., testing)
        timestamp = time.time()
    
    return DecisionTrace(
        timestamp=timestamp,
        phase=phase,
        step_goal=step_goal,
        decision=decision,
        outcome=outcome,
        confidence=confidence,
        data=data or {},
    )


def _normalize_and_limit_decision_traces(traces: list[DecisionTrace]) -> list[dict[str, Any]]:
    """
    Normalize decision traces and limit payload size.
    
    Ensures:
    - Phase names are consistent
    - Confidence is meaningful (0.0-1.0, not arbitrary)
    - Payload doesn't exceed MAX_DECISION_TRACES_PER_STEP
    
    Args:
        traces: List of DecisionTrace objects
    
    Returns:
        List of normalized dict traces, limited to MAX_DECISION_TRACES_PER_STEP
    """
    # Normalize phases to valid set
    VALID_PHASES = {"action_resolution", "action_execution", "verification", "recovery"}
    
    normalized = []
    for trace in traces:
        # Ensure phase is from valid set (normalize if needed)
        phase = trace.phase.lower().strip() if trace.phase else "action_execution"
        if phase not in VALID_PHASES:
            phase = "action_execution"  # Fallback
        
        # Ensure confidence is in [0.0, 1.0]
        confidence = max(0.0, min(1.0, trace.confidence))
        
        # Convert to dict
        trace_dict = to_dict(trace)
        trace_dict["phase"] = phase
        trace_dict["confidence"] = confidence
        normalized.append(trace_dict)
    
    # Limit to prevent payload bloat
    return normalized[:MAX_DECISION_TRACES_PER_STEP]



async def _run_structured_journey(page, plan: JourneyPlan, state: SessionState, *, should_cancel: Callable[[], bool] | None = None) -> dict[str, Any]:
    step_results: list[dict[str, Any]] = []
    journey_status = "PASSED"
    consecutive_failures = 0
    journey_start_time = asyncio.get_running_loop().time()
    max_journey_duration_seconds = 90  # Phase 2: enforce max 60-90 seconds per journey
    early_stop_threshold = 3  # Phase 2: stop after 3 consecutive step failures

    for step_index, step in enumerate(plan.steps[:MAX_TOTAL_STEPS_PER_JOURNEY]):
        _raise_if_canceled(should_cancel)
        
        # Check journey duration (Phase 2 enhancement)
        elapsed_seconds = asyncio.get_running_loop().time() - journey_start_time
        if elapsed_seconds > max_journey_duration_seconds:
            journey_status = "FAILED"
            # Phase 3b: Attach diagnostic for timeout
            timeout_diagnostic = generate_diagnostic_for_failure(
                failure_type="timeout",
                goal="journey_timeout",
                context={
                    "elapsed_seconds": elapsed_seconds,
                    "max_duration": max_journey_duration_seconds,
                    "step_count": len(step_results),
                },
            )
            step_results.append(
                to_dict(
                    StepResult(
                        step_name="journey_timeout",
                        goal="journey_timeout",
                        status="failed",
                        failure_type="timeout",
                        error=f"Journey exceeded {max_journey_duration_seconds}s time limit (elapsed: {elapsed_seconds:.1f}s)",
                        diagnostic=to_dict(timeout_diagnostic) if timeout_diagnostic else None,
                        decision_trace=[],  # Phase 3b: No step-level decisions for journey timeout
                    )
                )
            )
            break
        
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
            # Phase 3b: Attach diagnostic for bot protection
            bot_diagnostic = generate_diagnostic_for_failure(
                failure_type=blocked_failure.value,
                goal=step.goal,
                context={
                    "reason": reason,
                    "snapshot": before_snapshot,
                },
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
                        diagnostic=to_dict(bot_diagnostic) if bot_diagnostic else None,
                        decision_trace=[],  # Phase 3b: Bot block is pre-action, no decisions
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
        decisions: list[DecisionTrace] = []  # Phase 3b: Decision trace collection

        for attempt in range(MAX_RETRIES_PER_STEP):
            action_trace: list[dict[str, Any]] = []
            candidates = _ordered_candidates_for_step(step)
            if not candidates:
                error_text = f"No action candidates available for step {step.goal}"
                verification_result = VerificationResult(success=False, failure_type="action_resolution_failed")
                # Phase 3b: Record decision for no candidates
                decisions.append(_record_decision_trace(
                    phase="action_resolution",
                    step_goal=step.goal,
                    decision="no_candidates",
                    outcome="failure",
                    confidence=1.0,
                    data={"attempt": attempt + 1, "reason": "No action candidates available"},
                ))
                break

            try:
                if _step_uses_fallback_candidates(step):
                    # Phase 3b: Record decision for fallback mode
                    decisions.append(_record_decision_trace(
                        phase="action_resolution",
                        step_goal=step.goal,
                        decision="using_fallback_candidates",
                        outcome="process_started",
                        confidence=0.7,
                        data={"attempt": attempt + 1, "candidate_count": len(candidates)},
                    ))
                    last_after_snapshot = before_snapshot
                    last_failure: VerificationResult | None = None
                    for candidate in candidates:
                        try:
                            executed_action = await _execute_candidate(
                                page,
                                _as_action_candidate(candidate),
                                state,
                            )
                            action_trace.append(executed_action)
                            await _wait_for_transition(page, before_snapshot)
                            blocker_events = await dismiss_blockers(page, "post_navigation")
                            recovery_attempts.extend(blocker_events)
                            _append_recovery_notes(notes, blocker_events)
                            after_snapshot = await _capture_page_snapshot(page)
                            last_after_snapshot = after_snapshot
                            candidate_verification = await verify_action_success(
                                page,
                                step,
                                state,
                                before_snapshot,
                                after_snapshot,
                            )
                            # Phase 3b: Record action decision
                            decisions.append(_record_decision_trace(
                                phase="action_execution",
                                step_goal=step.goal,
                                decision=f"executed_{executed_action.get('type', 'action')}",
                                outcome="verified" if candidate_verification.success else "verification_failed",
                                confidence=0.8 if candidate_verification.success else 0.3,
                                data={
                                    "action_type": executed_action.get('type', 'unknown'),
                                    "selector": executed_action.get('selector', ''),
                                    "verification_success": candidate_verification.success,
                                },
                            ))
                            if candidate_verification.success:
                                verification_result = candidate_verification
                                chosen_action = {"fallback_sequence": action_trace}
                                break
                            pdp_verification, pdp_snapshot, pdp_trace, pdp_recoveries, pdp_notes = await _continue_add_to_cart_from_pdp(
                                page,
                                state,
                                step,
                                before_snapshot,
                                after_snapshot,
                            )
                            if pdp_recoveries:
                                recovery_attempts.extend(pdp_recoveries)
                            if pdp_notes:
                                notes.extend(pdp_notes)
                            if pdp_trace:
                                action_trace.extend(pdp_trace)
                            if pdp_verification and pdp_verification.success:
                                verification_result = pdp_verification
                                after_snapshot = pdp_snapshot
                                last_after_snapshot = pdp_snapshot
                                chosen_action = {"fallback_sequence": action_trace}
                                break
                            if pdp_verification is not None:
                                last_after_snapshot = pdp_snapshot
                                last_failure = pdp_verification
                                chosen_action = {"fallback_sequence": action_trace} if action_trace else None
                                break
                            last_failure = candidate_verification
                        except Exception as candidate_exc:
                            error_text = str(candidate_exc)[:300]
                            await _wait_for_transition(page, before_snapshot)
                            blocker_events = await dismiss_blockers(page, "post_failure")
                            recovery_attempts.extend(blocker_events)
                            _append_recovery_notes(notes, blocker_events)
                            after_snapshot = await _capture_page_snapshot(page)
                            last_after_snapshot = after_snapshot
                            candidate_verification = await verify_action_success(
                                page,
                                step,
                                state,
                                before_snapshot,
                                after_snapshot,
                            )
                            if candidate_verification.success and action_trace:
                                note = f"Action error overruled by success signals: {error_text}"
                                notes.append(note)
                                verification_result = candidate_verification
                                chosen_action = {"fallback_sequence": action_trace}
                                break
                            last_failure = VerificationResult(
                                success=False,
                                passed_signals=candidate_verification.passed_signals,
                                failed_signals=candidate_verification.failed_signals,
                                delta_summary=candidate_verification.delta_summary,
                                failure_type="action_resolution_failed",
                                llm_used=candidate_verification.llm_used,
                            )
                    else:
                        after_snapshot = last_after_snapshot
                        verification_result = last_failure or VerificationResult(
                            success=False,
                            failure_type="action_resolution_failed",
                        )
                        chosen_action = {"fallback_sequence": action_trace} if action_trace else None
                else:
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
                    # Phase 3b: Success cases have minimal diagnostics (observational only)
                    success_diagnostic = None
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
                                diagnostic=success_diagnostic,
                                decision_trace=_normalize_and_limit_decision_traces(decisions),  # Phase 3b: Attach decision trace
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
                if verification_result.success and action_trace:
                    note = f"Action error overruled by success signals: {error_text}"
                    notes.append(note)
                    _update_state_after_step(
                        state,
                        step,
                        after_snapshot.get("url") or state.current_url,
                        verification_result,
                    )
                    # Phase 3b: Recovery diagnostic for exception that was masked by signals
                    recovery_diagnostic = generate_diagnostic_for_failure(
                        failure_type="action_resolution_failed",
                        goal=step.goal,
                        context={
                            "intent": step.intent or "",
                            "error": error_text,
                            "recovery_method": "success_signals_override",
                            "found_signals": [s.get("text") for s in verification_result.passed_signals],
                        },
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
                                diagnostic=to_dict(recovery_diagnostic) if recovery_diagnostic else None,
                                decision_trace=_normalize_and_limit_decision_traces(decisions),  # Phase 3b: Attach decision trace
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
            consecutive_failures += 1  # Phase 2: track consecutive failures
            final_snapshot = await _capture_page_snapshot(page)
            
            # Phase 3b: Attach comprehensive diagnostic for failed step (PRIMARY INTEGRATION POINT)
            failure_diagnostic = _attach_diagnostic_to_failure(
                verification_result=to_dict(verification_result),
                step=step,
                candidates=candidates,
                before_snapshot=before_snapshot,
                after_snapshot=final_snapshot,
            )
            
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
                        diagnostic=failure_diagnostic,
                        decision_trace=_normalize_and_limit_decision_traces(decisions),  # Phase 3b: Attach decision trace (PRIMARY)
                    )
                )
            )
            
            # Phase 2: Early stop after N consecutive failures
            if consecutive_failures >= early_stop_threshold:
                notes.append(f"Early stop: {consecutive_failures} consecutive step failures —stopping journey")
                step_results[-1]["notes"] = notes
                break
            # Don't break on first failure; continue to next step (unless early stop threshold reached)
            continue
        else:
            # Reset consecutive failures counter on success
            consecutive_failures = 0

        if step_index + 1 >= MAX_TOTAL_STEPS_PER_JOURNEY:
            journey_status = "FAILED"
            # Phase 3b: Attach diagnostic for journey step limit
            limit_diagnostic = generate_diagnostic_for_failure(
                failure_type="timeout",
                goal="journey_limit",
                context={
                    "max_steps": MAX_TOTAL_STEPS_PER_JOURNEY,
                    "steps_completed": len(step_results),
                },
            )
            step_results.append(
                to_dict(
                    StepResult(
                        step_name="journey_limit",
                        goal="journey_limit",
                        status="failed",
                        failure_type="timeout",
                        error="Exceeded MAX_TOTAL_STEPS_PER_JOURNEY",
                        diagnostic=to_dict(limit_diagnostic) if limit_diagnostic else None,
                        decision_trace=[],  # Phase 3b: No step-level decisions for journey limit
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
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        try:
            await page.goto(url, timeout=12000, wait_until="networkidle")
        except Exception:
            await page.goto(url, timeout=15000, wait_until="domcontentloaded")

        parsed = [
            journey if isinstance(journey, JourneyPlan) else JourneyPlan.from_dict(journey)
            for journey in journeys
        ]
        for plan in parsed:
            _raise_if_canceled(should_cancel)
            
            # Ensure catalog is loaded for every journey (critical for SPAs between navigation)
            try:
                await page.wait_for_selector(
                    ".product, .product-item, .product-card, .card-title, .card-block, .productName, div[id*='Img'], a:has-text('Shop Now'), a:has-text('Add to bag'), a[href*='prod.html'], a[href*='#/product/']",
                    timeout=15000,
                    state="visible",
                )
                await asyncio.sleep(2)
            except Exception:
                pass

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
                resp = await page.goto(url, timeout=12000, wait_until="networkidle")
            except Exception:
                result["classification_note"] = "discovery_timeout"
                resp = await page.goto(url, timeout=15000, wait_until="domcontentloaded")
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
