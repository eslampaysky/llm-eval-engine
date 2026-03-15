# AiBreaker

AiBreaker is a web QA platform for AI-built apps. Point it at a URL or model endpoint and it generates adversarial tests, runs the audit, and returns a report with video replay plus fix prompts you can paste into your AI builder.

## Why AiBreaker

- Catch broken flows before users do.
- See the exact replay of what failed.
- Get plain-English failure summaries and fix prompts.
- Track regressions across releases.

## Quick Start (API + Dashboard)

### 1. Configure environment

AiBreaker requires PostgreSQL in all environments.

```
DATABASE_URL=postgresql://user:pass@localhost:5432/aibreaker
GROQ_API_KEY=...
ANTHROPIC_API_KEY=...
TARGETS_SECRET=...
```

### 2. Run the API

```
python -m uvicorn api.main:app --reload --port 8000
```

### 3. Run the dashboard

```
cd dashboard/review-dashboard
npm install
npm run dev
```

Dashboard: `http://localhost:5173`  
API: `http://localhost:8000`

## Docker

```
docker compose up --build
```

API: `http://localhost:8000`  
Dashboard: `http://localhost:5173`

## Core Endpoints

- `POST /break` — Adversarial evaluation against a model endpoint
- `POST /evaluate` — Evaluate provided samples
- `POST /web-audit` — Crawl and audit a web app
- `GET /report/{id}` — Fetch report results
- `GET /web-audit/{id}/video` — Replay video (authenticated)

## GitHub Action (PR Comment Bot)

AiBreaker ships a GitHub Action in `github-action/` that can run audits in CI and comment on pull requests with the score and report URL. See the example workflow in `.github/workflows/aibreaker-pr-comment.yml`.

## Project Structure

```
api/                      # FastAPI backend (api.main:app)
core/                     # Audit logic and evaluators
reports/                  # HTML report generation
dashboard/review-dashboard/  # React dashboard
github-action/            # GitHub Action for CI audits
```

## Tests

```
python -m pytest tests/ -v --tb=short
```

## License

See `LICENSE`.
