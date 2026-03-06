from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import initialize_api_storage, router


def create_app() -> FastAPI:
    app = FastAPI(
        title="LLM Eval API",
        version="1.0.0",
        description="Evaluation API with API-key auth, report persistence, and human review.",
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

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "version": "1.0.0"}

    return app


app = create_app()
