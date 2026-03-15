from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


@dataclass
class ToolConnectorValidator:
    SUPPORTED_CONNECTORS = ["zapier", "make", "mcp", "custom"]

    connector: str
    action_id: str
    validation_mode: str = "agentic_trace"

    def __post_init__(self) -> None:
        connector_norm = (self.connector or "").strip().lower()
        if connector_norm not in self.SUPPORTED_CONNECTORS:
            raise ValueError(
                f"Unsupported connector '{self.connector}'. "
                f"Supported: {', '.join(self.SUPPORTED_CONNECTORS)}"
            )
        self.connector = connector_norm

    def validate_tool_call(
        self,
        execution_steps: List[Dict[str, Any]],
        requirements: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Validate that the expected action_id was called with all required params.

        execution_steps: list of {"tool": str, "params": dict, "result": str}
        requirements: {"auth_type": str, "params": [str]}
        """
        action_id = str(self.action_id or "").strip()
        required_params = requirements.get("params") or []
        required_params = [str(p) for p in required_params]

        action_called = False
        seen_params: set[str] = set()

        for step in execution_steps or []:
            tool_name = str(step.get("tool") or "").strip()
            if tool_name != action_id:
                continue
            action_called = True
            params = step.get("params") or {}
            if isinstance(params, dict):
                for name in required_params:
                    if name in params:
                        seen_params.add(name)

        missing_params = [p for p in required_params if p not in seen_params]
        if required_params:
            param_coverage = len(seen_params) / len(required_params)
        else:
            param_coverage = 1.0 if action_called else 0.0

        # Score on a 0–10 scale, weighted by whether the action was called at all.
        if not action_called:
            score = 0.0
        else:
            score = round(max(0.0, min(10.0, 10.0 * param_coverage)), 2)

        return {
            "action_called": action_called,
            "params_complete": action_called and not missing_params,
            "param_coverage": float(param_coverage),
            "missing_params": missing_params,
            "score": score,
        }

