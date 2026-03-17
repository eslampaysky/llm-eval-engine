# AiBreaker Labs

AiBreaker is the **reliability layer for AI-built web apps**. Point it at any URL and it crawls the site, takes screenshots, runs user-journey tests, and returns a report with video replay plus fix prompts you can paste straight into your AI builder.

## Why AiBreaker

- **Catch broken flows** before your users do.
- **Video replay** of every test run so you can see exactly what failed.
- **Plain-English findings** with copy-paste fix prompts for Lovable, Bolt, Replit Agent, and other AI code editors.
- **Continuous monitoring** — schedule audits and get alerted on regressions.
- **PII masking** — all screenshots and crawl data are scrubbed for emails, phone numbers, and credit card patterns before leaving your environment.
- **Self-healing locators** — when a DOM selector breaks between deploys, AiBreaker asks Gemini for a replacement and retries automatically.

## Quick Start

### 1. Configure environment

AiBreaker requires PostgreSQL.

```
DATABASE_URL=postgresql://user:pass@localhost:5432/aibreaker
GEMINI_API_KEY=...
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

## Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/agentic-qa/` | Run a full agentic QA audit on a web app |
| POST | `/web-audit` | Crawl and audit a web app |
| GET  | `/agentic-qa/history` | List past audit runs |
| GET  | `/report/{id}` | Fetch audit report |
| GET  | `/web-audit/{id}/video` | Replay audit video |

## Audit Tiers

| Tier | What it does |
|------|-------------|
| **Vibe Check** | 30-second visual scan — screenshots + Gemini scoring |
| **Deep Dive** | Full crawl with user-journey execution and video |
| **Fix & Verify** | Deep Dive + AI-generated code fixes + re-test |

## Project Structure

```
api/            # FastAPI backend (api.main:app)
core/           # Audit engine, crawlers, and AI judges
reports/        # HTML/PDF report generation
dashboard/      # React dashboard (Vite)
github-action/  # GitHub Action for CI audits
tests/          # Pytest test suite
```

## Tests

```
python -m pytest tests/ -v --tb=short
```

## License

See `LICENSE`.
