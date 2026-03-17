"""
gemini_judge.py — Visual bug detection using Gemini 1.5 Flash.

Sends desktop + mobile screenshots to Gemini and asks it to identify
visual bugs, layout issues, accessibility problems, and broken flows.
Returns structured findings with severity, category, and fix prompts.
"""

from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any

_log = logging.getLogger(__name__)

# ── Gemini client ─────────────────────────────────────────────────────────────

_MODEL_NAME = "gemini-1.5-flash-latest"


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
    model = _get_gemini_model()

    # Build the prompt with crawl metadata
    prompt_text = _VISUAL_JUDGE_PROMPT.format(
        url=crawl.get("url", ""),
        title=crawl.get("title", ""),
        status_code=crawl.get("status_code", ""),
        console_errors=json.dumps(crawl.get("console_errors", [])[:10]),
        failed_requests=json.dumps(crawl.get("failed_requests", [])[:10]),
        nav_links=json.dumps(crawl.get("nav_links", [])[:10]),
        buttons=json.dumps(crawl.get("buttons", [])[:15]),
        forms=json.dumps(crawl.get("forms", [])[:5]),
        text_snippet=(crawl.get("text_snippet", "") or "")[:500],
    )

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

    try:
        response = model.generate_content(parts)
        raw_text = response.text or ""
    except Exception as exc:
        _log.error("[GeminiJudge] Gemini API call failed: %s", exc, exc_info=True)
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

    return verdict
