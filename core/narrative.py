"""
Phase 5: LLM Narrative Summaries (Intelligence Upgrade)

Generates root-cause narratives, true impact calculations, and 
cross-audit structural patterns. 
Uses Gemini with structured JSON output for deep insights.

Key features:
- Abstract Root-Cause Explanations
- True Business Impact Prioritization
- Natural language explanation of what happened and why
"""

import json
import logging
import os

_log = logging.getLogger(__name__)


def _get_narrative_model():
    """Get Gemini model for narrative generation. Falls back to env config."""
    try:
        from core.gemini_judge import _get_gemini_model
        return _get_gemini_model()
    except Exception:
        try:
            import google.generativeai as genai
            api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
            if api_key:
                genai.configure(api_key=api_key)
                return genai.GenerativeModel("gemini-2.5-flash")
        except Exception:
            pass
    return None


def generate_advanced_narrative(
    url: str,
    score: int | None,
    app_type: str | None,
    findings: list[dict],
    journey_timeline: list[dict] | None = None,
    step_results: list[dict] | None = None,
) -> dict:
    """
    Generate a 2-3 sentence executive summary of audit results.
    
    This is deterministic-first: if LLM fails, falls back to template-based summaries.
    """
    # Count findings by severity
    severity_counts = {}
    for f in (findings or []):
        sev = f.get("severity", "medium")
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
    
    critical = severity_counts.get("critical", 0)
    high = severity_counts.get("high", 0)
    medium = severity_counts.get("medium", 0)
    low = severity_counts.get("low", 0)
    total = len(findings or [])
    
    # Journey status
    journey_summary = ""
    if journey_timeline:
        passed = sum(1 for j in journey_timeline if j.get("status", "").upper() == "PASSED")
        failed = sum(1 for j in journey_timeline if j.get("status", "").upper() == "FAILED")
        journey_summary = f"{passed} passed, {failed} failed"
    
    # Try LLM narrative with Structured JSON output
    model = _get_narrative_model()
    if model and total > 0:
        try:
            prompt = _build_narrative_prompt(
                url=url,
                score=score,
                app_type=app_type,
                findings=findings[:15],  # Provide more context for root cause correlation
                severity_counts=severity_counts,
                journey_timeline=journey_timeline,
                step_results=step_results
            )
            response = model.generate_content(prompt)
            raw = (response.text or "").strip()
            # Clean JSON block
            if "```json" in raw:
                raw = raw.split("```json")[-1].split("```")[0].strip()
            elif "```" in raw:
                raw = raw.split("```")[-1].split("```")[0].strip()
            
            parsed = json.loads(raw)
            return parsed
        except Exception as e:
            print(f"CRITICAL ERROR IN LLM: {e}")
            _log.debug(f"[Phase5] LLM advanced narrative failed: {e}")
    
    # Deterministic fallback
    return {
        "executive_summary": _build_template_summary(url, score, app_type, severity_counts, total, journey_summary),
        "root_cause": "Analysis completed without AI augmentation. Findings are strictly based on direct execution telemetry.",
        "impact_assessments": {}
    }


def _build_narrative_prompt(
    url: str,
    score: int | None,
    app_type: str | None,
    findings: list[dict],
    severity_counts: dict,
    journey_timeline: list[dict] | None,
    step_results: list[dict] | None,
) -> str:
    """Build prompt for LLM deep narrative analysis."""
    
    # Construct an aggregated failure view
    failures = []
    if step_results:
        for res in step_results:
            if res.get("status") == "failed" or res.get("failure_type"):
                failures.append({
                    "step": res.get("step_name") or res.get("goal"),
                    "failure_type": res.get("failure_type"),
                    "notes": res.get("notes")
                })
                
    findings_dump = json.dumps([{
        "id": i,
        "title": f.get("title"),
        "severity": f.get("severity"),
        "category": f.get("category"),
        "description": f.get("description")
    } for i, f in enumerate(findings)], indent=2)

    failures_dump = json.dumps(failures, indent=2)

    return f"""You are a Principal QA Architect analyzing execution logs for a web application to determine the TRUE root cause of failures.

TARGET APP: {url} (Type: {app_type or 'unknown'})
SCORE: {score}/100

RAW FINDINGS:
{findings_dump}

EXECUTION FAILURES:
{failures_dump}

TASK:
Do not just list the issues. Analyze the correlation between the raw findings and the execution failures to extract the deep root cause.

CRITICAL RULES FOR ROOT CAUSE AND SUMMARY:
1. MAX LENGTH: The root cause and summary MUST BE exactly 1-2 sentences. Avoid all filler text.
2. GROUNDING: EVERY claim must map exactly to a specific finding or step_result. You are strictly forbidden from hallucinating issues that do not exist or mentioning flows (like checkout) if they are not in the raw data.
3. PROPORTIONALITY: If the findings are strictly cosmetic or minor (e.g. contrast, font size), DO NOT invoke catastrophic business failure language. If there are 0 failures, explicitly state the app is healthy.

Return your analysis in EXACT JSON format with the following schema:
{{
  "executive_summary": "1-2 sentences summarizing the overall app health for a Product Owner",
  "root_cause": "1-2 sentences explaining the foundational 'Why' behind the grouped failures. If zero failures, return 'No foundational issues detected.'",
  "impact_assessments": {{
    "0": "Specific real-world business impact for finding ID 0 (1 sentence MAX)",
    "1": "Specific real-world business impact for finding ID 1 (1 sentence MAX)"
  }}
}}

Ensure valid JSON."""

def _build_template_summary(
    url: str,
    score: int | None,
    app_type: str | None,
    severity_counts: dict,
    total_findings: int,
    journey_summary: str,
) -> str:
    """Deterministic template-based summary (no LLM needed)."""
    if total_findings == 0:
        return f"Audit of {url} completed with no issues found. The site appears to be functioning correctly."
    
    score_val = score or 0
    critical = severity_counts.get("critical", 0)
    high = severity_counts.get("high", 0)
    
    if score_val >= 80:
        health = "The site is in good overall health"
    elif score_val >= 50:
        health = "The site has some issues that need attention"
    else:
        health = "The site has significant reliability issues"
    
    issue_desc = []
    if critical > 0:
        issue_desc.append(f"{critical} critical")
    if high > 0:
        issue_desc.append(f"{high} high-severity")
    
    issues_text = ""
    if issue_desc:
        issues_text = f", with {' and '.join(issue_desc)} issue{'s' if critical + high > 1 else ''} requiring immediate attention"
    
    journey_text = f" User journey testing showed {journey_summary}." if journey_summary else ""
    
    return f"{health} (score: {score_val}/100). Found {total_findings} issue{'s' if total_findings != 1 else ''}{issues_text}.{journey_text}"


def prioritize_findings(findings: list[dict], impact_assessments: dict | None = None) -> list[dict]:
    """
    Phase 5: Sort and annotate findings with LLM-determined impact (or fallback).
    """
    impact_assessments = impact_assessments or {}
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    
    # Sort by severity, then by confidence (if available)
    sorted_findings = sorted(
        findings,
        key=lambda f: (
            severity_order.get(f.get("severity", "medium"), 2),
            -(f.get("confidence", 50)),
        ),
    )
    
    # Add priority metadata and true impact
    for i, finding in enumerate(sorted_findings):
        finding["priority_rank"] = i + 1
        finding["business_impact"] = impact_assessments.get(str(i), impact_assessments.get(i, _infer_business_impact(finding)))
    
    return sorted_findings


def _infer_business_impact(finding: dict) -> str:
    """Infer business impact from finding category and severity."""
    severity = finding.get("severity", "medium")
    category = finding.get("category", "").lower()
    title = finding.get("title", "").lower()
    
    if severity == "critical":
        if "cart" in title or "checkout" in title or "payment" in title:
            return "Directly blocks revenue — users cannot complete purchases"
        if "login" in title or "auth" in title:
            return "Users cannot access the site — complete functionality loss"
        return "Critical user flow is broken — high user impact"
    
    if severity == "high":
        if category == "functionality":
            return "Core feature is not working correctly — may frustrate users"
        if category == "accessibility":
            return "Significant accessibility barrier — may exclude users"
        return "Important issue that affects user experience significantly"
    
    if severity == "medium":
        return "Moderate impact on user experience"
    
    return "Minor cosmetic or polish issue"


def generate_audit_narrative(result: dict) -> dict:
    """
    Phase 5: Generate complete narrative package for an audit result.
    
    Returns a dict with:
    - executive_summary: 2-3 sentence overview
    - prioritized_findings: sorted by business impact
    - recommendations: top 3 actionable items
    """
    url = result.get("url", "")
    score = result.get("score")
    app_type = result.get("app_type")
    findings = result.get("findings") or []
    journey_timeline = result.get("journey_timeline")
    step_results = result.get("step_results")
    
    # Generate advanced Phase 5 narrative
    llm_output = generate_advanced_narrative(
        url=url,
        score=score,
        app_type=app_type,
        findings=findings,
        journey_timeline=journey_timeline,
        step_results=step_results,
    )
    
    executive_summary = llm_output.get("executive_summary", "")
    root_cause = llm_output.get("root_cause", "")
    impacts = llm_output.get("impact_assessments", {})
    
    # Prioritize findings with LLM impacts
    prioritized = prioritize_findings([dict(f) for f in findings], impacts)
    
    # Extract top recommendations
    recommendations = []
    for f in prioritized[:3]:
        fix = f.get("fix_prompt") or f.get("description", "")
        if fix:
            recommendations.append({
                "priority": f.get("priority_rank", 0),
                "severity": f.get("severity", "medium"),
                "title": f.get("title", "Issue"),
                "action": fix[:200],
                "business_impact": f.get("business_impact", ""),
            })
    
    return {
        "executive_summary": executive_summary,
        "root_cause_narrative": root_cause,
        "prioritized_findings": prioritized,
        "top_recommendations": recommendations,
        "total_issues": len(findings),
        "score": score,
    }
