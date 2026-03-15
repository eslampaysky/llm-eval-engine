from __future__ import annotations

import json
from typing import Any, Dict

from .base import DeterministicValidator


class JsonValidator(DeterministicValidator):
    """
    Validate that the output is valid JSON.
    """

    def validate(self, output: str) -> Dict[str, Any]:
        try:
            parsed: Any = json.loads(output)
        except Exception as exc:
            return {
                "passed": False,
                "detail": f"Invalid JSON: {exc}",
                "parsed": None,
            }

        return {
            "passed": True,
            "detail": "Valid JSON.",
            "parsed": parsed,
        }

