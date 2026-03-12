"""
rate_limit.py — per-API-key rate limiting for Breaker Lab.

Uses slowapi (Starlette middleware wrapper around limits).

Limits (overridable via env vars):
  RATE_BREAK        — POST /break        default: 10/hour
  RATE_EVALUATE     — POST /evaluate     default: 20/hour
  RATE_READ         — GET  endpoints     default: 120/minute
  RATE_DELETE       — DELETE endpoints   default: 30/minute

Keyed by X-API-KEY header, not IP address.
Reason: all frontend requests arrive from Vercel edge — same IP for all users.
Keying by API key gives per-client limits instead of a shared pool.
"""

from __future__ import annotations

import os

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.requests import Request
from starlette.responses import JSONResponse


# ── Key function — prefer X-API-KEY over IP ───────────────────────────────────

def _key_by_api_key(request: Request) -> str:
    """
    Use the X-API-KEY header as the rate-limit bucket.
    Falls back to remote IP if the header is missing (e.g. unauthenticated probes).
    """
    api_key = request.headers.get("X-API-KEY") or request.headers.get("x-api-key")
    if api_key:
        return f"apikey:{api_key}"
    return f"ip:{get_remote_address(request)}"


# ── Limiter singleton ─────────────────────────────────────────────────────────

limiter = Limiter(key_func=_key_by_api_key, default_limits=[])


# ── Limit strings (env-overridable) ──────────────────────────────────────────

def _limit(env_var: str, default: str) -> str:
    return os.getenv(env_var, default)

# Heavy ops — these trigger LLM calls and consume Groq quota
LIMIT_BREAK    = _limit("RATE_BREAK",    "10/hour")    # POST /break
LIMIT_EVALUATE = _limit("RATE_EVALUATE", "20/hour")    # POST /evaluate
LIMIT_RETRY = _limit("RATE_RETRY", "10/minute")        # POST /report/{id}/retry
# Read ops — cheap DB queries
LIMIT_READ     = _limit("RATE_READ",     "120/minute") # GET  /report*, /history, /usage, /reports
LIMIT_DELETE   = _limit("RATE_DELETE",   "30/minute")  # DELETE /report/{id}


# ── 429 error handler ─────────────────────────────────────────────────────────

def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a clean JSON 429 instead of slowapi's default plain-text response."""
    limit_str = str(exc.limit.limit) if exc.limit else "unknown"
    return JSONResponse(
        status_code=429,
        content={
            "detail": f"Rate limit exceeded: {limit_str}. Please slow down.",
            "retry_after": getattr(exc, "retry_after", None),
        },
        headers={"Retry-After": str(getattr(exc, "retry_after", 60))},
    )