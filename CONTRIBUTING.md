# Contributing to AiBreaker

Thanks for your interest in improving AiBreaker. This guide covers how to set up the project, run tests, and submit changes.

## Getting Started

1. Create a virtual environment and install dependencies.
2. Copy `.env.judges.example` to `.env` and fill in required keys.
3. Run the API and dashboard locally.

```bash
python -m venv .venv
./.venv/Scripts/Activate.ps1
pip install -r requirements.txt
```

## Running Locally

```bash
python -m uvicorn api.main:app --reload --port 8000
```

```bash
cd dashboard/review-dashboard
npm install
npm run dev
```

## Tests

```bash
python -m pytest tests/ -v --tb=short
```

## Pull Requests

1. Keep changes focused and small.
2. Add or update tests when behavior changes.
3. Update docs or README if the user-facing behavior changes.
4. Ensure `python -m pytest tests/ -v --tb=short` passes.

## Reporting Issues

Please include:
- Clear reproduction steps
- Expected vs actual behavior
- Logs or screenshots if relevant
- Environment details (OS, Python version, node version)
