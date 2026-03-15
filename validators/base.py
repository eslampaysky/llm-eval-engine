from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict


class DeterministicValidator(ABC):
    """
    Base interface for deterministic validators that run locally
    and always produce the same result for the same output string.
    """

    @abstractmethod
    def validate(self, output: str) -> Dict[str, Any]:
        """
        Validate a single model output.

        Returns a dictionary that MUST contain:
        - passed: bool  -> whether the output passed validation
        - detail: str   -> short human-readable explanation
        Implementations may add extra keys as needed.
        """

