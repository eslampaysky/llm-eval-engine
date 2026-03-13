from __future__ import annotations

from abc import ABC, abstractmethod


class BaseTargetAdapter(ABC):
    @abstractmethod
    def call(self, question: str) -> str:
        raise NotImplementedError

