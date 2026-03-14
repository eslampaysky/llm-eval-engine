import os

import pytest


def _ensure_targets_secret():
    if os.getenv("TARGETS_SECRET", "").strip():
        return
    try:
        from cryptography.fernet import Fernet
    except Exception:
        # Fallback constant (32 url-safe base64-encoded bytes) for test-only use.
        os.environ["TARGETS_SECRET"] = "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA="
        return
    os.environ["TARGETS_SECRET"] = Fernet.generate_key().decode("utf-8")


@pytest.fixture(scope="session", autouse=True)
def _set_targets_secret_for_tests():
    _ensure_targets_secret()
