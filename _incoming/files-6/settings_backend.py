"""
BACKEND ADDITIONS
=================

─────────────────────────────────────────────────────────────────────────────
1. ADD TO api/database.py (at the bottom, after existing user functions)
─────────────────────────────────────────────────────────────────────────────
"""

# ── User update helpers ───────────────────────────────────────────────────────

def update_user_profile(user_id: str, name: str, email: str) -> dict | None:
    """Update name and/or email. Returns updated user or None if not found."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        try:
            if _USE_PG:
                cur.execute(
                    "UPDATE users SET name=%s, email=%s, updated_at=%s WHERE user_id=%s",
                    (name, email.lower().strip(), now, user_id),
                )
            else:
                cur.execute(
                    "UPDATE users SET name=?, email=?, updated_at=? WHERE user_id=?",
                    (name, email.lower().strip(), now, user_id),
                )
            if cur.rowcount == 0:
                return None
        except Exception as exc:
            if "unique" in str(exc).lower():
                raise ValueError("That email is already in use by another account.") from exc
            raise
    return get_user_by_id(user_id)


def update_user_password(user_id: str, new_password_hash: str) -> bool:
    """Update password hash. Returns True on success."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE users SET password_hash=%s, updated_at=%s WHERE user_id=%s",
                (new_password_hash, now, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET password_hash=?, updated_at=? WHERE user_id=?",
                (new_password_hash, now, user_id),
            )
        return (cur.rowcount or 0) > 0


def deactivate_user(user_id: str) -> bool:
    """Soft-delete: marks account inactive. Returns True on success."""
    now = _utc_now()
    with _get_conn() as conn:
        cur = conn.cursor()
        if _USE_PG:
            cur.execute(
                "UPDATE users SET is_active=FALSE, updated_at=%s WHERE user_id=%s",
                (now, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET is_active=0, updated_at=? WHERE user_id=?",
                (now, user_id),
            )
        return (cur.rowcount or 0) > 0


"""
─────────────────────────────────────────────────────────────────────────────
2. ADD TO api/auth_routes.py (after the existing /me route)
─────────────────────────────────────────────────────────────────────────────
"""

# Add these imports at the top of auth_routes.py:
# from api.database import update_user_profile, update_user_password, deactivate_user

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Annotated

class UpdateProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(..., min_length=1)
    confirm: str  # must equal "DELETE MY ACCOUNT"


# ── PATCH /auth/me — update profile ──────────────────────────────────────────

# @auth_router.patch("/me")
# def update_profile(
#     payload: UpdateProfileRequest,
#     current_user: Annotated[dict, Depends(get_current_user)],
# ) -> dict:
#     """Update display name and/or email address."""
#     try:
#         updated = update_user_profile(
#             user_id=current_user["user_id"],
#             name=payload.name,
#             email=str(payload.email),
#         )
#     except ValueError as exc:
#         raise HTTPException(status_code=409, detail=str(exc))
#
#     if not updated:
#         raise HTTPException(status_code=404, detail="User not found.")
#
#     # Re-issue token with new name/email baked in
#     new_token = create_access_token(
#         user_id=updated["user_id"],
#         email=updated["email"],
#         name=updated["name"],
#     )
#     return {
#         "access_token": new_token,
#         "token_type": "bearer",
#         "user": {
#             "user_id": updated["user_id"],
#             "name": updated["name"],
#             "email": updated["email"],
#             "created_at": updated["created_at"],
#         },
#     }


# ── POST /auth/change-password ────────────────────────────────────────────────

# @auth_router.post("/change-password", status_code=200)
# def change_password(
#     payload: ChangePasswordRequest,
#     current_user: Annotated[dict, Depends(get_current_user)],
# ) -> dict:
#     """Change password after verifying the current one."""
#     user_with_hash = get_user_by_email(current_user["email"])
#     if not user_with_hash:
#         raise HTTPException(status_code=404, detail="User not found.")
#
#     if not verify_password(payload.current_password, user_with_hash["password_hash"]):
#         raise HTTPException(status_code=401, detail="Current password is incorrect.")
#
#     new_hash = hash_password(payload.new_password)
#     ok = update_user_password(current_user["user_id"], new_hash)
#     if not ok:
#         raise HTTPException(status_code=500, detail="Password update failed.")
#
#     return {"success": True, "message": "Password updated successfully."}


# ── DELETE /auth/me — deactivate account ─────────────────────────────────────

# @auth_router.delete("/me", status_code=200)
# def delete_account(
#     payload: DeleteAccountRequest,
#     current_user: Annotated[dict, Depends(get_current_user)],
# ) -> dict:
#     """Soft-delete the account. Requires password + confirmation string."""
#     if payload.confirm != "DELETE MY ACCOUNT":
#         raise HTTPException(
#             status_code=422,
#             detail="Confirmation string must be exactly: DELETE MY ACCOUNT",
#         )
#
#     user_with_hash = get_user_by_email(current_user["email"])
#     if not verify_password(payload.password, user_with_hash["password_hash"]):
#         raise HTTPException(status_code=401, detail="Incorrect password.")
#
#     deactivate_user(current_user["user_id"])
#     return {"success": True, "message": "Account deactivated."}
