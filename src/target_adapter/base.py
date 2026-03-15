from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


Payload = Dict[str, Any]


class BaseTargetAdapter(ABC):
    @abstractmethod
    def call(self, payload: Payload) -> str:
        """
        Invoke the target model with a structured payload.

        Expected payload shape:
            {
              "text": str,
              "image_b64": str | None,
              "mime_type": str | None,
            }
        """
        raise NotImplementedError

