from __future__ import annotations

import json
from abc import ABC, abstractmethod

import requests


class BaseTargetAdapter(ABC):
    @abstractmethod
    def call(self, question: str) -> str:
        raise NotImplementedError


class OpenAICompatibleAdapter(BaseTargetAdapter):
    def __init__(self, base_url: str, api_key: str, model_name: str) -> None:
        self._base_url = (base_url or "").rstrip("/")
        self._api_key = api_key or ""
        self._model_name = model_name

    def call(self, question: str) -> str:
        if not self._base_url:
            raise ValueError("OpenAI-compatible adapter requires 'base_url'.")
        if not self._model_name:
            raise ValueError("OpenAI-compatible adapter requires 'model_name'.")

        if self._base_url.endswith("/v1"):
            endpoint = f"{self._base_url}/chat/completions"
        else:
            endpoint = f"{self._base_url}/v1/chat/completions"

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        response = requests.post(
            endpoint,
            headers=headers,
            json={
                "model": self._model_name,
                "messages": [{"role": "user", "content": question}],
                "temperature": 0.0,
            },
            timeout=120,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload["choices"][0]["message"]["content"]
        return str(content).strip()


class HuggingFaceAdapter(BaseTargetAdapter):
    def __init__(self, repo_id: str, api_token: str) -> None:
        self._repo_id = repo_id
        self._api_token = api_token or ""

    def call(self, question: str) -> str:
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

    def call(self, question: str) -> str:
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

        raise ValueError(f"Unsupported target adapter type: {adapter_type}")
