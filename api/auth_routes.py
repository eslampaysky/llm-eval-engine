"""
api/auth_routes.py
==================
FastAPI router for user authentication endpoints.

Routes:
  POST   /auth/register         - create account, return JWT
  POST   /auth/login            - verify credentials, return JWT
  GET    /auth/me               - return current user (requires Bearer token)
  PATCH  /auth/me               - update name/email (requires Bearer token)
  POST   /auth/change-password  - change password (requires Bearer token)
  DELETE /auth/me               - deactivate account (requires Bearer token)
"""

from __future__ import annotations

from typing import Annotated, Any
from datetime import datetime, timezone, timedelta
from email.message import EmailMessage
import logging
import os
import secrets
import smtplib

import jwt as _jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from api.database import (
    create_user,
    deactivate_user,
    get_user_by_email,
    get_user_by_id,
    get_user_plan,
    get_usage_count,
    create_password_reset_token,
    get_password_reset_token,
    mark_password_reset_token_used,
    update_user_password,
    update_user_profile,
)
from api.plans import get_plan_limits, resolve_plan
from api.user_auth import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)

auth_router = APIRouter(prefix="/auth", tags=["auth"])
_bearer = HTTPBearer(auto_error=False)
_log = logging.getLogger(__name__)


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict[str, Any]


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> dict:
    """
    Dependency: extract and verify the Bearer JWT from the Authorization header.
    Returns the user dict from the database.
    Raises 401 if the token is missing, invalid, or expired.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing or not a Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = decode_access_token(credentials.credentials)
    except _jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except _jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is malformed (missing 'sub').",
        )

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found. It may have been deleted.",
        )

    if not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    return user


@auth_router.post(
    "/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
def register(payload: RegisterRequest) -> AuthResponse:
    """
    Create a new user account.
    Returns a JWT access token immediately (no email verification step).
    """
    existing = get_user_by_email(payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    try:
        hashed = hash_password(payload.password)
        user = create_user(
            name=payload.name,
            email=str(payload.email),
            password_hash=hashed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    token = create_access_token(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
    )

    return AuthResponse(
        access_token=token,
        user={
            "user_id": user["user_id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        },
    )


@auth_router.post(
    "/login",
    response_model=AuthResponse,
    summary="Log in with email and password",
)
def login(payload: LoginRequest) -> AuthResponse:
    """
    Authenticate with email + password.
    Returns a JWT access token on success.
    Uses a dummy hash when email is not found to avoid timing attacks.
    """
    user = get_user_by_email(str(payload.email))
    stored_hash = (
        user["password_hash"]
        if user
        else "$2b$12$invalidhashpadding000000000000000000000000000000000000000"
    )

    password_ok = verify_password(payload.password, stored_hash)

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.get("is_active"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    token = create_access_token(
        user_id=user["user_id"],
        email=user["email"],
        name=user["name"],
    )

    return AuthResponse(
        access_token=token,
        user={
            "user_id": user["user_id"],
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        },
    )


@auth_router.get(
    "/me",
    summary="Get current authenticated user",
)
def me(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
    """
    Return the profile of the currently authenticated user.
    Requires a valid Bearer token in the Authorization header.
    """
    plan_row = get_user_plan(current_user["user_id"])
    plan = resolve_plan(plan_row.get("plan"), plan_row.get("plan_expires_at"))
    limits = get_plan_limits(plan)
    client_name = current_user.get("email") or ""
    month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
    runs_this_month = get_usage_count(client_name, month_prefix)
    total_runs_all_time = get_usage_count(client_name, None)
    run_limit = limits.get("runs_per_month", 0)
    tests_per_run_limit = limits.get("tests_per_run", 0)
    return {
        "user_id": current_user["user_id"],
        "name": current_user["name"],
        "email": current_user["email"],
        "created_at": current_user["created_at"],
        "plan": plan,
        "plan_expires_at": plan_row.get("plan_expires_at"),
        "runs_this_month": int(runs_this_month or 0),
        "run_limit": None if int(run_limit or 0) < 0 else int(run_limit or 0),
        "tests_per_run_limit": None if int(tests_per_run_limit or 0) < 0 else int(tests_per_run_limit or 0),
        "agentic_enabled": bool(limits.get("agentic", False)),
        "total_runs_all_time": int(total_runs_all_time or 0),
    }


class UpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr


@auth_router.patch("/me", summary="Update current user profile")
def update_profile(
    payload: UpdateProfileRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """
    Update display name and email address.
    Returns the updated user profile (token is not rotated).
    """
    try:
        updated = update_user_profile(
            user_id=current_user["user_id"],
            name=payload.name,
            email=str(payload.email),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    return {
        "user_id": updated["user_id"],
        "name": updated["name"],
        "email": updated["email"],
        "created_at": updated["created_at"],
    }


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


@auth_router.post("/change-password", summary="Change current user password")
def change_password(
    payload: ChangePasswordRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Change password after verifying the current one."""
    user_with_hash = get_user_by_email(current_user["email"])
    if not user_with_hash:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not verify_password(payload.current_password, user_with_hash["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    new_hash = hash_password(payload.new_password)
    ok = update_user_password(current_user["user_id"], new_hash)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Password update failed.",
        )

    return {"success": True, "message": "Password updated successfully."}


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1)
    confirm: str


@auth_router.delete("/me", summary="Deactivate current user account")
def delete_account(
    payload: DeleteAccountRequest,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict:
    """Soft-delete the account. Requires password + confirmation string."""
    if payload.confirm != "DELETE MY ACCOUNT":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Confirmation string must be exactly: DELETE MY ACCOUNT',
        )

    user_with_hash = get_user_by_email(current_user["email"])
    if not user_with_hash:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    if not verify_password(payload.password, user_with_hash["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    deactivate_user(current_user["user_id"])
    return {"success": True, "message": "Account deactivated."}


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


@auth_router.post("/forgot-password", summary="Request a password reset email")
def forgot_password(payload: ForgotPasswordRequest) -> dict:
    """
    Generate a reset token and email it if SMTP is configured.
    Always returns a generic success message to avoid account enumeration.
    """
    user = get_user_by_email(str(payload.email))
    if user:
        token = secrets.token_urlsafe(32)
        try:
            create_password_reset_token(user["user_id"], token)
        except Exception as exc:
            _log.error("Failed to store password reset token: %s", exc, exc_info=True)
            return {"message": "If that email exists, a reset link was sent."}

        smtp_host = os.getenv("SMTP_HOST", "").strip()
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        smtp_user = os.getenv("SMTP_USER", "").strip()
        smtp_pass = os.getenv("SMTP_PASS", "").strip()
        smtp_from = os.getenv("SMTP_FROM", "").strip()
        frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")

        smtp_configured = all([smtp_host, smtp_user, smtp_pass, smtp_from])
        if not smtp_configured:
            _log.info("[Auth] Password reset token for %s: %s", user["email"], token)
            return {"message": "If that email exists, a reset link was sent."}

        if not frontend_url:
            _log.warning("[Auth] FRONTEND_URL not set; cannot send reset email.")
            return {"message": "If that email exists, a reset link was sent."}

        reset_link = f"{frontend_url}/auth/reset-password?token={token}"
        msg = EmailMessage()
        msg["Subject"] = "AI Breaker Lab password reset"
        msg["From"] = smtp_from
        msg["To"] = user["email"]
        msg.set_content(
            "You requested a password reset for AI Breaker Lab.\n\n"
            f"Reset your password here:\n{reset_link}\n\n"
            "If you did not request this, you can ignore this email."
        )

        try:
            with smtplib.SMTP(smtp_host, smtp_port) as smtp:
                smtp.starttls()
                smtp.login(smtp_user, smtp_pass)
                smtp.send_message(msg)
        except Exception as exc:
            _log.error("Failed to send reset email: %s", exc, exc_info=True)

    return {"message": "If that email exists, a reset link was sent."}


@auth_router.post("/reset-password", summary="Reset password using a token")
def reset_password(payload: ResetPasswordRequest) -> dict:
    """
    Reset a user's password using a valid reset token.
    """
    token_row = get_password_reset_token(payload.token)
    if not token_row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token.")

    used = bool(token_row.get("used"))
    if used:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token.")

    created_at_raw = str(token_row.get("created_at") or "").strip()
    try:
        created_at = datetime.fromisoformat(created_at_raw)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token.")
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) - created_at > timedelta(hours=1):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token.")

    new_hash = hash_password(payload.new_password)
    ok = update_user_password(token_row["user_id"], new_hash)
    if not ok:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Password update failed.")

    mark_password_reset_token_used(payload.token)
    return {"message": "Password reset successfully."}
