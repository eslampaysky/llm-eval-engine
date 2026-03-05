import argparse
import json
import sys

from core.evaluator import run_evaluation
from core.metrics import compute_metrics


def _offline_heuristic_rows(payload: list[dict]) -> list[dict]:
    rows = []
    for sample in payload:
        gt = str(sample.get("ground_truth", "")).strip().lower()
        ans = str(sample.get("model_answer", "")).strip().lower()
        correctness = 10.0 if gt and gt in ans else 0.0
        relevance = correctness
        hallucination = False if correctness >= 8 else True
        rows.append(
            {
                "question": sample.get("question", ""),
                "ground_truth": sample.get("ground_truth", ""),
                "model_answer": sample.get("model_answer", ""),
                "correctness": correctness,
                "relevance": relevance,
                "hallucination": hallucination,
                "reason": "offline_heuristic_quality_gate",
                "judges": {},
            }
        )
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="AI Quality Gate")
    parser.add_argument("--dataset", required=True, help="Path to dataset JSON file")
    parser.add_argument("--judge-model", default=None, help="Single provider override (optional)")
    parser.add_argument("--min-correctness", type=float, default=0.85, help="Minimum correctness threshold (0-1)")
    parser.add_argument("--offline-heuristic", action="store_true", help="Use offline heuristic mode (no provider calls)")
    args = parser.parse_args()

    with open(args.dataset, "r", encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, list) or not payload:
        raise ValueError("Dataset must be a non-empty JSON array of samples.")

    if args.offline_heuristic:
        rows = _offline_heuristic_rows(payload)
    else:
        rows = run_evaluation(samples=payload, judge_model=args.judge_model)
    metrics = compute_metrics(rows)

    avg_correctness = sum(float(r.get("correctness", 0) or 0) for r in rows) / len(rows)
    avg_relevance = sum(float(r.get("relevance", 0) or 0) for r in rows) / len(rows)

    correctness_norm = avg_correctness / 10.0
    relevance_norm = avg_relevance / 10.0
    overall_norm = float(metrics.get("average_score", 0.0)) / 10.0

    print("AI Quality Gate")
    print(f"samples={len(rows)}")
    print(f"correctness={correctness_norm:.4f}")
    print(f"relevance={relevance_norm:.4f}")
    print(f"overall={overall_norm:.4f}")

    if correctness_norm < args.min_correctness:
        print(f"FAILED: correctness {correctness_norm:.4f} < min {args.min_correctness:.4f}")
        return 1

    print("PASSED: quality gate satisfied")
    return 0


if __name__ == "__main__":
    sys.exit(main())
