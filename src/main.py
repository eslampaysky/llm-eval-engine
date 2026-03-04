import argparse
import json
import os
from evaluator import run_evaluation
from metrics import compute_metrics

def main():
    parser = argparse.ArgumentParser(description="LLM Evaluation Engine")

    parser.add_argument("--input", required=True)
    parser.add_argument("--output", default="reports/report.json")
    parser.add_argument("--format", choices=["json", "html"], default="json")
    parser.add_argument("--fail-threshold", type=float, default=5)

    args = parser.parse_args()

    os.makedirs("reports", exist_ok=True)

    results = run_evaluation(args.input)
    summary = compute_metrics(results, args.fail_threshold)

    print("\nSummary Metrics:\n")
    for k, v in summary.items():
        print(f"{k}: {v}")

    # Save JSON report
    with open(args.output, "w") as f:
        json.dump(summary, f, indent=4)

    # Fail CI if needed
    if summary["low_quality_answers"] > 0:
        print("\nQuality threshold failed.")
        exit(1)

if __name__ == "__main__":
    main()