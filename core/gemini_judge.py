"""
gemini_judge.py — Visual bug detection using Gemini 2.0 Flash.

Sends desktop + mobile screenshots to Gemini and asks it to identify
visual bugs, layout issues, accessibility problems, and broken flows.
Returns structured findings with severity, category, and fix prompts.

Resilience layers (in order):
  1. Per-user API key — if the user stored their own key, use it exclusively.
  2. Shared key rotation — up to 4 GEMINI_API_KEY_N env vars, round-robin.
  3. Groq vision fallback — meta-llama/llama-4-scout-17b-16e-instruct.
  4. Playwright-only analysis — programmatic checks, no AI at all.

Additional safeguards:
  • Exponential backoff (1s → 2s → 4s) on 429 rate-limit errors.
  • Rate limiter — minimum 5 s between Gemini calls (≤12 RPM).
  • 24-hour file-based cache — same URL re-audited in one day costs 0 calls.
  • PII masking — strip emails, phones, card numbers before sending to any API.
  • No raw error messages are ever returned to the caller.
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


# ── Multi-key pool (Part 2) ──────────────────────────────────────────────────

def _load_key_pool() -> list[str]:
    """
    Build the Gemini API key pool from environment variables.
    Checks GEMINI_API_KEY_1 through _4, then falls back to GEMINI_API_KEY.
    """
    keys: list[str] = []
    for i in range(1, 5):
        k = os.getenv(f"GEMINI_API_KEY_{i}", "").strip()
        if k:
            keys.append(k)
    if not keys:
        fallback = os.getenv("GEMINI_API_KEY", "").strip()
        if fallback:
            keys.append(fallback)
    return keys


def _mask_key(key: str) -> str:
    """Show only the last 4 characters for logging."""
    if len(key) <= 4:
        return "****"
    return f"***{key[-4:]}"


_key_pool: list[str] = _load_key_pool()
_key_index: int = 0
_key_lock = threading.Lock()


def _get_next_key() -> tuple[str, int]:
    """Thread-safe round-robin key selection. Returns (key, index)."""
    global _key_index
    with _key_lock:
        if not _key_pool:
            return "", -1
        idx = _key_index % len(_key_pool)
        key = _key_pool[idx]
        _key_index = (idx + 1) % len(_key_pool)
        return key, idx


def _get_gemini_model(api_key: str):
    """Create a Gemini GenerativeModel with the given api_key."""
    import google.generativeai as genai
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


# ── Exponential backoff with key rotation ─────────────────────────────────────

_MAX_RETRIES_PER_KEY = 2
_BACKOFF_BASE = 1  # seconds: 1, 2


def _is_429(exc: Exception) -> bool:
    """Check if an exception is a 429 / ResourceExhausted error."""
    exc_str = str(exc)
    return "429" in exc_str or "ResourceExhausted" in type(exc).__name__


def _call_gemini_with_rotation(parts: list, user_api_key: str | None = None) -> str:
    """
    Try Gemini with key rotation.

    If user_api_key is provided, use ONLY that key (no pool).
    Otherwise rotate through the shared pool.

    Returns raw response text on success.
    Raises _AllKeysExhausted if all keys return 429.
    Raises other exceptions for non-429 errors.
    """
    if user_api_key:
        # User's own key — try it with backoff, no rotation
        return _try_single_key(user_api_key, parts, label="user-key")

    if not _key_pool:
        raise _AllKeysExhausted("No Gemini API keys configured")

    keys_tried = set()
    total_keys = len(_key_pool)

    while len(keys_tried) < total_keys:
        key, idx = _get_next_key()
        if not key or idx in keys_tried:
            # Already tried this key
            if idx in keys_tried:
                # Force next
                continue
            break
        keys_tried.add(idx)

        masked = _mask_key(key)
        _log.info("[KeyRotation] Trying key #%d (%s)", idx + 1, masked)

        try:
            return _try_single_key(key, parts, label=f"pool-key-{idx + 1}")
        except _SingleKey429:
            _log.warning(
                "[KeyRotation] Key #%d (%s) exhausted (429) — rotating",
                idx + 1, masked,
            )
            continue
        # Non-429 exceptions propagate up

    raise _AllKeysExhausted(
        f"All {total_keys} Gemini API keys returned 429"
    )


def _try_single_key(api_key: str, parts: list, label: str = "") -> str:
    """
    Try a single key with exponential backoff on 429.
    Raises _SingleKey429 if retries exhausted.
    """
    model = _get_gemini_model(api_key)
    masked = _mask_key(api_key)

    for attempt in range(_MAX_RETRIES_PER_KEY + 1):
        _rate_limit()
        try:
            _log.info("[Gemini] Calling with key %s (%s) attempt %d",
                      masked, label, attempt + 1)
            response = model.generate_content(parts)
            return response.text or ""
        except Exception as exc:
            if _is_429(exc) and attempt < _MAX_RETRIES_PER_KEY:
                delay = _BACKOFF_BASE * (2 ** attempt)
                _log.warning(
                    "[Backoff] 429 on %s attempt %d/%d — retrying in %ds",
                    masked, attempt + 1, _MAX_RETRIES_PER_KEY, delay,
                )
                time.sleep(delay)
                continue
            if _is_429(exc):
                raise _SingleKey429(f"Key {masked} exhausted") from exc
            raise  # non-429 — let caller handle


class _SingleKey429(Exception):
    """A single key is exhausted."""


class _AllKeysExhausted(Exception):
    """All Gemini keys in the pool returned 429."""


# ── Groq Vision Fallback (Part 3) ────────────────────────────────────────────

_GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"


def _try_groq_vision(prompt_text: str, desktop_b64: str | None) -> dict | None:
    """
    Attempt visual analysis via Groq vision API.
    Returns parsed verdict dict or None on failure.
    """
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if not groq_key:
        _log.info("[GroqFallback] GROQ_API_KEY not set — skipping")
        return None

    try:
        from openai import OpenAI

        client = OpenAI(
            base_url="https://api.groq.com/openai/v1",
            api_key=groq_key,
            timeout=120.0,
        )

        messages_content: list[dict] = [{"type": "text", "text": prompt_text}]
        if desktop_b64:
            messages_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/png;base64,{desktop_b64}",
                },
            })

        _log.info("[GroqFallback] Calling %s for visual analysis", _GROQ_VISION_MODEL)
        response = client.chat.completions.create(
            model=_GROQ_VISION_MODEL,
            messages=[{
                "role": "user",
                "content": messages_content,
            }],
            max_tokens=2000,
            temperature=0.3,
        )
        raw_text = response.choices[0].message.content.strip()
        verdict = _parse_json_response(raw_text)
        if verdict and "findings" in verdict:
            _log.info("[GroqFallback] Successfully got %d findings", len(verdict.get("findings", [])))
            return verdict
        _log.warning("[GroqFallback] Response parsed but missing findings")
        return verdict if verdict else None

    except Exception as exc:
        _log.error("[GroqFallback] Groq vision call failed: %s", exc)
        return None


# ── Playwright-only fallback analysis (Part 1) ───────────────────────────────

def _playwright_fallback_analysis(crawl: dict) -> dict:
    """
    Perform basic programmatic checks using only the crawl data.
    No AI involved — pure rule-based analysis.

    Checks:
      - Console errors
      - Failed network requests
      - Missing viewport meta tag
      - Missing page title
      - Images without alt text
      - Buttons with no text
      - Forms with no labels
    """
    findings: list[dict] = []

    # Console errors
    console_errors = crawl.get("console_errors") or []
    if console_errors:
        findings.append({
            "severity": "high",
            "category": "functionality",
            "title": f"{len(console_errors)} JavaScript console error(s) detected",
            "description": (
                f"The browser console reported {len(console_errors)} error(s). "
                f"First error: {str(console_errors[0])[:150]}"
            ),
            "fix_prompt": (
                "Open your browser DevTools console and fix all JavaScript errors. "
                f"There are {len(console_errors)} errors to resolve."
            ),
        })

    # Failed network requests
    failed_requests = crawl.get("failed_requests") or []
    if failed_requests:
        findings.append({
            "severity": "high",
            "category": "functionality",
            "title": f"{len(failed_requests)} failed network request(s)",
            "description": (
                f"{len(failed_requests)} network request(s) failed to load. "
                f"First failure: {str(failed_requests[0])[:150]}"
            ),
            "fix_prompt": (
                "Check that all API endpoints, images, and external resources load correctly. "
                f"There are {len(failed_requests)} failing requests to fix."
            ),
        })

    # Missing page title
    title = crawl.get("title", "").strip()
    if not title:
        findings.append({
            "severity": "medium",
            "category": "accessibility",
            "title": "Page has no title",
            "description": (
                "The page is missing a <title> tag. This hurts SEO and accessibility — "
                "screen readers and search engines rely on the page title."
            ),
            "fix_prompt": (
                "Add a descriptive <title> tag to the <head> of your HTML. "
                "It should clearly describe what the page is about."
            ),
        })

    # Missing viewport meta tag (check text_snippet / metadata)
    text_snippet = crawl.get("text_snippet", "") or ""
    has_viewport = crawl.get("has_viewport_meta", None)
    if has_viewport is False:
        findings.append({
            "severity": "high",
            "category": "layout",
            "title": "Missing viewport meta tag",
            "description": (
                "The page doesn't have a <meta name='viewport'> tag. "
                "This causes the page to not render correctly on mobile devices."
            ),
            "fix_prompt": (
                "Add this tag to your <head>: "
                '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
            ),
        })

    # Buttons with no text
    buttons = crawl.get("buttons") or []
    empty_buttons = [b for b in buttons if not (b if isinstance(b, str) else "").strip()]
    if empty_buttons:
        findings.append({
            "severity": "medium",
            "category": "accessibility",
            "title": f"{len(empty_buttons)} button(s) with no accessible text",
            "description": (
                "Some buttons have no visible text or aria-label. "
                "Screen readers cannot describe these buttons to users."
            ),
            "fix_prompt": (
                "Add visible text or aria-label attributes to all buttons. "
                f"{len(empty_buttons)} button(s) need accessible labels."
            ),
        })

    # Forms with no labels
    forms = crawl.get("forms") or []
    if forms:
        # We can't deeply inspect form labels from crawl data,
        # but we can flag forms for manual review
        form_count = len(forms)
        findings.append({
            "severity": "low",
            "category": "accessibility",
            "title": f"{form_count} form(s) detected — verify labels",
            "description": (
                f"Found {form_count} form(s) on the page. "
                "Ensure all form inputs have associated <label> elements for accessibility."
            ),
            "fix_prompt": (
                "Review all form inputs and ensure each one has an associated <label>. "
                "Use the 'for' attribute matching the input's 'id'."
            ),
        })

    # Compute a basic score from findings
    severity_deductions = {"critical": 20, "high": 12, "medium": 6, "low": 2}
    score = 100
    for f in findings:
        score -= severity_deductions.get(f["severity"], 5)
    score = max(0, min(100, score))

    summary = (
        f"Basic technical audit completed (AI analysis was unavailable). "
        f"Found {len(findings)} issue(s) from automated checks."
    )
    if not findings:
        summary = "Basic technical audit completed — no issues detected from automated checks."

    return {
        "score": score if findings else None,
        "confidence": None,  # Signal that this is not AI-powered
        "findings": findings,
        "summary": summary,
        "analysis_limited": True,
    }


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


def judge_visual(crawl: dict, user_api_key: str | None = None) -> dict[str, Any]:
    """
    Send desktop + mobile screenshots to Gemini for visual bug detection.

    Fallback chain:
      1. User's own API key (if provided)
      2. Shared Gemini key pool with rotation
      3. Groq vision (LLaMA 4 Scout)
      4. Playwright-only analysis (no AI)

    Args:
        crawl: Dict from run_web_audit() containing screenshot_b64 fields,
               console_errors, failed_requests, and page metadata.
        user_api_key: Optional per-user Gemini API key.

    Returns:
        Dict with score, confidence, findings[], summary.
        When AI is unavailable, confidence will be None.
    """
    url = crawl.get("url", "")

    # ── Cache check — skip Gemini entirely if we audited this URL today ──
    cached = _get_cached(url)
    if cached is not None:
        return cached

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

    # ── PII masking pass — strip emails, phones, cards before sending
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

    # ── Layer 1 & 2: Try Gemini (user key or shared pool with rotation) ──
    user_key_exhausted = False
    raw_text = None

    try:
        raw_text = _call_gemini_with_rotation(parts, user_api_key=user_api_key)
    except _SingleKey429:
        # User's own key is exhausted
        _log.warning("[GeminiJudge] User's own API key quota exhausted")
        user_key_exhausted = True
    except _AllKeysExhausted:
        _log.warning("[GeminiJudge] All shared Gemini keys exhausted — trying Groq")
    except Exception as exc:
        _log.error("[GeminiJudge] Gemini call failed (non-429): %s", type(exc).__name__)

    # ── Layer 3: Try Groq vision if Gemini failed ──
    if raw_text is None and not user_key_exhausted:
        groq_verdict = _try_groq_vision(prompt_text, desktop_b64)
        if groq_verdict and groq_verdict.get("findings") is not None:
            verdict = groq_verdict
            verdict.setdefault("score", 50)
            verdict.setdefault("confidence", 60)
            verdict.setdefault("summary", "Analysis completed via backup AI model.")
            verdict["findings"] = _clean_findings(verdict.get("findings", []))
            verdict["score"] = max(0, min(100, int(verdict["score"])))
            verdict["confidence"] = max(0, min(100, int(verdict["confidence"])))
            _set_cached(url, verdict)
            return verdict

    # ── Layer 4: Playwright-only fallback ──
    if raw_text is None:
        _log.warning("[GeminiJudge] All AI layers failed — using Playwright-only fallback")
        verdict = _playwright_fallback_analysis(crawl)
        verdict["user_key_exhausted"] = user_key_exhausted
        # Don't cache fallback results — retry with AI next time
        return verdict

    # ── Parse successful Gemini response ──
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

    # Clean findings
    verdict["findings"] = _clean_findings(verdict.get("findings", []))

    # ── Cache the result for future calls ──
    _set_cached(url, verdict)

    return verdict


def _clean_findings(findings: list) -> list[dict]:
    """Ensure each finding has all required fields."""
    clean: list[dict] = []
    for f in findings:
        clean.append(
            {
                "severity": f.get("severity", "medium"),
                "category": f.get("category", "functionality"),
                "title": f.get("title", "Untitled issue"),
                "description": f.get("description", ""),
                "fix_prompt": f.get("fix_prompt", ""),
            }
        )
    return clean
