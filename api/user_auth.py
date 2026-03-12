"""
api/user_auth.py
================
JWT creation/verification and bcrypt password helpers.

Dependencies:
  bcrypt>=4.0.1
  PyJWT>=2.8.0

Environment variables:
  AUTH_SECRET      - secret key for signing JWTs (required in production)
  JWT_EXPIRY_HOURS - token lifetime in hours (default: 24)
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

AUTH_SECRET: str = os.getenv("AUTH_SECRET", "dev-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))

if AUTH_SECRET == "dev-secret-change-me-in-production":
    import warnings
    warnings.warn(
        "AUTH_SECRET is not set. Using insecure default - set AUTH_SECRET in .env before deploying.",
        stacklevel=1,
    )


def hash_password(plain: str) -> str:
    """Return a bcrypt hash of the plain-text password."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str, name: str) -> str:
    """
    Create a signed JWT with user identity claims.
    Expires in JWT_EXPIRY_HOURS hours.
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, AUTH_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """
    Decode and verify a JWT.
    Returns the payload dict on success.
    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure.
    """
    return jwt.decode(token, AUTH_SECRET, algorithms=[JWT_ALGORITHM])
