"""aibreaker.models — typed data classes for SDK consumers."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FailedTest:
    """A single test that the model failed."""
    question:     str
    ground_truth: str
    model_answer: str
    test_type:    str
    score:        float
    hallucination: bool
    reason:       str
    summary:      str
    fix_prompt:   str

    @classmethod
    def _from_dict(cls, d: dict) -> "FailedTest":
        return cls(
            question      = str(d.get("question",     "")),
            ground_truth  = str(d.get("ground_truth", "")),
            model_answer  = str(d.get("model_answer", "")),
            test_type     = str(d.get("test_type",    "unknown")),
            score         = float(d.get("score",       0.0)),
            hallucination = bool(d.get("hallucination", False)),
            reason        = str(d.get("reason",        "")),
            summary       = str(d.get("summary",       "")),
            fix_prompt    = str(d.get("fix_prompt",    "")),
        )


@dataclass(frozen=True)
class Metrics:
    """Top-level metrics from a completed report."""
    average_score:         float
    total_samples:         int
    hallucinations_detected: int
    low_quality_answers:   int
    fail_threshold:        float
    consistency_score:     float
    judges_agreement:      float          # 0–1; 1.0 = all judges agreed
    red_flags:             tuple[str, ...]
    breakdown_by_type:     dict[str, Any]
    judges:                dict[str, Any]

    @classmethod
    def _from_dict(cls, d: dict) -> "Metrics":
        return cls(
            average_score            = float(d.get("average_score",          0.0)),
            total_samples            = int(d.get("total_samples",            0)),
            hallucinations_detected  = int(d.get("hallucinations_detected",  0)),
            low_quality_answers      = int(d.get("low_quality_answers",      0)),
            fail_threshold           = float(d.get("fail_threshold",         5.0)),
            consistency_score        = float(d.get("consistency_score",      0.0)),
            judges_agreement         = float(d.get("judges_agreement",       1.0)),
            red_flags                = tuple(d.get("red_flags",              [])),
            breakdown_by_type        = dict(d.get("breakdown_by_type",       {})),
            judges                   = dict(d.get("judges",                  {})),
        )


@dataclass(frozen=True)
class Report:
    """
    A completed Breaker Lab evaluation report.

    Quick-start:
        report = client.break_model(target=..., description=..., num_tests=20)
        print(f"Score: {report.score:.1f}/10")
        print(f"Passed: {report.passed}")
        for f in report.failures:
            print(f" ✗ [{f.test_type}] {f.question}  →  score {f.score}")
    """

    report_id:   str
    status:      str
    score:       float               # average weighted score 0–10
    passed:      bool                # True when score >= fail_threshold
    metrics:     Metrics
    failures:    tuple[FailedTest, ...]
    results:     tuple[dict, ...]    # raw per-test rows for advanced use
    html_report_url: str | None
    report_url:  str

    @classmethod
    def _from_api(cls, row: dict, base_url: str, fail_threshold: float) -> "Report":
        metrics_raw = row.get("metrics") or {}
        results_raw = row.get("results") or []
        metrics     = Metrics._from_dict(metrics_raw)
        failures    = tuple(
            FailedTest._from_dict(f) for f in metrics_raw.get("failed_rows", [])
        )
        score = metrics.average_score

        html_path = row.get("html_report_url")
        html_url  = f"{base_url.rstrip('/')}{html_path}" if html_path else None

        return cls(
            report_id        = str(row.get("report_id", "")),
            status           = str(row.get("status",    "done")),
            score            = score,
            passed           = score >= fail_threshold,
            metrics          = metrics,
            failures         = failures,
            results          = tuple(results_raw),
            html_report_url  = html_url,
            report_url       = f"{base_url.rstrip('/')}/report/{row.get('report_id', '')}",
        )

    # ── Convenience ───────────────────────────────────────────────────────────

    @property
    def failure_count(self) -> int:
        return len(self.failures)

    @property
    def hallucination_count(self) -> int:
        return self.metrics.hallucinations_detected

    def __str__(self) -> str:
        status = "✓ PASSED" if self.passed else "✗ FAILED"
        return (
            f"Report {self.report_id[:8]}  {status}\n"
            f"  Score        : {self.score:.2f} / 10\n"
            f"  Failures     : {self.failure_count} / {self.metrics.total_samples}\n"
            f"  Hallucinations: {self.hallucination_count}\n"
            f"  Agreement    : {self.metrics.judges_agreement:.0%}\n"
            f"  Red flags    : {len(self.metrics.red_flags)}\n"
            f"  Report URL   : {self.report_url}"
        )
