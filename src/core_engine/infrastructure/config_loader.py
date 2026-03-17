from __future__ import annotations

import os
from pathlib import Path

import yaml


def _apply_env_overrides(config: dict) -> dict:
    def _to_bool(value: str | None):
        if value is None:
            return None
        return value.strip().lower() in {"1", "true", "yes", "on"}

    overrides = {
        "ollama_url": os.getenv("OLLAMA_URL"),
        "ollama_model": os.getenv("OLLAMA_MODEL"),
        "openai_model": os.getenv("OPENAI_MODEL"),
        "anthropic_model": os.getenv("ANTHROPIC_MODEL"),
        "gemini_model": os.getenv("GEMINI_MODEL"),
        "judge_provider": os.getenv("JUDGE_PROVIDER"),
        "model": os.getenv("MODEL"),
        "gemini_max_retries": os.getenv("GEMINI_MAX_RETRIES"),
        "gemini_min_gap_seconds": os.getenv("GEMINI_MIN_GAP_SECONDS"),
        "gemini_backoff_base_seconds": os.getenv("GEMINI_BACKOFF_BASE_SECONDS"),
        "gemini_backoff_max_seconds": os.getenv("GEMINI_BACKOFF_MAX_SECONDS"),
        "gemini_backoff_jitter_seconds": os.getenv("GEMINI_BACKOFF_JITTER_SECONDS"),
    }
    for key, value in overrides.items():
        if value:
            config[key] = value

    judge_providers_env = os.getenv("JUDGE_PROVIDERS")
    if judge_providers_env:
        providers = [item.strip() for item in judge_providers_env.split(",") if item.strip()]
        if providers:
            config["judge_providers"] = providers

    gemini_mock_mode = _to_bool(os.getenv("GEMINI_MOCK_MODE"))
    if gemini_mock_mode is not None:
        config["gemini_mock_mode"] = gemini_mock_mode

    target_model = config.get("target_model")
    if not isinstance(target_model, dict):
        target_model = {}

    target_overrides = {
        "type": os.getenv("TARGET_MODEL_TYPE"),
        "base_url": os.getenv("TARGET_BASE_URL"),
        "api_key": os.getenv("TARGET_API_KEY"),
        "model_name": os.getenv("TARGET_MODEL_NAME"),
        "repo_id": os.getenv("TARGET_REPO_ID"),
        "api_token": os.getenv("TARGET_API_TOKEN"),
        "endpoint_url": os.getenv("TARGET_ENDPOINT_URL"),
        "payload_template": os.getenv("TARGET_PAYLOAD_TEMPLATE"),
    }
    for key, value in target_overrides.items():
        if value:
            target_model[key] = value

    target_headers = os.getenv("TARGET_HEADERS_JSON")
    if target_headers:
        import json

        target_model["headers"] = json.loads(target_headers)

    if target_model:
        config["target_model"] = target_model

    return config


def load_project_config() -> dict:
    root = Path(__file__).resolve().parents[3]
    candidates = [
        root / "configs" / "config.yaml",
        root / "config.yaml",
    ]

    for config_path in candidates:
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as stream:
                raw = yaml.safe_load(stream) or {}
                return _apply_env_overrides(raw)

    raise FileNotFoundError("No config.yaml found in configs/ or project root.")
