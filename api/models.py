"""
models.py — Pydantic request/response models for Breaker Lab API.
"""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class Sample(BaseModel):
    question: str
    ground_truth: str
    model_answer: Optional[str] = None
    context: Optional[str] = None


class EvaluationRequest(BaseModel):
    dataset: Optional[List[Sample]] = None
    samples: Optional[List[Sample]] = None
    dataset_id: Optional[str] = None
    model_version: Optional[str] = None
    judge_model: Optional[str] = None  # None = use all providers from config.yaml

    def get_samples(self) -> List[Sample]:
        return self.dataset or self.samples or []


class EvaluationResponse(BaseModel):
    report_id: UUID
    metrics: dict
    results: list
    report_url: str
    report_share_url: Optional[str] = None


class BreakTarget(BaseModel):
    type: str = Field(..., description="openai | huggingface | webhook")
    # OpenAI-compatible
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    # HuggingFace
    repo_id: Optional[str] = None
    api_token: Optional[str] = None
    # Webhook
    endpoint_url: Optional[str] = None
    payload_template: Optional[str] = None


class BreakRequest(BaseModel):

    force_refresh: bool = Field(
#       default=False,
#       description="Set true to bypass the test-suite cache and regenerate from Groq.",
#   )
    )
    target: BreakTarget
    description: str = Field(..., min_length=5)
    num_tests: int = Field(default=20, ge=6, le=50)
    groq_api_key: Optional[str] = None
    force_refresh: bool = Field(
        default=False,
        description=(
            "Set true to bypass the test-suite cache and regenerate from Groq. "
            "Use when you want a fresh set of adversarial tests for the same description."
        ),
    )