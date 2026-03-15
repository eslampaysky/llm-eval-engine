from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol


class _JudgeClient(Protocol):
    """
    Minimal protocol for a judge-like client used in DebateEvaluator.
    """

    def evaluate_answer(
        self,
        *,
        question: str,
        ground_truth: str,
        model_answer: str,
        context: str | None = None,
        system_prompt: str | None = None,
    ) -> dict:
        ...


@dataclass
class DebateEvaluator:
    """
    Multi-judge debate evaluator.

    Runs a critic and fact-checker, optionally for a second round if they
    disagree, and computes a consensus score.
    """

    critic_client: _JudgeClient
    fact_checker_client: _JudgeClient
    consensus_threshold: float = 0.8

    def evaluate(
        self,
        *,
        question: str,
        ground_truth: str,
        model_answer: str,
        context: str | None = None,
    ) -> dict[str, Any]:
        """
        Run a critic + fact-checker debate around a model answer.
        """

        debate_rounds = 0

        def _run_round(
            critic_extra_reason: str | None = None,
            fact_extra_reason: str | None = None,
        ) -> tuple[dict, dict]:
            critic_prompt = (
                "You are a critical evaluator. Identify logical flaws, unsafe reasoning, "
                "and weak arguments in the model answer. Focus on reasoning quality, "
                "robustness, and potential failure modes.\n\n"
                f"Question:\n{question}\n\n"
                f"Ground truth:\n{ground_truth}\n\n"
                f"Model answer:\n{model_answer}\n"
            )
            if context:
                critic_prompt += f"\nAdditional context:\n{context}\n"
            if critic_extra_reason:
                critic_prompt += f"\nPrevious fact-checker critique to consider:\n{critic_extra_reason}\n"

            critic_result = self.critic_client.evaluate_answer(
                question=question,
                ground_truth=ground_truth,
                model_answer=model_answer,
                context=context,
                system_prompt=critic_prompt,
            ) or {}

            fact_prompt = (
                "You are a fact-checking evaluator. Check the factual accuracy of the "
                "model answer against the provided ground truth (and context if any). "
                "Be strict: highlight unsupported claims, contradictions, or hallucinations.\n\n"
                f"Question:\n{question}\n\n"
                f"Ground truth:\n{ground_truth}\n\n"
                f"Model answer:\n{model_answer}\n"
            )
            if context:
                fact_prompt += f"\nAdditional context:\n{context}\n"
            if fact_extra_reason:
                fact_prompt += f"\nPrevious critic critique to consider:\n{fact_extra_reason}\n"

            fact_result = self.fact_checker_client.evaluate_answer(
                question=question,
                ground_truth=ground_truth,
                model_answer=model_answer,
                context=context,
                system_prompt=fact_prompt,
            ) or {}

            return critic_result, fact_result

        # First debate round.
        critic_result, fact_result = _run_round()
        debate_rounds += 1

        critic_score = float(critic_result.get("score") or 0.0)
        fact_checker_score = float(fact_result.get("score") or 0.0)
        consensus_score = (critic_score + fact_checker_score) / 2.0
        threshold_score = float(self.consensus_threshold or 0.0) * 10.0
        agreed = consensus_score >= threshold_score

        critic_reason = str(critic_result.get("reason") or critic_result.get("explanation") or "")
        fact_checker_reason = str(fact_result.get("reason") or fact_result.get("explanation") or "")

        # Optional second round if they disagree.
        if not agreed and debate_rounds < 2:
            critic_result, fact_result = _run_round(
                critic_extra_reason=fact_checker_reason or None,
                fact_extra_reason=critic_reason or None,
            )
            debate_rounds += 1

            critic_score = float(critic_result.get("score") or 0.0)
            fact_checker_score = float(fact_result.get("score") or 0.0)
            consensus_score = (critic_score + fact_checker_score) / 2.0
            agreed = consensus_score >= threshold_score

            critic_reason = str(critic_result.get("reason") or critic_result.get("explanation") or "")
            fact_checker_reason = str(fact_result.get("reason") or fact_result.get("explanation") or "")

        return {
            "critic_score": critic_score,
            "fact_checker_score": fact_checker_score,
            "consensus_score": consensus_score,
            "agreed": agreed,
            "critic_reason": critic_reason,
            "fact_checker_reason": fact_checker_reason,
            "debate_rounds": debate_rounds,
        }

