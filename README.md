# AI Breaker Lab

AI Breaker Lab is an AI evaluation and observability platform for testing LLM outputs across correctness, relevance, hallucination, safety, and cost. It includes:

- FastAPI backend with API-key auth and usage tracking
- Multi-provider evaluator pipeline (Ollama, Gemini, OpenAI, Anthropic)
- Human review workflow and retrained review rules
- HTML report generation
- React/Vite dashboard for running and reviewing evaluations

## Project structure

```text
llm-eval-engine-legacy/
|
|-- api/
|   |-- auth.py
|   |-- database.py
|   |-- main.py
|   |-- models.py
|   |-- rate_limit.py
|   `-- routes.py
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
|   |-- llm_eval_engine/            # clean-architecture implementation
|   |   |-- application/
|   |   |-- domain/
|   |   `-- infrastructure/
|   |-- domain/
|   |-- evaluators/
|   `-- use_cases/
|
|-- reports/
|   |-- report_generator.py
|   `-- report_*.html               # generated reports
|
|-- dashboard/
|   `-- review-dashboard/           # Vite React frontend
|
|-- configs/
|   |-- config.yaml
|   `-- review_rules.json           # created/updated after human review
|
|-- data/
|   `-- sample_dataset.csv
|
|-- scripts/
|   `-- quality_gate.py
|
|-- tests/
|
|-- Dockerfile
|-- docker-compose.yml
|-- main.py                         # current runtime entrypoint in Docker
|-- railway.toml                    # Railway deployment config
|-- requirements.txt
`-- usage.db
```

## Runtime entrypoints

- Current deployment entrypoint: `main.py` (used by Dockerfile)
- Modular API entrypoint: `api/main.py` (uses `api/routes.py`)

Both expose:

- `GET /health` -> `{"status":"ok","version":"1.0.0"}`

## Features

- API-key authentication via `X-API-KEY`
- Usage logging and per-client history
- Background evaluation for larger datasets
- Human review endpoint with persisted review rules
- Metrics:
  - correctness
  - relevance
  - hallucination score
  - toxicity/safety
  - latency/tokens/cost analysis
- Report export as HTML files under `reports/`

## Environment variables

Create `.env` in project root:

```env
# Provider keys (enable whichever providers you use)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GEMINI_API_KEY=

# API keys used by your clients to call this backend
# Format supports:
# API_KEYS=plain_key_1,plain_key_2
# or named keys:
# API_KEYS=acme:client_key,globex:another_key
API_KEYS=client_key

# Optional overrides
# MAX_WORKERS=4
# SENTRY_DSN=  # Get a free DSN at sentry.io
# REPORTS_STORAGE=local  # local (default) or s3
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_S3_BUCKET=
# AWS_S3_REGION=us-east-1
# AWS_S3_ENDPOINT_URL=  # Optional (for S3-compatible providers like Cloudflare R2)
SLACK_WEBHOOK_URL=
STRIPE_SECRET_KEY=
STRIPE_PRO_PRICE_ID=
OLLAMA_URL=http://host.docker.internal:11434
PERSPECTIVE_API_KEY=
``` 

## Local development

### Backend

```bash
python -m venv .venv
# Windows PowerShell
. .venv/Scripts/Activate.ps1
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Note: `usage.db` is a local SQLite file that is auto-created on first run (usage tracking). It is a runtime artifact and should not be committed to git.

Docs: `http://127.0.0.1:8000/docs`

### Dashboard (Vite React)

```bash
cd dashboard/review-dashboard
npm install
npm run dev
```

Dashboard: `http://127.0.0.1:5173`

Set frontend API base URL:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Docker compose

```bash
docker compose up --build
```

Starts:

- API on `:8000`
- Dashboard on `:5173`
- Ollama on `:11434`

## API usage

### Authentication

All protected endpoints require:

```http
X-API-KEY: <your_key>
```

### Evaluate

`POST /evaluate`

Request:

```json
{
  "dataset_id": "dataset_v3",
  "model_version": "gpt4.1-2026-03-05",
  "dataset": [
    {
      "question": "What is the capital of France?",
      "ground_truth": "Paris",
      "model_answer": "The capital of France is Paris.",
      "context": "France is a country in Europe."
    }
  ]
}
```

Notes:

- `samples` is supported as backward-compatible alias of `dataset`.
- `judge_model` can be provided to force a specific evaluator model.

### Main endpoints

- `GET /health`
- `POST /evaluate`
- `GET /providers`
- `GET /reports`
- `GET /report/{report_id}`
- `POST /report/{report_id}/human-review`
- `GET /history`
- `GET /usage/summary`
- `GET /review/rules`

## Deployment

### Backend on Railway

`railway.toml` is already configured in repo root.

Database:

- Set `DATABASE_URL` to your Railway Postgres connection string.
- Leave it unset for local SQLite.

Reports:

- By default, HTML reports are written to local disk under `reports/` (ephemeral on Railway).
- For multi-instance / durable storage, set `REPORTS_STORAGE=s3` and configure the `AWS_*` S3 variables.

Commands:

```bash
npm i -g @railway/cli
railway login
railway init
railway up
```

Set env vars from local `.env` (PowerShell):

```powershell
Get-Content .env |
  Where-Object { $_ -match '^\s*[^#].+=.+' } |
  ForEach-Object { railway variable set --skip-deploys $_ }

railway up
```

### Dashboard on Vercel (separate from API)

```bash
cd dashboard/review-dashboard
npm i -g vercel
vercel
```

Then add env variable in Vercel:

- `VITE_API_BASE_URL=https://<your-railway-service>.up.railway.app`

CLI option:

```bash
vercel env add VITE_API_BASE_URL production
vercel env add VITE_API_BASE_URL preview
vercel --prod
```

## CI quality gate

- Script: `scripts/quality_gate.py`
- Workflow: `.github/workflows/ai-quality-gate.yml`
- Fails pipeline when configured correctness threshold is not met.
