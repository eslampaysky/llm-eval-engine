import json
import os
import re
from pathlib import Path

import requests
import yaml

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

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

MODEL_NAME = config.get("groq_model") or config.get("model", "llama-3.1-8b-instant")
TEMPERATURE = config["temperature"]
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()


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

    if not GROQ_API_KEY:
        return '{"correctness":0,"relevance":0,"hallucination":true,"reason":"Missing GROQ_API_KEY"}'

    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL_NAME,
                "temperature": TEMPERATURE,
                "messages": [
                    {"role": "system", "content": "You are a strict evaluator that returns valid JSON only."},
                    {"role": "user", "content": prompt},
                ],
            },
            timeout=120,
        )
        response.raise_for_status()

        payload = response.json()
        raw_output = payload["choices"][0]["message"]["content"]
        json_output = extract_json(raw_output)

        if json_output is None:
            return '{"correctness":0,"relevance":0,"hallucination":true,"reason":"Invalid format"}'

        # Ensure normalized JSON string output.
        parsed = json.loads(json_output)
        return json.dumps({
            "correctness": int(parsed.get("correctness", 0)),
            "relevance": int(parsed.get("relevance", 0)),
            "hallucination": bool(parsed.get("hallucination", True)),
            "reason": str(parsed.get("reason", "Invalid format")),
        })

    except Exception:
        return '{"correctness":0,"relevance":0,"hallucination":true,"reason":"Evaluation failed"}'
