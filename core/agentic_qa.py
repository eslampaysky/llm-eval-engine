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

from core.models import JourneyPlan, JourneyStep, SuccessSignal, ActionCandidate, StepType, to_dict
from core.report_builder import build_fix_prompt_context, build_journey_timeline, infer_spec
from core.web_agent import run_structured_journeys, run_web_audit
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


def discover_site(crawl: dict, description: str | None = None) -> dict[str, Any]:
    text = " ".join(
        [
            crawl.get("title") or "",
            crawl.get("text_snippet") or "",
            " ".join(item.get("text", "") for item in (crawl.get("nav_links") or []) if isinstance(item, dict)),
            " ".join(crawl.get("buttons") or []),
            description or "",
        ]
    ).lower()

    app_type = "generic"
    features: list[str] = []
    primary_goal = "explore site"

    if any(token in text for token in ("cart", "checkout", "shop", "product", "add to cart")):
        app_type = "ecommerce"
        features = ["login", "search", "cart", "checkout"]
        primary_goal = "purchase item"
    elif any(token in text for token in ("dashboard", "workspace", "analytics", "sign in", "trial")):
        app_type = "saas"
        features = ["login", "dashboard", "navigation"]
        primary_goal = "reach dashboard"
    elif any(token in text for token in ("task", "board", "todo", "create", "edit")):
        app_type = "crud"
        features = ["create", "edit", "delete"]
        primary_goal = "manage records"

    inferred = {
        "app_type": app_type,
        "features": features,
        "primary_goal": primary_goal,
        "site_description": description,
    }

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
            ActionCandidate(type="fill", intent="email field", role="textbox", name="Email", value="state.generated_credentials.email"),
            ActionCandidate(type="fill", intent="password field", role="textbox", name="Password", value="state.generated_credentials.password"),
            ActionCandidate(type="click", intent="login button", role="button", name="Login", text="Login"),
            ActionCandidate(type="click", intent="sign in button", role="button", name="Sign in", text="Sign in"),
        ],
        input_bindings={
            "Email": "state.generated_credentials.email",
            "Password": "state.generated_credentials.password",
        },
        success_signals=[
            SuccessSignal(type="url_contains", value="/dashboard", priority="high"),
            SuccessSignal(type="element_visible", value="Logout", priority="medium", required=False),
            SuccessSignal(type="llm_fallback", value="Did login succeed based on this page?", priority="low", required=False),
        ],
        failure_hints=["Invalid credentials", "Incorrect password", "url still contains /login"],
        expected_state_change={"is_logged_in": True},
        allow_soft_recovery=True,
    )


def _cart_step() -> JourneyStep:
    return JourneyStep(
        goal="add_to_cart",
        intent="add item to cart",
        action_candidates=[
            ActionCandidate(type="click", intent="add to cart", role="button", name="Add to cart", text="Add to cart"),
            ActionCandidate(type="click", intent="buy now", role="button", name="Buy now", text="Buy now"),
        ],
        success_signals=[
            SuccessSignal(type="text_present", value="cart", priority="medium", required=False),
            SuccessSignal(type="url_contains", value="cart", priority="high", required=False),
            SuccessSignal(type="state_assertion", value={"cart_has_items": True}, priority="medium", required=False),
        ],
        failure_hints=["Cart count did not change", "Item not added"],
        expected_state_change={"cart_has_items": True},
        allow_soft_recovery=True,
    )


def _dashboard_step() -> JourneyStep:
    return JourneyStep(
        goal="reach_dashboard",
        intent="open dashboard",
        action_candidates=[
            ActionCandidate(type="click", intent="dashboard link", role="link", name="Dashboard", text="Dashboard"),
            ActionCandidate(type="click", intent="get started", role="button", name="Get started", text="Get started"),
        ],
        success_signals=[
            SuccessSignal(type="url_contains", value="dashboard", priority="high"),
            SuccessSignal(type="text_present", value="dashboard", priority="medium", required=False),
        ],
        failure_hints=["Dashboard did not load"],
        expected_state_change={},
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


def plan_journeys(context: dict[str, Any]) -> list[JourneyPlan]:
    app_type = str(context.get("app_type") or "generic").lower()
    if "commerce" in app_type or app_type == "ecommerce":
        return [
            JourneyPlan(name="guest_checkout", app_type="ecommerce", steps=[_cart_step()]),
            JourneyPlan(name="user_checkout", app_type="ecommerce", steps=[_login_step(), _cart_step()]),
        ]
    if "saas" in app_type or "dashboard" in app_type:
        return [
            JourneyPlan(name="register_login", app_type="saas", steps=[_login_step(), _dashboard_step()]),
        ]
    if app_type in {"crud", "task_manager", "task"}:
        return [JourneyPlan(name="core_crud", app_type="crud", steps=_crud_steps())]
    return [JourneyPlan(name="core_navigation", app_type="generic", steps=[_dashboard_step()])]


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
    user_api_key: str | None = None,
    site_description: str | None = None,
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

    def _progress(step: int, total: int, msg: str):
        if on_progress:
            try:
                on_progress(step, total, msg)
            except Exception:
                pass

    total_steps = {"vibe": 4, "deep": 5, "fix": 6}[tier]

    # Step 1: Browser crawl
    _progress(1, total_steps, "Opening browser and crawling site...")

    # ── Tier-specific crawl parameters ────────────────────────────────────
    record_video = False
    run_journeys = journeys if tier in ("deep", "fix") else None
    max_pages = 3 if tier in ("deep", "fix") else 1

    try:
        crawl = asyncio.run(
            run_web_audit(
                url,
                record_video=record_video,
                run_journeys=run_journeys if journeys and isinstance(journeys[0], dict) and "action" in journeys[0] else None,
                max_pages=max_pages,
            )
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

    if tier in ("deep", "fix"):
        _progress(3, total_steps, "Planning and executing verified user journeys...")
        structured_plans, legacy_journeys = _coerce_structured_journeys(journeys, discovery_context)
        if structured_plans:
            try:
                structured_journey_run = asyncio.run(
                    run_structured_journeys(
                        url,
                        structured_plans,
                        record_video=True,
                        base_context=discovery_context,
                    )
                )
                journey_results = structured_journey_run.get("journey_results")
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
