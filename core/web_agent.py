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
import re
import tempfile
from pathlib import Path

from playwright.async_api import async_playwright

_log = logging.getLogger(__name__)

# ── Default viewport sizes ────────────────────────────────────────────────────

DESKTOP_VIEWPORT = {"width": 1280, "height": 720}
MOBILE_VIEWPORT = {"width": 390, "height": 844}

# Where to store video recordings
VIDEO_DIR = os.getenv("VIDEO_DIR", "/tmp/aibreaker_videos/")


async def _take_screenshot(page, viewport: dict) -> str | None:
    """Resize viewport and take a full-page screenshot, return base64."""
    try:
        await page.set_viewport_size(viewport)
        await page.wait_for_timeout(600)
        raw = await page.screenshot(type="png", full_page=True)
        return base64.b64encode(raw).decode("ascii")
    except Exception:
        return None


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


async def run_web_audit(
    url: str,
    *,
    record_video: bool = True,
    run_journeys: list[dict] | None = None,
) -> dict:
    """
    Open a URL, capture dual-viewport screenshots, console errors,
    failed network requests, page metadata, and optionally execute
    user journeys.

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
    }

    video_dir = None
    if record_video:
        video_dir = VIDEO_DIR
        Path(video_dir).mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        launch_args = ["--no-sandbox", "--disable-gpu"]
        browser = await p.chromium.launch(headless=True, args=launch_args)

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
            resp = await page.goto(url, timeout=25000, wait_until="networkidle")
            result["status_code"] = resp.status if resp else None
            result["title"] = await page.title()

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

            # ── User journeys (optional) ──────────────────────────────────
            if run_journeys:
                result["journey_results"] = await _run_user_journeys(
                    page, run_journeys
                )

        except Exception as e:
            result["error"] = str(e)[:500]
        finally:
            video_path = None
            if page.video:
                try:
                    video_path = await page.video.path()
                except Exception:
                    pass
            result["video_path"] = str(video_path) if video_path else None
            await context.close()
            await browser.close()

    return result
