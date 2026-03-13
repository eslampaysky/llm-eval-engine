from __future__ import annotations

import importlib
from typing import Any

from .base import BaseTargetAdapter


def _import_object(import_path: str) -> Any:
    """
    Import an object by dotted path, e.g. "my_module.my_chain".
    """
    import_path = (import_path or "").strip()
    if not import_path:
        raise ValueError("LangChain adapter requires 'chain_import_path'.")

    if "." not in import_path:
        module = importlib.import_module(import_path)
        return module

    module_path, attr_path = import_path.rsplit(".", 1)
    module = importlib.import_module(module_path)
    obj = getattr(module, attr_path)
    return obj


class LangChainAdapter(BaseTargetAdapter):
    def __init__(self, chain_import_path: str, invoke_key: str = "question") -> None:
        self._chain_import_path = (chain_import_path or "").strip()
        self._invoke_key = (invoke_key or "question").strip()
        if not self._invoke_key:
            raise ValueError("LangChain adapter requires non-empty 'invoke_key'.")

    def call(self, question: str) -> str:
        chain = _import_object(self._chain_import_path)
        if not hasattr(chain, "invoke"):
            raise TypeError(
                f"Imported object from {self._chain_import_path!r} does not have .invoke(...)"
            )

        result = chain.invoke({self._invoke_key: question})

        if isinstance(result, str):
            return result.strip()

        if isinstance(result, dict):
            if "output" in result:
                return str(result["output"]).strip()
            raise ValueError("LangChain chain returned a dict without an 'output' key.")

        content = getattr(result, "content", None)
        if content is not None:
            return str(content).strip()

        return str(result).strip()
