import requests
import re
import yaml
from pathlib import Path

OLLAMA_URL = "http://localhost:11434/api/generate"

# Load config from configs/ first, then fallback to root.
_root = Path(__file__).parent.parent
_config_candidates = [
    _root / "configs" / "config.yaml",
    _root / "config.yaml",
]
for _config_path in _config_candidates:
    if _config_path.exists():
        with open(_config_path, "r", encoding="utf-8") as f:
            config = yaml.safe_load(f)
        break
else:
    raise FileNotFoundError("No config.yaml found in configs/ or project root.")

MODEL_NAME = config["model"]
TEMPERATURE = config["temperature"]


def extract_json(text):
    match = re.search(r'\{.*\}', text, re.DOTALL)
    return match.group(0) if match else None


def evaluate_answer(question, ground_truth, model_answer):

    prompt = f"""
You are an AI evaluator.

Question: {question}
Ground Truth: {ground_truth}
Model Answer: {model_answer}

Evaluate strictly and return JSON:

{{
  "correctness": 0-10,
  "relevance": 0-10,
  "hallucination": true/false,
  "reason": "short explanation"
}}
"""

    try:
        response = requests.post(
            OLLAMA_URL,
            json={
                "model": MODEL_NAME,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": TEMPERATURE
                }
            },
            timeout=120
        )

        raw_output = response.json()["response"]
        json_output = extract_json(raw_output)

        if json_output is None:
            return '{"correctness":0,"relevance":0,"hallucination":true,"reason":"Invalid format"}'

        return json_output

    except Exception:
        return '{"correctness":0,"relevance":0,"hallucination":true,"reason":"Evaluation failed"}'
