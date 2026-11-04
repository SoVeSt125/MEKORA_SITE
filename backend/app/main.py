import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import select
from app.api import router
from app.config import settings
from app.database import SessionLocal
from app.models import Motor, Device, Installation
from app.analytics.rules import connection_check, WRITE_LOCK


def check_connections():
    with WRITE_LOCK, SessionLocal() as db:
        for installation in db.scalars(select(Installation)):
            motor = db.get(Motor, installation.motor_id)
            if not motor.archived:
                connection_check(db, motor, db.get(Device, installation.device_id))
        db.commit()


async def monitor():
    while True:
        await asyncio.sleep(3)
        try:
            await asyncio.to_thread(check_connections)
        except Exception:
            import logging
            logging.exception("Connection monitor failed")


@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(monitor())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="MEKORA Monitor API", version="0.1.0", lifespan=lifespan)
app.include_router(router)


@app.middleware("http")
async def protect_origin(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin not in settings.allowed_origins.split(","):
            return JSONResponse({"detail": "Источник запроса не разрешён"}, status_code=403)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, error):
    fields = ", ".join(".".join(str(p) for p in e["loc"][1:]) for e in error.errors())
    return JSONResponse({"detail": "Проверьте значения полей: " + fields}, status_code=422)
