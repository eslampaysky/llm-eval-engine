# aibreaker

Official Python SDK for [AI Breaker Lab](https://llm-eval-engine-production.up.railway.app).

## Install

```bash
pip install aibreaker
```

## Quick start

```python
from aibreaker import BreakerClient

client = BreakerClient(
    api_key="client_key",
    groq_api_key="gsk_...",   # forwarded to backend for test generation + judging
)

report = client.break_model(
    target={
        "type":       "openai",
        "base_url":   "https://api.openai.com",
        "api_key":    "sk-...",
        "model_name": "gpt-4o-mini",
    },
    description="Customer-support chatbot for an e-commerce platform",
    num_tests=20,
    fail_threshold=5.0,
)

print(report)
# Report a3f8b2c1  ✓ PASSED
#   Score         : 7.40 / 10
#   Failures      : 3 / 20
#   Hallucinations: 1
#   Agreement     : 100%
#   Red flags     : 0

if not report.passed:
    for f in report.failures:
        print(f"  ✗ [{f.test_type}] score={f.score}  {f.question}")
    raise SystemExit(1)
```

## Supported target types

| Type | Required fields |
|------|----------------|
| `openai` | `base_url`, `api_key`, `model_name` |
| `huggingface` | `repo_id`, `api_token` |
| `webhook` | `endpoint_url`, `payload_template` |

Works with any OpenAI-compatible endpoint: Groq, Gemini, vLLM, Ollama, etc.

## Report object

| Attribute | Type | Description |
|-----------|------|-------------|
| `report.score` | `float` | Average weighted score (0–10) |
| `report.passed` | `bool` | `True` when `score >= fail_threshold` |
| `report.failures` | `tuple[FailedTest]` | Tests the model failed |
| `report.failure_count` | `int` | Number of failed tests |
| `report.hallucination_count` | `int` | Hallucinations detected |
| `report.metrics` | `Metrics` | Full metrics object |
| `report.metrics.judges_agreement` | `float` | Judge agreement rate 0–1 |
| `report.metrics.red_flags` | `tuple[str]` | Auto-detected issues |
| `report.html_report_url` | `str \| None` | URL to HTML report |

## CI / CD

See the [aibreaker GitHub Action](https://github.com/your-org/aibreaker-action) for
one-step CI integration.

```yaml
- uses: your-org/aibreaker-action@v1
  with:
    api_key: ${{ secrets.BREAKER_API_KEY }}
    groq_api_key: ${{ secrets.GROQ_API_KEY }}
    endpoint: https://llm-eval-engine-production.up.railway.app
    description: "Customer support chatbot"
    fail_threshold: "5.0"
```