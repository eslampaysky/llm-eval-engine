# aibreaker

Official Python SDK for [AI Breaker Lab](https://ai-breaker-labs.vercel.app).

## Install

```bash
pip install aibreaker
```

## Quick start

```python
from aibreaker import BreakerClient

client = BreakerClient(
    api_key="client_key",
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
| `langchain` | `chain_import_path`, `invoke_key` |

Works with any OpenAI-compatible endpoint: Groq, Gemini, vLLM, Ollama, etc.

### LangChain example

```python
target = {
    "type": "langchain",
    "chain_import_path": "my_module.my_chain",  # must be importable by the backend
    "invoke_key": "question",
}
```

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

## Error handling

All SDK calls raise `BreakerError` when the backend returns a non-2xx response (e.g. 401/429/5xx) or when polling fails (timeouts, network errors).

```python
from aibreaker import BreakerClient, BreakerError

client = BreakerClient(
    api_key="client_key",
    endpoint="https://ai-breaker-labs.vercel.app",
    poll_interval=5,  # seconds between GET /report/{id}
    timeout=600,      # total seconds to wait before giving up
)

try:
    report = client.break_model(
        target={
            "type": "openai",
            "base_url": "https://api.openai.com",
            "api_key": "sk-...",
            "model_name": "gpt-4o-mini",
        },
        description="Customer-support chatbot for an e-commerce platform",
        num_tests=20,
    )
except BreakerError as e:
    print(f"BreakerError: {e}")
    raise

print(report.score, report.passed)
```

| Situation | Exception | How to handle |
| --- | --- | --- |
| Invalid API key | BreakerError (401) | Check your `api_key` |
| Rate limited | BreakerError (429) | Reduce `num_tests` or wait |
| Job timed out | BreakerError | Increase `timeout=` param |
| Backend unreachable | BreakerError | Check `endpoint=` URL |

`timeout` and `poll_interval` are set on `BreakerClient(...)`. Increase `timeout` for long-running jobs (large `num_tests`, slow target, heavy load). Decrease `poll_interval` if you want more frequent status checks, but keep it reasonable to avoid extra load and 429s.

## CI / CD

See the [aibreaker GitHub Action](https://github.com/your-org/aibreaker-action) for
one-step CI integration.

```yaml
- uses: your-org/aibreaker-action@v1
  with:
    api_key: ${{ secrets.BREAKER_API_KEY }}
    endpoint: https://ai-breaker-labs.vercel.app
    description: "Customer support chatbot"
    fail_threshold: "5.0"
    comment_on_pr: "true"
    github_token: ${{ secrets.GITHUB_TOKEN }}
```
