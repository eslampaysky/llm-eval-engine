import json
import os
import re

import anthropic

from core.models import to_dict

_client = None


def _get_client():
    global _client
    if not _client:
        _client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _client


def infer_spec(crawl: dict) -> dict:
    prompt = f"""You are an expert product analyst and QA engineer.
A browser visited a website and collected the following crawl data:

URL: {crawl.get("url")}
Page title: {crawl.get("title")}
Navigation links: {crawl.get("nav_links")}
Button labels found: {crawl.get("buttons")}
Forms found (fields count): {crawl.get("forms")}
Visible body text (first 600 chars): {crawl.get("text_snippet")}
HTTP status: {crawl.get("status_code")}
Console errors: {crawl.get("console_errors")}

Based ONLY on this data, infer with confidence:

1. What type of product this is (SaaS, e-commerce, portfolio, API docs, etc.)
2. Who the target user is
3. The 3 most critical user journeys (e.g. "sign up and activate account")
4. What "success" looks like for each journey
5. The most likely failure points given the tech stack visible in the crawl

Return ONLY valid JSON — no markdown, no explanation:
{{
  "product_type": "string",
  "target_user": "string",
  "inferred_purpose": "one sentence",
  "critical_journeys": [
    {{
      "name": "string",
      "steps": ["step 1", "step 2", "step 3"],
      "success_criteria": "string",
      "likely_failure_point": "string"
    }}
  ],
  "test_scenarios": [
    {{
      "name": "string",
      "goal": "string",
      "steps": ["step 1", "step 2", "step 3"],
      "expected_outcome": "string"
    }}
  ],
  "confidence": 0-100
}}"""
    r = _get_client().messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    text = r.content[0].text
    try:
        return json.loads(text)
    except Exception:
        match = re.search(r"{.*}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except Exception:
                pass
    return {
        "inferred_purpose": "Unknown product",
        "critical_journeys": [],
        "test_scenarios": [],
        "confidence": 0,
    }


def judge_web_audit(crawl: dict, description: str | None = None) -> dict:
    inferred_spec = None
    if not description:
        inferred_spec = infer_spec(crawl)
        description = inferred_spec.get("inferred_purpose", "")
    prompt = f"""You are a senior QA engineer reviewing a website reliability audit.
CRAWL DATA:
{json.dumps(crawl, indent=2)[:3000]}
SITE PURPOSE: {description or "Infer from the crawl data above."}
Analyze this data and return ONLY valid JSON matching this exact schema:
{{
"overall_health": "good|warning|critical",
"confidence": 0-100,
"product_type": "string — what kind of product this is",
"critical_journeys": ["list of key user flows you detected"],
"issues": [
{{"severity":"high|medium|low","title":"string","detail":"string","fix":"exact prompt to paste into the AI builder"}}
],
"passed": ["list of things that look correct"],
"summary": "2-sentence plain-English summary for a non-technical founder"
}}"""
    r = _get_client().messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    text = r.content[0].text
    match = re.search(r"{.*}", text, re.DOTALL)
    verdict = json.loads(match.group()) if match else {"raw": text}
    if inferred_spec:
        verdict["inferred_spec"] = inferred_spec
    return verdict


def build_journey_timeline(journey_results: list[dict] | None) -> list[dict]:
    timeline: list[dict] = []
    for journey in journey_results or []:
        steps = journey.get("steps") or []
        failed_step = next((step for step in steps if step.get("status") != "passed"), None)
        timeline.append(
            {
                "journey": journey.get("journey") or journey.get("name") or "Unnamed Journey",
                "app_type": journey.get("app_type"),
                "status": journey.get("status") or (
                    "FAILED" if failed_step else "PASSED"
                ),
                "failed_step": failed_step.get("step_name") if failed_step else None,
                "reason": failed_step.get("error") or failed_step.get("failure_type") if failed_step else None,
                "steps": [
                    {
                        "step": step.get("step_name") or step.get("goal") or "step",
                        "status": step.get("status") or "unknown",
                        "failure_type": step.get("failure_type"),
                        "evidence_delta": step.get("evidence_delta") or [],
                        "recovery_attempts": step.get("recovery_attempts") or [],
                    }
                    for step in steps
                ],
            }
        )
    return timeline


def build_fix_prompt_context(
    journey_results: list[dict] | None,
    state_snapshot_summary: dict | None = None,
) -> str:
    lines: list[str] = []
    if state_snapshot_summary:
        lines.append(
            "State context: " + json.dumps(to_dict(state_snapshot_summary), ensure_ascii=False)[:1200]
        )

    for journey in journey_results or []:
        lines.append(f"Journey: {journey.get('journey') or journey.get('name') or 'Unnamed Journey'}")
        for step in journey.get("steps") or []:
            status = step.get("status") or "unknown"
            reason = step.get("error") or step.get("failure_type") or ""
            delta = ", ".join(step.get("evidence_delta") or [])
            lines.append(
                f"- Step {step.get('step_name') or step.get('goal') or 'step'}: {status}"
                + (f" | reason: {reason}" if reason else "")
                + (f" | delta: {delta}" if delta else "")
            )

    return "\n".join(lines).strip()
