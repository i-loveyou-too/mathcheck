from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

import models
from database import get_db
from student_auth import cookie_secure


ADMIN_SESSION_COOKIE = "aimon_admin_session"
SESSION_HOURS = 12


def _secret() -> bytes:
    value = os.getenv("ADMIN_SESSION_SECRET") or os.getenv("SECRET_KEY")
    if not value:
        environment = (
            os.getenv("ENVIRONMENT")
            or os.getenv("APP_ENV")
            or os.getenv("FASTAPI_ENV")
            or os.getenv("ENV")
            or "development"
        ).strip().lower()
        if environment in {"prod", "production"}:
            raise RuntimeError("ADMIN_SESSION_SECRET or SECRET_KEY must be configured in production.")
        value = "dev-only-admin-session-secret"
    return value.encode("utf-8")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def _sign(payload: str) -> str:
    return _b64encode(hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest())


def _session_payload(admin: models.Admin, expires_at: datetime) -> dict[str, Any]:
    return {
        "admin_id": admin.id,
        "username": admin.username,
        "exp": int(expires_at.timestamp()),
    }


def create_admin_session_token(admin: models.Admin, *, now: datetime | None = None) -> tuple[str, datetime]:
    now = now or datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=SESSION_HOURS)
    payload = _b64encode(json.dumps(_session_payload(admin, expires_at), separators=(",", ":")).encode("utf-8"))
    return f"{payload}.{_sign(payload)}", expires_at


def issue_admin_session(response: Response, admin: models.Admin) -> None:
    token, expires_at = create_admin_session_token(admin)
    response.set_cookie(
        ADMIN_SESSION_COOKIE,
        token,
        max_age=SESSION_HOURS * 60 * 60,
        expires=expires_at,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        path="/",
    )


def clear_admin_cookie(response: Response) -> None:
    response.delete_cookie(ADMIN_SESSION_COOKIE, path="/", samesite="lax", secure=cookie_secure())


def _decode_admin_session(token: str) -> dict[str, Any]:
    try:
        payload, signature = token.split(".", 1)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Admin session invalid.") from exc
    if not hmac.compare_digest(signature, _sign(payload)):
        raise HTTPException(status_code=401, detail="Admin session invalid.")
    try:
        data = json.loads(_b64decode(payload).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Admin session invalid.") from exc
    if int(data.get("exp") or 0) <= int(datetime.now(timezone.utc).timestamp()):
        raise HTTPException(status_code=401, detail="Admin session expired.")
    return data


def get_current_admin_from_cookie(db: Session, request: Request) -> models.Admin:
    token = request.cookies.get(ADMIN_SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Admin session required.")
    data = _decode_admin_session(token)
    admin = db.get(models.Admin, int(data.get("admin_id") or 0))
    if admin is None or admin.username != data.get("username"):
        raise HTTPException(status_code=401, detail="Admin session invalid.")
    return admin


def require_admin(request: Request, db: Session = Depends(get_db)) -> models.Admin:
    return get_current_admin_from_cookie(db, request)
