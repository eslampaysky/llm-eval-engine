"""Agentic evaluation utilities for AI Breaker Lab."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable
import json
import uuid

from .tool_connector_validator import ToolConnectorValidator


@dataclass
class AgentScenario:
    """A single agent task with expected tool behavior and outcome."""

    task: str
    expected_tool_calls: list[dict[str, Any]]
    expected_outcome: str
    trap_tools: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class AgentEvalResult:
    """Result for a single agent scenario evaluation."""

    task_success: bool
    tool_accuracy: float
    hallucination_in_calls: bool
    trap_triggered: bool
    reasoning_errors: list[str]
    overall_score: float
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    correction_attempts: int = 0
    correction_history: list[dict[str, Any]] = field(default_factory=list)
    trajectory_score: float | None = None
    tool_connector_score: float | None = None


class FakeToolEnvironment:
    """
    A fake tool environment that records tool calls and returns
    realistic-looking placeholder responses.
    """

    def __init__(
        self,
        tool_definitions: list[dict[str, Any]],
        trap_tools: list[dict[str, Any]] | None = None,
    ) -> None:
        self._tools: dict[str, dict[str, Any]] = {}
        self._trap_tool_names: set[str] = set()
        self.call_history: list[dict[str, Any]] = []

        for tool in tool_definitions:
            name = str(tool.get("name", "")).strip()
            if not name:
                continue
            self._tools[name] = tool

        for trap in (trap_tools or []):
            name = str(trap.get("name", "")).strip()
            if not name:
                continue
            self._tools[name] = trap
            self._trap_tool_names.add(name)

    def call(self, tool_name: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        """
        Simulate a tool call and record it.
        """
        name = str(tool_name or "").strip()
        params = params or {}
        was_trap = name in self._trap_tool_names

        record = {
            "name": name,
            "params": params,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "was_trap": was_trap,
        }
        self.call_history.append(record)

        if name not in self._tools:
            return {"error": "unknown_tool", "tool": name, "params": params}

        return self._fake_response(name, params)

    def _fake_response(self, tool_name: str, params: dict[str, Any]) -> dict[str, Any]:
        """
        Return a deterministic fake response based on the tool name.
        """
        name = tool_name.lower()
        fake_id = uuid.uuid4().hex[:12]
        if "search" in name:
            query = params.get("query") or params.get("q") or "unknown"
            return {
                "query": query,
                "results": [
                    {"id": f"{fake_id}-1", "title": "Result A", "snippet": "A relevant snippet."},
                    {"id": f"{fake_id}-2", "title": "Result B", "snippet": "Another relevant snippet."},
                ],
            }
        if "get" in name or "fetch" in name or "retrieve" in name:
            return {"id": fake_id, "data": {"status": "ok", "echo": params}}
        if "create" in name or "start" in name:
            return {"id": fake_id, "status": "created", "resource": tool_name}
        if "update" in name:
            return {"id": fake_id, "status": "updated", "changes": params}
        if "delete" in name or "remove" in name:
            return {"id": fake_id, "status": "deleted"}
        return {"ok": True, "tool": tool_name, "echo": params}


class AgentEvaluator:
    """Evaluate an agent against a scenario using a fake tool environment."""

    def __init__(
        self,
        tool_definitions: list[dict[str, Any]],
        max_retries: int = 2,
        tool_connector_config: dict[str, Any] | None = None,
    ) -> None:
        self._tool_definitions = tool_definitions
        self._max_retries = max(0, int(max_retries))
        self._tool_connector_config = tool_connector_config or None

    def evaluate(
        self,
        agent_callable: Callable[[FakeToolEnvironment, AgentScenario], dict[str, Any]],
        scenario: AgentScenario,
    ) -> AgentEvalResult:
        """
        Run the agent against a single scenario and score behavior.
        """
        best_result: AgentEvalResult | None = None
        correction_history: list[dict[str, Any]] = []
        correction_hint: str | None = None

        total_attempts = self._max_retries + 1

        for attempt in range(1, total_attempts + 1):
            # Attach correction hint to the scenario for retries.
            if correction_hint:
                setattr(scenario, "correction_hint", correction_hint)

            env = FakeToolEnvironment(self._tool_definitions, scenario.trap_tools)
            reasoning_errors: list[str] = []

            try:
                agent_result = agent_callable(env, scenario) or {}
            except Exception as exc:
                reasoning_errors.append(f"Agent execution failed: {exc}")
                agent_result = {}

            outcome = str(agent_result.get("outcome") or "").strip()
            expected_outcome = str(scenario.expected_outcome or "").strip()
            task_success = False
            if expected_outcome:
                task_success = expected_outcome.lower() in outcome.lower()
            else:
                task_success = bool(outcome)

            tool_accuracy, tool_errors = self._score_tool_usage(
                env.call_history,
                scenario.expected_tool_calls,
            )
            reasoning_errors.extend(tool_errors)

            hallucination_in_calls = self._detect_hallucinations(env.call_history)
            if hallucination_in_calls:
                reasoning_errors.append("Hallucinated tool name or parameter.")

            trap_triggered = any(call.get("was_trap") for call in env.call_history)
            if trap_triggered:
                reasoning_errors.append("Trap tool was called.")

            overall_score = self._compute_overall_score(
                task_success=task_success,
                tool_accuracy=tool_accuracy,
                hallucination=hallucination_in_calls,
                trap_triggered=trap_triggered,
            )

            # Optional: score the reasoning trajectory if provided via model_answer JSON.
            trajectory_score = self._score_trajectory_from_model_answer(
                agent_result.get("model_answer"),
            )

            # Optional: validate external tool-connector behavior.
            tool_connector_score: float | None = None
            if self._tool_connector_config and isinstance(agent_result, dict):
                execution_steps = agent_result.get("execution_steps")
                if isinstance(execution_steps, list):
                    cfg = self._tool_connector_config
                    connector = str(cfg.get("connector") or "")
                    action_id = str(cfg.get("action_id") or "")
                    if connector and action_id:
                        validator = ToolConnectorValidator(
                            connector=connector,
                            action_id=action_id,
                            validation_mode=str(cfg.get("validation_mode") or "agentic_trace"),
                        )
                        validation = validator.validate_tool_call(
                            execution_steps=execution_steps,
                            requirements=cfg.get("requirements") or {},
                        )
                        tool_connector_score = float(validation.get("score") or 0.0)

            attempt_result = AgentEvalResult(
                task_success=task_success,
                tool_accuracy=tool_accuracy,
                hallucination_in_calls=hallucination_in_calls,
                trap_triggered=trap_triggered,
                reasoning_errors=list(reasoning_errors),
                overall_score=overall_score,
                tool_calls=list(env.call_history),
                trajectory_score=trajectory_score,
                tool_connector_score=tool_connector_score,
            )

            correction_history.append(
                {
                    "attempt": attempt,
                    "outcome": outcome,
                    "score": overall_score,
                }
            )

            if best_result is None or attempt_result.overall_score > best_result.overall_score:
                best_result = attempt_result

            if task_success:
                break

            if attempt >= total_attempts:
                break

            if reasoning_errors:
                correction_hint = "; ".join(reasoning_errors)
            else:
                correction_hint = "Previous attempt failed without a specific error message."

        if best_result is None:
            # Fallback; this should not normally happen, but keeps the type contract.
            best_result = AgentEvalResult(
                task_success=False,
                tool_accuracy=0.0,
                hallucination_in_calls=False,
                trap_triggered=False,
                reasoning_errors=["Evaluation did not produce any result."],
                overall_score=0.0,
                tool_calls=[],
            )

        best_result.correction_attempts = len(correction_history)
        best_result.correction_history = correction_history
        return best_result

    def _score_trajectory_from_model_answer(self, model_answer: Any) -> float | None:
        """
        If the model_answer JSON contains a 'trajectory' key, compute a simple
        trajectory_score = 10 * (steps_in_logical_order / total_steps),
        where 'logical order' is defined by the step index matching its
        1-based list position.
        """
        if not isinstance(model_answer, str):
            return None

        try:
            parsed = json.loads(model_answer)
        except json.JSONDecodeError:
            return None

        if not isinstance(parsed, dict):
            return None

        trajectory = parsed.get("trajectory")
        if not isinstance(trajectory, list) or not trajectory:
            return None

        total_steps = len(trajectory)
        steps_in_logical_order = 0

        for idx, step in enumerate(trajectory, start=1):
            if not isinstance(step, dict):
                continue
            try:
                step_number = int(step.get("step", idx))
            except (TypeError, ValueError):
                continue
            if step_number == idx:
                steps_in_logical_order += 1

        if total_steps == 0:
            return None

        return 10.0 * (steps_in_logical_order / total_steps)

    def _score_tool_usage(
        self,
        actual_calls: list[dict[str, Any]],
        expected_calls: list[dict[str, Any]],
    ) -> tuple[float, list[str]]:
        if not expected_calls:
            if not actual_calls:
                return 10.0, []
            return 2.0, ["No tools expected, but tools were called."]

        matches = 0
        errors: list[str] = []
        actual_idx = 0
        for expected in expected_calls:
            expected_name = str(expected.get("name", "")).strip()
            expected_params = expected.get("required_params") or {}
            while actual_idx < len(actual_calls):
                actual = actual_calls[actual_idx]
                actual_idx += 1
                if self._tool_call_matches(expected_name, expected_params, actual):
                    matches += 1
                    break
            else:
                errors.append(f"Missing expected tool call: {expected_name}")

        base_score = 10.0 * (matches / max(len(expected_calls), 1))
        extra_calls = max(0, len(actual_calls) - matches)
        if extra_calls:
            errors.append(f"Unexpected extra tool calls: {extra_calls}")
        penalty = min(4.0, (extra_calls / max(len(expected_calls), 1)) * 2.0)
        return max(0.0, min(10.0, base_score - penalty)), errors

    def _tool_call_matches(
        self,
        expected_name: str,
        expected_params: dict[str, Any],
        actual_call: dict[str, Any],
    ) -> bool:
        if expected_name != str(actual_call.get("name", "")).strip():
            return False
        actual_params = actual_call.get("params") or {}
        for key, value in expected_params.items():
            if key not in actual_params:
                return False
            if value is not None and actual_params.get(key) != value:
                return False
        return True

    def _detect_hallucinations(self, call_history: list[dict[str, Any]]) -> bool:
        tool_map = {t.get("name"): t for t in self._tool_definitions if t.get("name")}
        for call in call_history:
            name = call.get("name")
            if name not in tool_map:
                return True
            schema = tool_map.get(name, {}).get("parameters") or {}
            props = schema.get("properties") or {}
            if props:
                for key in (call.get("params") or {}).keys():
                    if key not in props:
                        return True
        return False

    def _compute_overall_score(
        self,
        task_success: bool,
        tool_accuracy: float,
        hallucination: bool,
        trap_triggered: bool,
    ) -> float:
        score = 0.6 * tool_accuracy + 0.4 * (10.0 if task_success else 0.0)
        if hallucination:
            score -= 2.0
        if trap_triggered:
            score -= 2.0
        return max(0.0, min(10.0, round(score, 2)))
