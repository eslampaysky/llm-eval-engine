from pathlib import Path

import yaml


def load_project_config() -> dict:
    root = Path(__file__).resolve().parents[3]
    candidates = [
        root / "configs" / "config.yaml",
        root / "config.yaml",
    ]

    for config_path in candidates:
        if config_path.exists():
            with open(config_path, "r", encoding="utf-8") as stream:
                return yaml.safe_load(stream) or {}

    raise FileNotFoundError("No config.yaml found in configs/ or project root.")
