from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, Request, Response
from sqlalchemy.orm import Session

import models


STUDENT_SESSION_COOKIE = "aimon_student_session"
SESSION_DAYS = 30
SESSION_TOUCH_SECONDS = 300


def normalize_phone(phone: str) -> str:
    return "".join(ch for ch in phone if ch.isdigit())


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def cookie_secure() -> bool:
    # Local HTTP development must work; production HTTPS should opt in.
    import os

    return os.getenv("COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}


def student_public_dict(student: models.Student) -> dict:
    return {"id": student.id, "name": student.name, "grade": student.grade}


def as_aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def issue_student_session(db: Session, response: Response, student: models.Student) -> dict:
    token = secrets.token_urlsafe(48)
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=SESSION_DAYS)
    session = models.StudentSession(
        student_id=student.id,
        token_hash=hash_token(token),
        created_at=now,
        expires_at=expires_at,
        last_used_at=now,
    )
    db.add(session)
    db.commit()
    response.set_cookie(
        STUDENT_SESSION_COOKIE,
        token,
        max_age=SESSION_DAYS * 24 * 60 * 60,
        expires=expires_at,
        httponly=True,
        secure=cookie_secure(),
        samesite="lax",
        path="/",
    )
    return student_public_dict(student)


def clear_student_cookie(response: Response) -> None:
    response.delete_cookie(STUDENT_SESSION_COOKIE, path="/", samesite="lax", secure=cookie_secure())


def get_current_student_from_cookie(db: Session, request: Request, *, touch: bool = True) -> models.Student:
    token = request.cookies.get(STUDENT_SESSION_COOKIE)
    if not token:
        raise HTTPException(status_code=401, detail="Student session required.")
    now = datetime.now(timezone.utc)
    session = (
        db.query(models.StudentSession)
        .filter(models.StudentSession.token_hash == hash_token(token))
        .first()
    )
    if session is None or session.revoked_at is not None or as_aware_utc(session.expires_at) <= now:
        raise HTTPException(status_code=401, detail="Student session expired.")
    student = db.get(models.Student, session.student_id)
    if student is None:
        raise HTTPException(status_code=401, detail="Student session invalid.")
    if touch and (
        session.last_used_at is None
        or as_aware_utc(session.last_used_at) <= now - timedelta(seconds=SESSION_TOUCH_SECONDS)
    ):
        session.last_used_at = now
        db.commit()
    return student


def revoke_current_student_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(STUDENT_SESSION_COOKIE)
    if token:
        session = (
            db.query(models.StudentSession)
            .filter(models.StudentSession.token_hash == hash_token(token))
            .first()
        )
        if session is not None and session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            db.commit()
    clear_student_cookie(response)
