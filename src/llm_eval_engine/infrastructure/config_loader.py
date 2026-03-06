from __future__ import annotations

import os
from pathlib import Path

import yaml


def _apply_env_overrides(config: dict) -> dict:
    overrides = {
        "ollama_url": os.getenv("OLLAMA_URL"),
        "ollama_model": os.getenv("OLLAMA_MODEL"),
        "openai_model": os.getenv("OPENAI_MODEL"),
        "anthropic_model": os.getenv("ANTHROPIC_MODEL"),
        "gemini_model": os.getenv("GEMINI_MODEL"),
        "judge_provider": os.getenv("JUDGE_PROVIDER"),
        "model": os.getenv("MODEL"),
    }
    for key, value in overrides.items():
        if value:
            config[key] = value

    judge_providers_env = os.getenv("JUDGE_PROVIDERS")
    if judge_providers_env:
        providers = [item.strip() for item in judge_providers_env.split(",") if item.strip()]
        if providers:
            config["judge_providers"] = providers

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
