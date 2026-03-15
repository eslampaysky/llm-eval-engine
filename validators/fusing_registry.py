from __future__ import annotations

from typing import Optional

from .base import DeterministicValidator
from .json_validator import JsonValidator
from .python_validator import PythonValidator
from .sql_validator import SqlValidator


class FusingRegistry:
    """
    Lightweight registry mapping question_type → validator instance.
    """

    _REGISTRY: dict[str, DeterministicValidator] = {
        "code": PythonValidator(),
        "json": JsonValidator(),
        "sql": SqlValidator(),
    }

    @classmethod
    def get(cls, question_type: str) -> Optional[DeterministicValidator]:
        """
        Return a validator instance for the given question_type, or None
        if no validator is configured (in which case fusing is skipped).
        """
        if not question_type:
            return None
        key = str(question_type).strip().lower()
        return cls._REGISTRY.get(key)

