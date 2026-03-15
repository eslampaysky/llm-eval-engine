"""API route tests for FastAPI backend."""

from __future__ import annotations

import importlib
import os
import sys
import shutil
import tempfile
from typing import Generator
from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def _block_external_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """Prevent accidental external HTTP calls during tests."""
    def _blocked(*_args, **_kwargs):  # pragma: no cover - should never be called
        raise AssertionError("External HTTP call blocked in tests.")

    monkeypatch.setattr("requests.post", _blocked)


@pytest.fixture()
def app_client(monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    base_tmp = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "_pytest_tmp"))
    os.makedirs(base_tmp, exist_ok=True)
    temp_dir = tempfile.mkdtemp(dir=base_tmp)
    monkeypatch.setenv("DATA_DIR", temp_dir)
    monkeypatch.setenv("API_KEYS", "test_key")
    monkeypatch.setenv("AUTH_SECRET", "test-secret")
    monkeypatch.delenv("PADDLE_API_KEY", raising=False)
    monkeypatch.delenv("PADDLE_PRO_PRICE_ID", raising=False)
    monkeypatch.delenv("PADDLE_RUN_PACK_PRICE_ID", raising=False)

    for mod in ["api.database", "api.routes", "api.auth_routes", "api.main"]:
        if mod in sys.modules:
            del sys.modules[mod]

    import api.main as main
    importlib.reload(main)

    try:
        with TestClient(main.app) as client:
            yield client
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture()
def auth_token(app_client: TestClient) -> str:
    email = f"user_{uuid4().hex[:8]}@example.com"
    payload = {"name": "Test User", "email": email, "password": "TestPass123!"}
    res = app_client.post("/auth/register", json=payload)
    assert res.status_code == 201
    return res.json()["access_token"]


def test_health(app_client: TestClient) -> None:
    res = app_client.get("/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"


def test_register_and_duplicate_email(app_client: TestClient) -> None:
    email = f"user_{uuid4().hex[:8]}@example.com"
    payload = {"name": "Test User", "email": email, "password": "TestPass123!"}

    res = app_client.post("/auth/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert "access_token" in data
    assert data["user"]["email"] == email.lower()

    res2 = app_client.post("/auth/register", json=payload)
    assert res2.status_code == 409


def test_login_success_and_failure(app_client: TestClient) -> None:
    email = f"user_{uuid4().hex[:8]}@example.com"
    payload = {"name": "Test User", "email": email, "password": "TestPass123!"}
    app_client.post("/auth/register", json=payload)

    res = app_client.post("/auth/login", json={"email": email, "password": "TestPass123!"})
    assert res.status_code == 200
    assert "access_token" in res.json()

    res_bad = app_client.post("/auth/login", json={"email": email, "password": "wrong"})
    assert res_bad.status_code == 401


def test_auth_me_requires_token(app_client: TestClient, auth_token: str) -> None:
    res = app_client.get("/auth/me")
    assert res.status_code == 401

    res_ok = app_client.get("/auth/me", headers={"Authorization": f"Bearer {auth_token}"})
    assert res_ok.status_code == 200
    assert "email" in res_ok.json()


def test_evaluate_and_report_endpoints(app_client: TestClient) -> None:
    fake_results = [
        {
            "question": "q1",
            "ground_truth": "a1",
            "model_answer": "m1",
            "correctness": 7.0,
            "relevance": 7.0,
            "hallucination": False,
            "reason": "ok",
            "judges": {},
        }
    ]
    fake_metrics = {"average_score": 7.0, "total_samples": 1}

    with patch("api.routes._run_pipeline", return_value=(fake_results, fake_metrics)), \
         patch("api.routes.generate_html_report", return_value="report.html"):
        res = app_client.post(
            "/evaluate",
            headers={"X-API-KEY": "test_key"},
            json={"samples": [{"question": "q1", "ground_truth": "a1"}]},
        )

    assert res.status_code == 200
    report_id = res.json()["report_id"]

    res_report = app_client.get(f"/report/{report_id}", headers={"X-API-KEY": "test_key"})
    assert res_report.status_code == 200
    assert res_report.json()["report_id"] == report_id

    res_missing = app_client.get("/report/does-not-exist", headers={"X-API-KEY": "test_key"})
    assert res_missing.status_code == 404


def test_break_endpoint(app_client: TestClient) -> None:
    payload = {
        "target": {
            "type": "openai",
            "model_name": "gpt-4o-mini",
        },
        "description": "Customer support assistant for a SaaS product",
        "num_tests": 6,
        "groq_api_key": "gsk_test",
    }

    with patch("api.routes.enqueue_job", new=AsyncMock()) as enqueue_mock:
        res = app_client.post(
            "/break",
            headers={"X-API-KEY": "test_key"},
            json=payload,
        )

    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "processing"
    assert "report_id" in body
    enqueue_mock.assert_awaited()


def test_billing_checkout_errors(app_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    res = app_client.post(
        "/billing/checkout",
        headers={"X-API-KEY": "test_key"},
        json={"plan": "invalid-plan"},
    )
    assert res.status_code == 400

    monkeypatch.setenv("PADDLE_PRO_PRICE_ID", "price_123")
    monkeypatch.setenv("PADDLE_API_KEY", "")
    res_missing_key = app_client.post(
        "/billing/checkout",
        headers={"X-API-KEY": "test_key"},
        json={"plan": "pro"},
    )
    assert res_missing_key.status_code == 500
