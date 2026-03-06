from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID


class Sample(BaseModel):
    question: str
    ground_truth: str
    model_answer: str
    context: Optional[str] = None


class EvaluationRequest(BaseModel):
    dataset: Optional[List[Sample]] = None
    samples: Optional[List[Sample]] = None
    dataset_id: Optional[str] = None
    model_version: Optional[str] = None
    judge_model: Optional[str] = None  # None = use all providers from config.yaml

    def get_samples(self) -> List[Sample]:
        return self.dataset or self.samples or []


class EvaluationResponse(BaseModel):
    report_id: UUID
    metrics: dict
    results: list
    report_url: str
    report_share_url: Optional[str] = None
