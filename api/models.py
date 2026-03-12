"""Pydantic request/response models for the Breaker Lab API."""

from __future__ import annotations

from typing import Literal, Optional
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


class JudgeConfig(BaseModel):
    name: str
    base_url: str
    api_key: str
    model: str
    role: Literal["arbiter", "safety", "custom"] = "custom"


class BreakRequest(BaseModel):
    target: BreakTarget
    description: str = Field(..., min_length=5)
    num_tests: int = Field(default=20, ge=6, le=50)
    groq_api_key: Optional[str] = None
    target_id: Optional[str] = Field(
        default=None,
        description="Optional saved target ID to associate with this break run",
    )
    judges: list[JudgeConfig] | None = Field(
        default=None,
        description=(
            "Optional custom judges. Each judge needs: name, base_url, api_key, model, role. "
            "role='arbiter' replaces the default OpenAI arbiter. "
            "role='safety' replaces the default Anthropic safety judge. "
            "role='custom' adds an extra judge that always runs."
        ),
    )
    disagreement_threshold: float | None = Field(default=None, ge=1.0, le=3.0)
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


class DemoBreakRequest(BaseModel):
    description: str = Field(..., min_length=5)
    model_name: str
    num_tests: int = Field(default=5, ge=1)


class TargetCreate(BaseModel):
    name: str = Field(..., min_length=2)
    description: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    target_type: str = Field(..., description="openai | huggingface | webhook")


class TargetSummary(BaseModel):
    target_id: str
    name: str
    description: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    target_type: str
    created_at: str
