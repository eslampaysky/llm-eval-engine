from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict


@dataclass
class EnergyEstimate:
    kwh: float
    co2_grams: float
    elapsed_s: float
    tokens_used: int
    provider: str


class EnergyTracker:
    """
    Estimate energy use and CO₂ emissions for LLM evaluations.

    The coefficients are approximate kWh consumed per 1,000 tokens,
    based on public vendor disclosures and academic estimates.
    """

    PROVIDER_KWH_PER_1K_TOKENS: Dict[str, float] = {
        "openai": 0.0003,
        "anthropic": 0.0003,
        "gemini": 0.00025,
        "groq": 0.00015,
        "ollama": 0.0001,
        "default": 0.0003,
    }

    # World average grid intensity in grams CO₂ per kWh.
    CO2_GRAMS_PER_KWH: float = 400.0

    def estimate(self, provider: str, tokens_used: int, elapsed_s: float) -> Dict[str, Any]:
        """
        Return an approximate ESG footprint for a completed evaluation.

        Args:
            provider: Logical provider name (e.g. "openai", "anthropic", "gemini").
            tokens_used: Total tokens consumed across all judges.
            elapsed_s: Wall‑clock time for the evaluation, in seconds.
        """
        safe_provider = (provider or "default").strip().lower() or "default"
        coef = self.PROVIDER_KWH_PER_1K_TOKENS.get(
            safe_provider,
            self.PROVIDER_KWH_PER_1K_TOKENS["default"],
        )

        tokens = max(int(tokens_used or 0), 0)
        elapsed = float(elapsed_s or 0.0)

        kwh = (tokens / 1000.0) * float(coef)
        co2_grams = kwh * float(self.CO2_GRAMS_PER_KWH)

        estimate = EnergyEstimate(
            kwh=kwh,
            co2_grams=co2_grams,
            elapsed_s=elapsed,
            tokens_used=tokens,
            provider=safe_provider,
        )
        return {
            "kwh": estimate.kwh,
            "co2_grams": estimate.co2_grams,
            "elapsed_s": estimate.elapsed_s,
            "tokens_used": estimate.tokens_used,
            "provider": estimate.provider,
        }

