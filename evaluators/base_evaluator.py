"""
base_evaluator.py
Abstract base class all evaluator adapters must implement.
"""
from abc import ABC, abstractmethod


class BaseEvaluator(ABC):
    @abstractmethod
    def evaluate_answer(self, question, ground_truth, model_answer):
        """
        Evaluate a single (question, ground_truth, model_answer) triple.
        Must return a dict with the keys:
        {
            "correctness":  int   (0-10),
            "relevance":    int   (0-10),
            "hallucination": bool,
            "reason":       str
        }
        """
        pass

    PROMPT_TEMPLATE = """
    You are an AI evaluator. Be strict and objective.

    Question:     {question}
    Ground Truth: {ground_truth}
    Model Answer: {model_answer}

    Return ONLY a JSON object - no markdown, no explanation, no extra text:

    {{
      "correctness": <0-10>,
      "relevance": <0-10>,
      "hallucination": <true|false>,
      "reason": "<one sentence>"
    }}
    """.strip()

    FALLBACK_RESULT = {
        "correctness": 0,
        "relevance": 0,
        "hallucination": True,
        "reason": "Evaluation failed or returned invalid format.",
    }

    def build_prompt(self, question: str, ground_truth: str, model_answer: str) -> str:
        return self.PROMPT_TEMPLATE.format(
            question=question,
            ground_truth=ground_truth,
            model_answer=model_answer,
        )
