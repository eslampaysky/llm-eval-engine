"""
gemini_judge.py — Visual bug detection using Gemini 2.0 Flash.

Sends desktop + mobile screenshots to Gemini and asks it to identify
visual bugs, layout issues, accessibility problems, and broken flows.
Returns structured findings with severity, category, and fix prompts.

Free-tier resilience:
  • Exponential backoff (1s → 2s → 4s) on 429 rate-limit errors.
  • Rate limiter — minimum 5 s between Gemini calls (≤12 RPM).
  • 24-hour file-based cache — same URL re-audited in one day costs 0 calls.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

_log = logging.getLogger(__name__)

# ── Gemini client ─────────────────────────────────────────────────────────────

_MODEL_NAME = "gemini-2.0-flash"


def _get_gemini_model():
    """Lazily create the Gemini GenerativeModel."""
    import google.generativeai as genai

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Get a free key from https://aistudio.google.com"
        )
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(_MODEL_NAME)


# ── Rate limiter (≤12 RPM — safe under 15 RPM free limit) ────────────────────

_MIN_GAP_SECONDS = 5.0          # 60 / 12 = 5 s per request
_last_call_lock = threading.Lock()
_last_call_time: float = 0.0


def _rate_limit():
    """Block until at least _MIN_GAP_SECONDS have elapsed since the last call."""
    global _last_call_time
    with _last_call_lock:
        now = time.monotonic()
        wait = _MIN_GAP_SECONDS - (now - _last_call_time)
        if wait > 0:
            _log.info("[RateLimit] Waiting %.1fs before next Gemini call", wait)
            time.sleep(wait)
        _last_call_time = time.monotonic()


# ── Exponential backoff for 429s ──────────────────────────────────────────────

_MAX_RETRIES = 3
_BACKOFF_BASE = 1  # seconds: 1, 2, 4


def _call_gemini_with_backoff(model, parts: list) -> str:
    """
    Call model.generate_content with exponential backoff on 429.
    Returns raw response text, or raises on non-retryable errors.
    """
    for attempt in range(_MAX_RETRIES + 1):
        _rate_limit()
        try:
            response = model.generate_content(parts)
            return response.text or ""
        except Exception as exc:
            exc_str = str(exc)
            is_429 = "429" in exc_str or "ResourceExhausted" in type(exc).__name__
            if is_429 and attempt < _MAX_RETRIES:
                delay = _BACKOFF_BASE * (2 ** attempt)
                _log.warning(
                    "[Backoff] 429 on attempt %d/%d — retrying in %ds",
                    attempt + 1, _MAX_RETRIES, delay,
                )
                time.sleep(delay)
                continue
            raise  # non-429 or final attempt — let caller handle
    return ""  # unreachable


# ── 24-hour file-based cache ─────────────────────────────────────────────────

_CACHE_DIR = Path(os.getenv("GEMINI_CACHE_DIR", "/tmp/aibreaker_gemini_cache"))
_CACHE_TTL_HOURS = 24


def _cache_key(url: str) -> str:
    """Stable hash from URL + today's date."""
    today = time.strftime("%Y-%m-%d")
    raw = f"{url.strip().rstrip('/')}|{today}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


def _get_cached(url: str) -> dict | None:
    """Return cached verdict dict if it exists and is < 24 h old."""
    try:
        path = _CACHE_DIR / f"{_cache_key(url)}.json"
        if not path.exists():
            return None
        age_hours = (time.time() - path.stat().st_mtime) / 3600
        if age_hours > _CACHE_TTL_HOURS:
            path.unlink(missing_ok=True)
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        _log.info("[Cache] HIT for %s (%.1fh old)", url, age_hours)
        return data
    except Exception as exc:
        _log.debug("[Cache] Read error: %s", exc)
        return None


def _set_cached(url: str, verdict: dict) -> None:
    """Persist verdict to the file cache."""
    try:
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path = _CACHE_DIR / f"{_cache_key(url)}.json"
        path.write_text(json.dumps(verdict, default=str), encoding="utf-8")
        _log.info("[Cache] STORED for %s", url)
    except Exception as exc:
        _log.debug("[Cache] Write error: %s", exc)


# ── PII masking ───────────────────────────────────────────────────────────────

# Patterns for sensitive data that must not reach external APIs.
_EMAIL_RE = re.compile(
    r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b"
)
_PHONE_RE = re.compile(
    r"(?<!\d)"                       # not preceded by digit
    r"(\+?\d{1,3}[\-.\s]?)?"        # optional country code
    r"\(?\d{2,4}\)?[\-.\s]?"        # area code
    r"\d{3,4}[\-.\s]?"              # first group
    r"\d{3,4}"                       # second group
    r"(?!\d)"                        # not followed by digit
)
_CARD_RE = re.compile(
    r"\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))"  # issuer prefix
    r"[\d\- ]{9,15}\d\b"                                      # rest of digits
)


def _mask_pii(text: str) -> str:
    """Replace emails, phone numbers, and credit-card patterns with placeholders."""
    text = _EMAIL_RE.sub("<USER_EMAIL>", text)
    text = _CARD_RE.sub("<CARD>", text)
    text = _PHONE_RE.sub("<PHONE>", text)
    return text


# ── Prompt ────────────────────────────────────────────────────────────────────

_VISUAL_JUDGE_PROMPT = """\
You are a senior QA engineer and UX specialist performing a visual reliability audit of a web application.

You are given two screenshots of the same page:
1. **Desktop** (1280×720)
2. **Mobile** (390×844)

Along with this crawl metadata:
- URL: {url}
- Page title: {title}
- HTTP status: {status_code}
- Console errors: {console_errors}
- Failed network requests: {failed_requests}
- Navigation links: {nav_links}
- Buttons found: {buttons}
- Forms found: {forms}
- Visible text (first 500 chars): {text_snippet}

Your job: Find every visual bug, layout problem, functionality issue, and accessibility concern.

For each finding, write a **fix prompt** that a non-technical founder can paste directly into an AI code editor like Lovable, Bolt.new, or Replit Agent to fix the issue.

Return ONLY valid JSON matching this exact schema — no markdown, no explanation:
{{
  "score": <integer 0-100, where 100 = perfect>,
  "confidence": <integer 0-100>,
  "findings": [
    {{
      "severity": "critical|high|medium|low",
      "category": "layout|functionality|accessibility|performance|content",
      "title": "short title",
      "description": "what's wrong and why it matters",
      "fix_prompt": "exact instruction to paste into AI builder to fix this"
    }}
  ],
  "summary": "2-sentence plain-English summary for a non-technical founder"
}}

Scoring guide:
- 90-100: No issues found, professional quality
- 70-89: Minor issues only (cosmetic, low-severity)
- 50-69: Some real problems that affect usability
- 30-49: Significant issues, many things broken
- 0-29: Critically broken, barely functional

Be thorough but honest. If the site looks good, say so. If it's broken, be specific.
"""


def _build_image_part(b64_data: str, mime_type: str = "image/png") -> dict:
    """Build an inline image part for the Gemini API."""
    return {"inline_data": {"mime_type": mime_type, "data": b64_data}}


def _parse_json_response(text: str) -> dict:
    """Best-effort JSON extraction from model output."""
    text = text.strip()
    # Try direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try extracting JSON from markdown code blocks
    md_match = re.search(r"```(?:json)?\s*\n?(.*?)```", text, re.DOTALL)
    if md_match:
        try:
            return json.loads(md_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try finding first { ... } block
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    return {}


# ── Public API ────────────────────────────────────────────────────────────────


def judge_visual(crawl: dict) -> dict[str, Any]:
    """
    Send desktop + mobile screenshots to Gemini for visual bug detection.

    Args:
        crawl: Dict from run_web_audit() containing screenshot_b64 fields,
               console_errors, failed_requests, and page metadata.

    Returns:
        Dict with score, confidence, findings[], summary.
    """
    url = crawl.get("url", "")

    # ── Cache check — skip Gemini entirely if we audited this URL today ──
    cached = _get_cached(url)
    if cached is not None:
        return cached

    model = _get_gemini_model()

    # Build the prompt with crawl metadata
    prompt_text = _VISUAL_JUDGE_PROMPT.format(
        url=url,
        title=crawl.get("title", ""),
        status_code=crawl.get("status_code", ""),
        console_errors=json.dumps(crawl.get("console_errors", [])[:10]),
        failed_requests=json.dumps(crawl.get("failed_requests", [])[:10]),
        nav_links=json.dumps(crawl.get("nav_links", [])[:10]),
        buttons=json.dumps(crawl.get("buttons", [])[:15]),
        forms=json.dumps(crawl.get("forms", [])[:5]),
        text_snippet=(crawl.get("text_snippet", "") or "")[:500],
    )

    # ── PII masking pass — strip emails, phones, cards before sending to Gemini
    prompt_text = _mask_pii(prompt_text)

    # Build content parts: text + images
    parts: list = [prompt_text]

    desktop_b64 = crawl.get("desktop_screenshot_b64") or crawl.get("screenshot_b64")
    mobile_b64 = crawl.get("mobile_screenshot_b64")

    if desktop_b64:
        parts.append(_build_image_part(desktop_b64))
    if mobile_b64:
        parts.append(_build_image_part(mobile_b64))

    if not desktop_b64 and not mobile_b64:
        _log.warning("[GeminiJudge] No screenshots available — text-only analysis")

    # ── Call Gemini with backoff + rate limiting ──
    try:
        raw_text = _call_gemini_with_backoff(model, parts)
    except Exception as exc:
        _log.error("[GeminiJudge] Gemini API call failed after retries: %s", exc)
        return {
            "score": 0,
            "confidence": 0,
            "findings": [
                {
                    "severity": "critical",
                    "category": "functionality",
                    "title": "Analysis failed",
                    "description": f"Could not complete visual analysis: {str(exc)[:200]}",
                    "fix_prompt": "Please try running the audit again.",
                }
            ],
            "summary": "Visual analysis could not be completed due to an API error.",
        }

    verdict = _parse_json_response(raw_text)

    # Ensure required fields
    if "score" not in verdict:
        verdict["score"] = 50
    if "confidence" not in verdict:
        verdict["confidence"] = 50
    if "findings" not in verdict:
        verdict["findings"] = []
    if "summary" not in verdict:
        verdict["summary"] = "Analysis completed."

    # Clamp score and confidence
    verdict["score"] = max(0, min(100, int(verdict["score"])))
    verdict["confidence"] = max(0, min(100, int(verdict["confidence"])))

    # Ensure each finding has all required fields
    clean_findings = []
    for f in verdict["findings"]:
        clean_findings.append(
            {
                "severity": f.get("severity", "medium"),
                "category": f.get("category", "functionality"),
                "title": f.get("title", "Untitled issue"),
                "description": f.get("description", ""),
                "fix_prompt": f.get("fix_prompt", ""),
            }
        )
    verdict["findings"] = clean_findings

    # ── Cache the result for future calls ──
    _set_cached(url, verdict)

    return verdict


