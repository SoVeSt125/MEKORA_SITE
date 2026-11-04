from datetime import timedelta
import hashlib
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Cookie, Depends, HTTPException, Request
from sqlalchemy.orm import Session as DB
from app.database import get_db, now, utc
from app.models import User, Session
from app.config import settings

passwords = PasswordHasher()


def digest(value: str):
    return hashlib.sha256(value.encode()).hexdigest()


def authenticate(request: Request, mekora_session: str | None = Cookie(None), db: DB = Depends(get_db)):
    session = db.get(Session, digest(mekora_session or ""))
    if not session or utc(session.expires_at) <= now():
        raise HTTPException(401, "Войдите в MEKORA Monitor")
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        if not secrets.compare_digest(request.headers.get("X-CSRF-Token", ""), session.csrf):
            raise HTTPException(403, "Сессия изменилась. Обновите страницу")
    user = db.get(User, session.user_id)
    request.state.session = session
    return user


def engineer(user=Depends(authenticate)):
    if user.role not in ("admin", "chief", "engineer"):
        raise HTTPException(403, "Недостаточно прав")
    return user


def administrator(user=Depends(authenticate)):
    if user.role not in ("admin", "chief"):
        raise HTTPException(403, "Требуется администратор или главный инженер")
    return user


def new_session(db, user):
    token, csrf = secrets.token_urlsafe(40), secrets.token_urlsafe(32)
    db.add(Session(token_hash=digest(token), user_id=user.id, csrf=csrf,
                   expires_at=now() + timedelta(hours=settings.session_hours)))
    db.commit()
    return token, csrf
