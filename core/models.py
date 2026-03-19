from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from enum import StrEnum
from typing import Any


class StepType(StrEnum):
    CLICK = "click"
    FILL_SUBMIT = "fill_submit"
    NAVIGATE = "navigate"
    VERIFY_ONLY = "verify_only"


class FailureType(StrEnum):
    NONE = "none"
    ACTION_RESOLUTION_FAILED = "action_resolution_failed"
    VERIFICATION_FAILED = "verification_failed"
    TIMEOUT = "timeout"
    BLOCKED_BY_BOT_PROTECTION = "blocked_by_bot_protection"
    CAPTCHA_REQUIRED = "captcha_required"
    SOFT_RECOVERY_EXHAUSTED = "soft_recovery_exhausted"


def _normalize_string_list(values: list[Any] | None) -> list[str]:
    return [str(v).strip() for v in (values or []) if str(v).strip()]


@dataclass
class ActionCandidate:
    type: str
    intent: str
    selectors: list[str] = field(default_factory=list)
    role: str | None = None
    name: str | None = None
    text: str | None = None
    value: str | None = None
    fallback_action: str | None = None
    fallback_value: str | None = None

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "ActionCandidate":
        return cls(
            type=str(data.get("type") or "click").strip().lower(),
            intent=str(data.get("intent") or "").strip(),
            selectors=_normalize_string_list(data.get("selectors")),
            role=(str(data.get("role")).strip() if data.get("role") else None),
            name=(str(data.get("name")).strip() if data.get("name") else None),
            text=(str(data.get("text")).strip() if data.get("text") else None),
            value=(str(data.get("value")).strip() if data.get("value") else None),
            fallback_action=(
                str(data.get("fallback_action")).strip().lower()
                if data.get("fallback_action")
                else None
            ),
            fallback_value=(
                str(data.get("fallback_value")).strip()
                if data.get("fallback_value")
                else None
            ),
        )


@dataclass
class SuccessSignal:
    type: str
    value: Any
    priority: str = "medium"
    required: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "SuccessSignal":
        return cls(
            type=str(data.get("type") or "").strip().lower(),
            value=data.get("value"),
            priority=str(data.get("priority") or "medium").strip().lower(),
            required=bool(data.get("required", True)),
        )


@dataclass
class JourneyStep:
    goal: str
    intent: str
    step_type: str = StepType.CLICK.value
    action_candidates: list[ActionCandidate] = field(default_factory=list)
    input_bindings: dict[str, str] = field(default_factory=dict)
    success_signals: list[SuccessSignal] = field(default_factory=list)
    failure_hints: list[str] = field(default_factory=list)
    expected_state_change: dict[str, Any] = field(default_factory=dict)
    allow_soft_recovery: bool = True

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "JourneyStep":
        return cls(
            goal=str(data.get("goal") or "").strip(),
            intent=str(data.get("intent") or data.get("goal") or "").strip(),
            step_type=str(data.get("step_type") or StepType.CLICK.value).strip().lower(),
            action_candidates=[
                ActionCandidate.from_dict(item)
                for item in (data.get("action_candidates") or [])
                if isinstance(item, dict)
            ],
            input_bindings={
                str(k): str(v)
                for k, v in (data.get("input_bindings") or {}).items()
                if str(k).strip() and str(v).strip()
            },
            success_signals=[
                SuccessSignal.from_dict(item)
                for item in (data.get("success_signals") or [])
                if isinstance(item, dict)
            ],
            failure_hints=_normalize_string_list(data.get("failure_hints")),
            expected_state_change=dict(data.get("expected_state_change") or {}),
            allow_soft_recovery=bool(data.get("allow_soft_recovery", True)),
        )


@dataclass
class JourneyPlan:
    name: str
    app_type: str
    steps: list[JourneyStep] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "JourneyPlan":
        return cls(
            name=str(data.get("name") or data.get("goal") or "journey").strip(),
            app_type=str(data.get("app_type") or "generic").strip().lower(),
            steps=[
                JourneyStep.from_dict(item)
                for item in (data.get("steps") or [])
                if isinstance(item, dict)
            ],
        )


@dataclass
class SessionState:
    base_url: str
    current_url: str
    auth: dict[str, Any] = field(default_factory=dict)
    generated_credentials: dict[str, str] = field(default_factory=dict)
    inferred_context: dict[str, Any] = field(default_factory=dict)
    items: dict[str, Any] = field(default_factory=dict)
    recovery_counters: dict[str, int] = field(default_factory=dict)
    step_history: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class VerificationResult:
    success: bool
    passed_signals: list[dict[str, Any]] = field(default_factory=list)
    failed_signals: list[dict[str, Any]] = field(default_factory=list)
    delta_summary: list[str] = field(default_factory=list)
    failure_type: str = "unknown"
    llm_used: bool = False


@dataclass
class RecoveryEvent:
    choke_point: str
    blocker_type: str
    action_taken: str
    success: bool
    selector_used: str
    notes: str


@dataclass
class StepResult:
    step_name: str
    goal: str
    status: str
    chosen_action: dict[str, Any] | None = None
    verification: dict[str, Any] = field(default_factory=dict)
    evidence_delta: list[str] = field(default_factory=list)
    recovery_attempts: list[dict[str, Any]] = field(default_factory=list)
    failure_type: str | None = None
    error: str | None = None
    notes: list[str] = field(default_factory=list)
    before_snapshot: dict[str, Any] = field(default_factory=dict)
    after_snapshot: dict[str, Any] = field(default_factory=dict)
    screenshot_path: str | None = None


def to_dict(value: Any) -> Any:
    if is_dataclass(value):
        return asdict(value)
    if isinstance(value, list):
        return [to_dict(item) for item in value]
    if isinstance(value, dict):
        return {key: to_dict(item) for key, item in value.items()}
    return value
