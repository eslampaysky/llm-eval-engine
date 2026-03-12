"""Pydantic request/response models for the Breaker Lab API."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class Sample(BaseModel):
    question: str
    ground_truth: str
    model_answer: Optional[str] = None
    context: Optional[str] = None


class EvaluationRequest(BaseModel):
    dataset: list[Sample] | None = None
    samples: list[Sample] | None = None
    dataset_id: Optional[str] = None
    model_version: Optional[str] = None
    judge_model: Optional[str] = None  # None = use all providers from config.yaml

    def get_samples(self) -> list[Sample]:
        return self.dataset or self.samples or []


class EvaluationResponse(BaseModel):
    report_id: UUID
    metrics: dict
    results: list
    report_url: str
    report_share_url: Optional[str] = None


class BreakTarget(BaseModel):
    type: str = Field(..., description="openai | huggingface | webhook")
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    repo_id: Optional[str] = None
    api_token: Optional[str] = None
    endpoint_url: Optional[str] = None
    headers: dict | None = None
    payload_template: Optional[str] = None


class BreakRequest(BaseModel):
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
    language: str = Field(
        default="auto",
        description="'en', 'ar', or 'auto' (detect from description)",
    )
