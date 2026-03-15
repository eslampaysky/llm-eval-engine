from __future__ import annotations

import importlib
import json
from typing import Any, Dict

from .base import BaseTargetAdapter, Payload


def _extract_text(payload: Payload) -> str:
    if payload is None:
        return ""
    if isinstance(payload, dict):
        return str(payload.get("text", ""))
    return str(payload)


class CrewAIAdapter(BaseTargetAdapter):
    def __init__(
        self,
        crew_import_path: str,
        agent_role: str,
        agent_goal: str,
        agent_backstory: str,
    ) -> None:
        if not crew_import_path:
            raise ValueError("CrewAIAdapter requires a non-empty 'crew_import_path'.")

        self._crew_import_path = crew_import_path
        self._agent_role = agent_role
        self._agent_goal = agent_goal
        self._agent_backstory = agent_backstory

    def _load_crew_class(self) -> type:
        module_path, _, class_name = self._crew_import_path.rpartition(".")
        if not module_path or not class_name:
            raise ValueError(
                f"Invalid crew_import_path '{self._crew_import_path}'. "
                "Expected format 'package.module.CrewClassName'."
            )

        try:
            module = importlib.import_module(module_path)
        except ImportError as exc:
            raise ValueError(
                f"Could not import module '{module_path}' from crew_import_path "
                f"'{self._crew_import_path}': {exc}"
            ) from exc

        try:
            crew_cls = getattr(module, class_name)
        except AttributeError as exc:
            raise ValueError(
                f"Could not find crew class '{class_name}' in module '{module_path}' "
                f"from crew_import_path '{self._crew_import_path}'."
            ) from exc

        return crew_cls

    def call(self, payload: Payload) -> str:
        text = _extract_text(payload)

        crew_cls = self._load_crew_class()
        crew = crew_cls(
            agent_role=self._agent_role,
            agent_goal=self._agent_goal,
            agent_backstory=self._agent_backstory,
        )

        result = crew.kickoff({"question": text})

        final_answer: str
        trajectory: list[Dict[str, Any]] = []

        # Try to extract trajectory if the crew run already returns it.
        if isinstance(result, dict):
            if "final_answer" in result:
                final_answer = str(result.get("final_answer", ""))
            elif "answer" in result:
                final_answer = str(result.get("answer", ""))
            else:
                final_answer = str(result)

            raw_traj = result.get("trajectory")
            if isinstance(raw_traj, list):
                for idx, step in enumerate(raw_traj, start=1):
                    if isinstance(step, dict):
                        trajectory.append(
                            {
                                "step": int(step.get("step", idx)),
                                "action": str(step.get("action", "")),
                                "result": str(step.get("result", "")),
                            }
                        )
        else:
            final_answer = str(result)

        if not trajectory:
            # Fallback: basic single-step trajectory.
            trajectory = [
                {
                    "step": 1,
                    "action": "crew.kickoff",
                    "result": final_answer,
                }
            ]

        return json.dumps(
            {
                "final_answer": final_answer,
                "trajectory": trajectory,
            },
            ensure_ascii=False,
        )

