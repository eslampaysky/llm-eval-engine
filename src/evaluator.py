import pandas as pd
import json
from judge import evaluate_answer

def run_evaluation(file_path):

    df = pd.read_csv(file_path)
    results = []

    for _, row in df.iterrows():
        raw_result = evaluate_answer(
            row["question"],
            row["ground_truth"],
            row["model_answer"]
        )

        parsed = json.loads(raw_result)
        results.append(parsed)

    return results