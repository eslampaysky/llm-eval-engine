import json
import time
import hashlib
import anthropic
import os

_anth = None


def _client():
    global _anth
    if not _anth:
        _anth = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    return _anth


# ── Baseline capture ──────────────────────────────────────────────────────────
def capture_baseline(feature_config: dict) -> dict:
    """
    Run a feature N times and capture a golden baseline.
    feature_config = { name, description, test_inputs:[...], call_fn }
    """
    results = []
    for inp in feature_config["test_inputs"]:
        output = feature_config["call_fn"](inp)
        results.append(
            {
                "input": inp,
                "output": output,
                "hash": hashlib.sha256(str(output).encode()).hexdigest()[:12],
            }
        )
    return {
        "feature": feature_config["name"],
        "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "samples": results,
        "fingerprint": hashlib.sha256(json.dumps(results).encode()).hexdigest()[:16],
    }


# ── Regression check ──────────────────────────────────────────────────────────
def check_regression(baseline: dict, current_results: list) -> dict:
    prompt = f"""You are an AI reliability engineer comparing two sets of outputs from the same AI feature.
Feature: {baseline['feature']}
Baseline captured: {baseline['captured_at']}
BASELINE OUTPUTS (gold standard):
{json.dumps(baseline['samples'], indent=2)[:2000]}
CURRENT OUTPUTS (today):
{json.dumps(current_results, indent=2)[:2000]}
Determine if there has been a regression. Look for:
- Quality degradation (less accurate, helpful, or coherent responses)
- Tone/style drift (significant personality change)
- Factual regression (things that were correct are now wrong)
- Format regression (output structure changed unexpectedly)
Return ONLY valid JSON:
{{
"regression_detected": true|false,
"severity": "critical|high|medium|low|none",
"confidence": 0-100,
"changed_samples": [
{{"input": "...", "baseline_output": "...", "current_output": "...", "change": "description"}}
],
"drift_summary": "one sentence for engineers",
"alert_message": "one sentence for the product owner (non-technical)"
}}"""
    r = _client().messages.create(
        model="claude-sonnet-4-20250514", max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    import re
    text = r.content[0].text
    match = re.search(r"{.*}", text, re.DOTALL)
    return json.loads(match.group()) if match else {"regression_detected": False, "raw": text}
