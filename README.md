# AI Breaker Lab

AI Breaker Lab is an AI testing, breaking, and observability platform with Clean Architecture, pluggable evaluators, and extensible metrics.

## Project structure

```text
ai-breaker-lab/
|
|-- api/
|   |-- auth.py
|   |-- database.py
|   |-- models.py
|   `-- rate_limit.py
|
|-- core/
|   |-- evaluator.py
|   |-- metrics.py
|   |-- pipeline.py
|   `-- providers.py
|
|-- evaluators/
|   |-- base_evaluator.py
|   |-- openai_evaluator.py
|   |-- anthropic_evaluator.py
|   |-- gemini_evaluator.py
|   `-- ollama_evaluator.py
|
|-- src/
|   `-- llm_eval_engine/
|       |-- domain/
|       |   |-- contracts.py
|       |   `-- models.py
|       |-- application/
|       |   |-- pipeline.py
|       |   |-- registry.py
|       |   `-- metrics.py
|       `-- infrastructure/
|           |-- config_loader.py
|           `-- evaluator_factories.py
|
|-- reports/
|   |-- report_generator.py
|   `-- (generated reports)
|
|-- dashboard/
|   |-- review_dashboard.jsx
|   `-- review-dashboard/
|
|-- configs/
|   `-- config.yaml
|
|-- data/
|   `-- sample_dataset.csv
|
|-- tests/
|   `-- .gitkeep
|
|-- main.py
`-- requirements.txt
```

## Notes

- API runtime entrypoint: `main.py`
- Core service API used by `main.py`: `core/`
- Provider adapters are isolated in `evaluators/` for easy plug-in extension.
- Config is loaded from `configs/config.yaml` (with root fallback in loader).

## Enterprise QA metrics included

- Hallucination score: `1 - (unsupported_claims / total_claims)` with overlap heuristic baseline.
- Toxicity and safety: `toxicity`, `safe` (supports `detoxify`, Perspective API via `PERSPECTIVE_API_KEY`).
- Faithfulness for RAG: `faithfulness`, `context_precision`, `context_recall` (uses `context` field when provided).
- Runtime and cost: `latency_ms`, `tokens_used`, `estimated_cost_usd` aggregated across judges.

`Sample` now supports optional `context` in `/evaluate` payload for RAG faithfulness metrics.

## API usage

### Authentication

- Header: `X-API-KEY: client_key`
- Keys are validated against `clients` table in `usage.db`.
- Billing/usage tracking is written to `usage_logs` with `client_id`, `report_id`, and `sample_count`.

You can bootstrap clients from `.env`:

```env
API_KEYS=acme:client_key,globex:another_key
```

### Evaluate endpoint

`POST /evaluate`

Request body:

```json
{
  "dataset_id": "dataset_v3",
  "model_version": "gpt4.1-2026-03-05",
  "dataset": [
    {
      "question": "What is the capital of France?",
      "ground_truth": "Paris",
      "model_answer": "The capital of France is Paris."
    }
  ]
}
```

Response includes enterprise summary:

```json
{
  "summary": {
    "correctness": 0.92,
    "relevance": 0.88,
    "hallucination": 0.97,
    "toxicity": 0.01,
    "overall": 0.91
  },
  "model_comparison": [
    {
      "model": "gpt-4",
      "correctness": 0.93,
      "relevance": 0.91,
      "hallucination": 0.96,
      "overall": 0.93
    }
  ],
  "best_model": {
    "model": "gpt-4",
    "overall": 0.93
  }
}
```

Backward compatibility: `samples` is still accepted in place of `dataset`.

Dataset versioning metadata is stored per run:

- `dataset_id`
- `model_version`
- `evaluation_date`

This is returned in `/history` for regression detection workflows.

Additional dashboard endpoints:

- `GET /providers` -> configured model providers.
- `GET /reports` -> generated HTML report index.
- `GET /reports/{file_name}` -> serve a specific HTML report file.
- `GET /history` -> evaluation usage history.
- `GET /usage/summary` -> requests/samples summary for authenticated client.

Human-in-the-loop review:

- `POST /report/{report_id}/human-review` supports reviewer labels:
  - `verdict`: `correct` or `incorrect`
  - `hallucinated`: boolean
  - `feedback`: free text
- Retrained rule outputs are persisted in `configs/review_rules.json`.
- `GET /review/rules` returns latest retrained thresholds.

Cost analysis:

- Metrics include `cost_analysis` rows:
  - `model`
  - `avg_tokens`
  - `avg_cost_usd`
  - `cost_per_1000_requests_usd`

CI quality gate:

- Script: `scripts/quality_gate.py`
- Workflow: `.github/workflows/ai-quality-gate.yml`
- Pipeline fails when correctness is below threshold (`--min-correctness`).
