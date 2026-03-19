"""Pydantic request/response models for the Breaker Lab API."""

from __future__ import annotations

from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class Sample(BaseModel):
    question: str
    ground_truth: str
    model_answer: Optional[str] = None
    context: Optional[str] = None
    input_type: str = "text"  # "text" | "image" | "pdf"
    image_b64: Optional[str] = None
    mime_type: Optional[str] = None


class EvaluationRequest(BaseModel):
    dataset: list[Sample] | None = None
    samples: list[Sample] | None = None
    dataset_id: Optional[str] = None
    model_version: Optional[str] = None
    judge_model: Optional[str] = None  # None = use all providers from config.yaml
    eval_mode: str = "single"  # "single" | "debate"
    input_type: str = "text"
    image_b64: Optional[str] = None
    mime_type: Optional[str] = None

    def get_samples(self) -> list[Sample]:
        return self.dataset or self.samples or []


class EvaluationResponse(BaseModel):
    report_id: UUID
    metrics: dict
    results: list
    report_url: str
    report_share_url: Optional[str] = None


class BreakTarget(BaseModel):
    type: str = Field(..., description="openai | huggingface | webhook | langchain")
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    repo_id: Optional[str] = None
    api_token: Optional[str] = None
    endpoint_url: Optional[str] = None
    headers: dict | None = None
    payload_template: Optional[str] = None
    chain_import_path: Optional[str] = None
    invoke_key: Optional[str] = None
    engine_params: dict | None = None


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
    consensus_threshold: float = Field(default=0.8, ge=0.0, le=1.0)
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
    input_type: str = "text"
    image_b64: Optional[str] = None
    mime_type: Optional[str] = None


class DemoBreakRequest(BaseModel):
    description: str = Field(..., min_length=5)
    model_name: str
    num_tests: int = Field(default=5, ge=1)


class AgentEvalRequest(BaseModel):
    agent_description: str = Field(..., min_length=1)
    target: dict[str, Any] = Field(..., description="Target config for the agent model")
    scenarios: list[dict[str, Any]] = Field(default_factory=list)
    max_retries: int = Field(default=2, ge=0)


class AgentScenario(BaseModel):
    task: str
    expected_tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    expected_outcome: str
    trap_tools: list[dict[str, Any]] = Field(default_factory=list)
    tool_connector: dict[str, Any] | None = None


class TargetCreate(BaseModel):
    name: str = Field(..., min_length=2)
    description: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    api_key: Optional[str] = None
    repo_id: Optional[str] = None
    api_token: Optional[str] = None
    endpoint_url: Optional[str] = None
    headers: dict | None = None
    payload_template: Optional[str] = None
    chain_import_path: Optional[str] = None
    invoke_key: Optional[str] = None
    engine_params: dict | None = None
    agent_role: Optional[str] = None
    agent_goal: Optional[str] = None
    agent_backstory: Optional[str] = None
    config_list: Optional[list[dict]] = None
    system_message: Optional[str] = None
    target_type: str = Field(
        ...,
        description="openai | huggingface | webhook | langchain | crewai | autogen",
    )


class TargetSummary(BaseModel):
    target_id: str
    name: str
    description: Optional[str] = None
    base_url: Optional[str] = None
    model_name: Optional[str] = None
    repo_id: Optional[str] = None
    endpoint_url: Optional[str] = None
    payload_template: Optional[str] = None
    headers: dict | None = None
    chain_import_path: Optional[str] = None
    invoke_key: Optional[str] = None
    target_type: str
    created_at: str


class RagEvalSample(BaseModel):
    question: str
    context_docs: list[str]
    ground_truth: str
    model_answer: Optional[str] = None


class RagEvalRequest(BaseModel):
    target: BreakTarget
    samples: list[RagEvalSample] = Field(default_factory=list)
    groq_api_key: str


class WebAuditRequest(BaseModel):
    url: str = Field(..., description="Full URL to audit e.g. https://myapp.com")
    description: str | None = Field(None, description="What the site is supposed to do")


class WebAuditResponse(BaseModel):
    audit_id: str
    url: str
    status: str  # queued | processing | done | failed
    overall_health: str | None = None
    confidence: int | None = None
    issues: list | None = None
    passed: list | None = None
    summary: str | None = None
    video_url: str | None = None
    screenshot_url: str | None = None
    created_at: str


class AgentAuditRequest(BaseModel):
    target: BreakTarget
    description: str = Field(..., min_length=10, description="What this agent/API is supposed to do")
    num_scenarios: int = Field(default=10, ge=3, le=30)
    categories: list[str] | None = Field(
        default=None,
        description="Filter: edge_case | logic | hallucination | security | reliability",
    )


class FeatureMonitorConfig(BaseModel):
    feature_name: str
    description: str
    target: BreakTarget
    test_inputs: list[str] = Field(..., min_length=3, description="At least 3 representative inputs for this feature")
    schedule: str = Field(default="daily", description="daily | hourly | on_deploy")
    alert_webhook: str | None = None


class MonitorCheckRequest(BaseModel):
    monitor_id: str
    force: bool = False


# ── Agentic QA (pivot) ───────────────────────────────────────────────────────

class AgenticQAStartRequest(BaseModel):
    url: str = Field(..., description="Full URL to audit, e.g. https://myapp.com")
    tier: Literal["vibe", "deep", "fix"] = Field(
        default="vibe",
        description="vibe = quick visual scan, deep = full journey + video, fix = deep + code analysis",
    )
    site_description: str | None = Field(
        default=None,
        description="Optional founder-provided description of what the site should do.",
    )
    journeys: list[dict[str, Any]] | None = Field(
        default=None,
        description="Optional user journey steps for deep/fix tiers",
    )


class AgenticQAFinding(BaseModel):
    severity: str
    category: str
    title: str
    description: str
    fix_prompt: str
    confidence: int | None = None


class AgenticQAResult(BaseModel):
    audit_id: str
    status: str  # queued | processing | done | failed
    url: str
    tier: str
    score: int | None = None
    confidence: int | None = None
    findings: list[AgenticQAFinding] | None = None
    summary: str | None = None
    bundled_fix_prompt: str | None = None
    journey_timeline: list[dict[str, Any]] | None = None
    step_results: list[dict[str, Any]] | None = None
    video_url: str | None = None
    desktop_screenshot_url: str | None = None
    mobile_screenshot_url: str | None = None
    created_at: str
