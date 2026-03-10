from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from api.routes import initialize_api_storage, router

# ── Persistent data directory ─────────────────────────────────────────────────
# Set DATA_DIR env var on Railway after attaching a Volume at /app/data.
# Falls back to local ./data for development.
DATA_DIR = Path(os.getenv("DATA_DIR", "/app/data"))
REPORTS_DIR = DATA_DIR / "reports"
DATA_DIR.mkdir(parents=True, exist_ok=True)
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def create_app() -> FastAPI:
    app = FastAPI(
        title="AI Breaker Lab API",
        version="1.0.0",
        description="Adversarial evaluation API — break your model before production does.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    initialize_api_storage()
    app.include_router(router)

    # Serve generated HTML reports as static files
    app.mount("/reports", StaticFiles(directory=str(REPORTS_DIR)), name="reports")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": "1.0.0"}

    return app


app = create_app()