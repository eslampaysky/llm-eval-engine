import yaml

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

CORRECTNESS_WEIGHT = config["correctness_weight"]
RELEVANCE_WEIGHT = config["relevance_weight"]


def compute_metrics(results, fail_threshold):

    final_scores = []
    hallucinations = 0

    for r in results:
        weighted_score = (
            r["correctness"] * CORRECTNESS_WEIGHT +
            r["relevance"] * RELEVANCE_WEIGHT
        )
        final_scores.append(weighted_score)

        if r["hallucination"]:
            hallucinations += 1

    total = len(final_scores)
    avg = sum(final_scores) / total
    min_score = min(final_scores)
    max_score = max(final_scores)
    low_quality = len([s for s in final_scores if s < fail_threshold])

    return {
        "total_samples": total,
        "average_score": round(avg, 2),
        "min_score": round(min_score, 2),
        "max_score": round(max_score, 2),
        "low_quality_answers": low_quality,
        "hallucinations_detected": hallucinations
    }