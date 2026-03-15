from __future__ import annotations

import json
from typing import Any, Dict, List

from .base import BaseTargetAdapter, Payload


def _extract_text(payload: Payload) -> str:
    if payload is None:
        return ""
    if isinstance(payload, dict):
        return str(payload.get("text", ""))
    return str(payload)


class AutoGenAdapter(BaseTargetAdapter):
    def __init__(self, config_list: List[Dict[str, Any]], system_message: str) -> None:
        self._config_list = config_list or []
        self._system_message = system_message or ""

    def call(self, payload: Payload) -> str:
        try:
            import autogen  # type: ignore[import]
        except ImportError as exc:  # pragma: no cover - depends on external package
            raise ImportError(
                "AutoGenAdapter requires the 'autogen' package. "
                "Install it with: pip install pyautogen"
            ) from exc

        text = _extract_text(payload)

        llm_config: Dict[str, Any] = {
            "config_list": self._config_list,
        }
        if self._system_message:
            llm_config["system_message"] = self._system_message

        assistant = autogen.AssistantAgent(  # type: ignore[attr-defined]
            name="assistant",
            llm_config=llm_config,
        )

        # Initiate a simple chat with the user message.
        reply = assistant.generate_reply(  # type: ignore[call-arg]
            messages=[{"role": "user", "content": text}]
        )

        # Build a basic trajectory from the assistant's chat history, if available.
        trajectory: List[Dict[str, str]] = []
        chat_messages = getattr(assistant, "chat_messages", None)
        if isinstance(chat_messages, dict):
            for conv in chat_messages.values():
                if not isinstance(conv, list):
                    continue
                for msg in conv:
                    if not isinstance(msg, dict):
                        continue
                    sender = str(msg.get("role") or msg.get("name") or "assistant")
                    content = str(msg.get("content", ""))
                    trajectory.append({"sender": sender, "content": content})

        final_answer: str
        if isinstance(reply, str):
            final_answer = reply
        elif trajectory:
            final_answer = trajectory[-1]["content"]
        else:
            final_answer = str(reply)

        return json.dumps(
            {
                "final_answer": final_answer,
                "trajectory": trajectory,
            },
            ensure_ascii=False,
        )

