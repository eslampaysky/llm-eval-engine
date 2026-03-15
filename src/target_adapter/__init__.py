from __future__ import annotations

import json
import logging
from typing import Any, Dict

import requests

from .autogen_adapter import AutoGenAdapter
from .base import BaseTargetAdapter, Payload
from .crewai_adapter import CrewAIAdapter
from .langchain_adapter import LangChainAdapter

_log = logging.getLogger(__name__)


def _ensure_payload(payload: Payload) -> Payload:
    """
    Normalize incoming payload to the expected multimodal shape.
    """
    if payload is None:
        return {"text": "", "image_b64": None, "mime_type": None}
    if not isinstance(payload, dict):
        return {"text": str(payload), "image_b64": None, "mime_type": None}
    return {
      "text": str(payload.get("text", "")),
      "image_b64": payload.get("image_b64"),
      "mime_type": payload.get("mime_type"),
    }


class OpenAICompatibleAdapter(BaseTargetAdapter):
    def __init__(self, base_url: str, api_key: str, model_name: str) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._api_key = api_key or ""
        self._model_name = model_name

    def call(self, payload: Payload) -> str:
        data = _ensure_payload(payload)
        text = data["text"]
        image_b64 = data.get("image_b64")
        mime_type = data.get("mime_type") or "image/png"

        if not self._base_url:
            raise ValueError("OpenAI-compatible adapter requires 'base_url'.")
        if not self._model_name:
            raise ValueError("OpenAI-compatible adapter requires 'model_name'.")

        # Smart endpoint building:
        # - already ends with /chat/completions → use as-is
        # - ends with /v1 or /openai → append /chat/completions
        # - anything else → append /v1/chat/completions
        if self._base_url.endswith("/chat/completions"):
            endpoint = self._base_url
        elif self._base_url.endswith("/v1") or self._base_url.endswith("/openai"):
            endpoint = f"{self._base_url}/chat/completions"
        else:
            endpoint = f"{self._base_url}/v1/chat/completions"

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        if image_b64:
            content: Any = [
                {"type": "text", "text": text},
                {
                    "type": "image_url",
                    "url": f"data:{mime_type};base64,{image_b64}",
                },
            ]
        else:
            # Backwards compatible: plain text content.
            content = text

        response = requests.post(
            endpoint,
            headers=headers,
            json={
                "model": self._model_name,
                "messages": [{"role": "user", "content": content}],
                "temperature": 0.0,
            },
            timeout=120,
        )
        response.raise_for_status()
        payload_json = response.json()
        content_out = payload_json["choices"][0]["message"]["content"]
        return str(content_out).strip()


class GeminiDemoAdapter(OpenAICompatibleAdapter):
    def __init__(self, api_key: str, model_name: str) -> None:
        super().__init__(
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            api_key=api_key,
            model_name=model_name,
        )


class HuggingFaceAdapter(BaseTargetAdapter):
    def __init__(self, repo_id: str, api_token: str) -> None:
        self._repo_id = repo_id
        self._api_token = api_token or ""

    def call(self, payload: Payload) -> str:
        data = _ensure_payload(payload)
        question = data["text"]
        if data.get("image_b64"):
            _log.warning("Multimodal input ignored: HuggingFaceAdapter does not support image/pdf.")
        if not self._repo_id:
            raise ValueError("HuggingFace adapter requires 'repo_id'.")
        if not self._api_token:
            raise ValueError("HuggingFace adapter requires 'api_token'.")

        endpoint = f"https://api-inference.huggingface.co/models/{self._repo_id}"
        response = requests.post(
            endpoint,
            headers={"Authorization": f"Bearer {self._api_token}"},
            json={"inputs": question},
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()

        if isinstance(payload, list) and payload:
            first = payload[0]
            if isinstance(first, dict) and "generated_text" in first:
                return str(first["generated_text"]).strip()

        if isinstance(payload, dict):
            if "generated_text" in payload:
                return str(payload["generated_text"]).strip()
            if "answer" in payload:
                return str(payload["answer"]).strip()
            if "response" in payload:
                return str(payload["response"]).strip()

        return str(payload).strip()


class WebhookAdapter(BaseTargetAdapter):
    def __init__(self, endpoint_url: str, headers: dict, payload_template: str) -> None:
        self._endpoint_url = endpoint_url
        self._headers = headers or {}
        self._payload_template = payload_template

    def call(self, payload: Payload) -> str:
        data = _ensure_payload(payload)
        question = data["text"]
        if data.get("image_b64"):
            _log.warning("Multimodal input ignored: WebhookAdapter does not support image/pdf.")
        if not self._endpoint_url:
            raise ValueError("Webhook adapter requires 'endpoint_url'.")
        if not self._payload_template:
            raise ValueError("Webhook adapter requires 'payload_template'.")

        payload_text = self._payload_template.replace("{question}", question)
        payload = json.loads(payload_text)

        response = requests.post(
            self._endpoint_url,
            headers=self._headers,
            json=payload,
            timeout=120,
        )
        response.raise_for_status()
        body = response.json()

        for key in ("output", "answer", "response"):
            if isinstance(body, dict) and key in body:
                return str(body[key]).strip()

        raise ValueError("Webhook response missing output/answer/response field.")


class AdapterFactory:
    @staticmethod
    def from_config(config: dict) -> BaseTargetAdapter:
        adapter_type = (config.get("type") or "").strip().lower()

        if adapter_type == "openai":
            return OpenAICompatibleAdapter(
                base_url=str(config.get("base_url", "")),
                api_key=str(config.get("api_key", "")),
                model_name=str(config.get("model_name", "")),
            )

        if adapter_type == "huggingface":
            return HuggingFaceAdapter(
                repo_id=str(config.get("repo_id", "")),
                api_token=str(config.get("api_token", "")),
            )

        if adapter_type == "webhook":
            return WebhookAdapter(
                endpoint_url=str(config.get("endpoint_url", "")),
                headers=config.get("headers", {}) or {},
                payload_template=str(config.get("payload_template", "")),
            )

        if adapter_type == "langchain":
            return LangChainAdapter(
                chain_import_path=str(config.get("chain_import_path", "")),
                invoke_key=str(config.get("invoke_key", "question")),
            )

        if adapter_type == "crewai":
            return CrewAIAdapter(
                crew_import_path=str(config.get("crew_import_path", "")),
                agent_role=str(config.get("agent_role", "")),
                agent_goal=str(config.get("agent_goal", "")),
                agent_backstory=str(config.get("agent_backstory", "")),
            )

        if adapter_type == "autogen":
            return AutoGenAdapter(
                config_list=config.get("config_list") or [],
                system_message=str(config.get("system_message", "")),
            )

        raise ValueError(f"Unsupported target adapter type: {adapter_type}")
