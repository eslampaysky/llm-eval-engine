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
from dataclasses import dataclass, field, asdict
from typing import Any

from core.web_agent import run_web_audit
from core.gemini_judge import judge_visual

_log = logging.getLogger(__name__)


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
    score: int              # 0-100
    confidence: int         # 0-100
    findings: list[Finding] = field(default_factory=list)
    summary: str = ""
    bundled_fix_prompt: str | None = None
    video_path: str | None = None
    desktop_screenshot_b64: str | None = None
    mobile_screenshot_b64: str | None = None
    journey_results: list[dict] | None = None
    error: str | None = None


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


# ── Code-level analysis via Groq (Fix tier only) ─────────────────────────────

def _run_code_analysis(findings: list[Finding], crawl: dict) -> str | None:
    """
    Use Groq/Llama 3.3 to generate deeper code-level fix suggestions.
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
        )

        findings_text = "\n".join(
            f"- [{f.severity}] {f.title}: {f.description}" for f in findings
        )
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

        prompt = f"""You are a senior full-stack developer. A QA audit found these issues on a web app:

{findings_text}

Crawl data:
{crawl_summary}

Write a SINGLE, comprehensive fix prompt that a non-technical founder can paste into an AI code editor (like Lovable, Bolt.new, or Replit Agent) to fix ALL issues at once.

The prompt should:
1. Reference specific elements (buttons, forms, layouts) by their text/selector
2. Include both desktop (1280px) and mobile (390px) fixes
3. Be written as clear instructions, not code
4. Be thorough but concise — one prompt to fix everything

Return ONLY the fix prompt text, nothing else."""

        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
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
) -> AgenticQAResult:
    """
    Run an agentic QA audit against a URL.

    Args:
        url: The URL to audit.
        tier: "vibe", "deep", or "fix".
        journeys: Optional list of user journey steps (for deep/fix tiers).
        on_progress: Optional callback(step, total, message) for progress updates.

    Returns:
        AgenticQAResult with score, findings, screenshots, etc.
    """
    tier = tier.lower().strip()
    if tier not in ("vibe", "deep", "fix"):
        tier = "vibe"

    def _progress(step: int, total: int, msg: str):
        if on_progress:
            try:
                on_progress(step, total, msg)
            except Exception:
                pass

    total_steps = {"vibe": 3, "deep": 4, "fix": 5}[tier]

    # Step 1: Browser crawl
    _progress(1, total_steps, "Opening browser and crawling site...")

    record_video = tier in ("deep", "fix")
    run_journeys = journeys if tier in ("deep", "fix") else None

    try:
        crawl = asyncio.run(
            run_web_audit(
                url,
                record_video=record_video,
                run_journeys=run_journeys,
            )
        )
    except Exception as exc:
        _log.error("[AgenticQA] Crawl failed: %s", exc, exc_info=True)
        return AgenticQAResult(
            url=url,
            tier=tier,
            score=0,
            confidence=0,
            summary=f"Could not load the site: {str(exc)[:200]}",
            error=str(exc)[:500],
        )

    if crawl.get("error") and not crawl.get("desktop_screenshot_b64"):
        return AgenticQAResult(
            url=url,
            tier=tier,
            score=0,
            confidence=0,
            summary=f"Could not load the site: {crawl['error'][:200]}",
            error=crawl["error"][:500],
        )

    # Step 2: Visual analysis via Gemini
    _progress(2, total_steps, "Running AI visual analysis...")

    try:
        verdict = judge_visual(crawl)
    except Exception as exc:
        _log.error("[AgenticQA] Gemini judge failed: %s", exc, exc_info=True)
        verdict = {
            "score": 50,
            "confidence": 30,
            "findings": [],
            "summary": "Visual analysis encountered an error.",
        }

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

    # For vibe tier, limit to top 3 findings by severity
    if tier == "vibe" and len(findings) > 3:
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        findings.sort(key=lambda f: severity_order.get(f.severity, 99))
        findings = findings[:3]

    # Compute score from findings (override Gemini's score with our own)
    score = compute_score(findings)
    confidence = verdict.get("confidence", 50)

    # Step 3: Build fix prompt bundle
    _progress(3, total_steps, "Generating fix prompts...")
    bundled = build_bundled_fix_prompt(findings, url)

    # Step 4 (fix tier only): Code-level analysis
    if tier == "fix":
        _progress(4, total_steps, "Running code-level analysis...")
        code_fix = _run_code_analysis(findings, crawl)
        if code_fix:
            bundled = code_fix  # Replace basic bundle with enhanced version

    _progress(total_steps, total_steps, "Done!")

    return AgenticQAResult(
        url=url,
        tier=tier,
        score=score,
        confidence=confidence,
        findings=findings,
        summary=verdict.get("summary", ""),
        bundled_fix_prompt=bundled or None,
        video_path=crawl.get("video_path"),
        desktop_screenshot_b64=crawl.get("desktop_screenshot_b64"),
        mobile_screenshot_b64=crawl.get("mobile_screenshot_b64"),
        journey_results=crawl.get("journey_results"),
    )


def result_to_dict(result: AgenticQAResult) -> dict[str, Any]:
    """Convert an AgenticQAResult to a JSON-serializable dict."""
    d = asdict(result)
    d["findings"] = [asdict(f) for f in result.findings]
    return d
