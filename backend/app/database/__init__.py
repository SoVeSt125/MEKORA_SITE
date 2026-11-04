from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings


def now():
    return datetime.now(timezone.utc)


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def uid():
    return str(uuid4())


class Base(DeclarativeBase):
    pass


engine = create_engine(settings.database_url, pool_pre_ping=True,
                       connect_args={"check_same_thread": False, "timeout": 30} if settings.database_url.startswith("sqlite") else {})
if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def sqlite_config(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")

SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db
