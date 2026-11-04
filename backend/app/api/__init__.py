import asyncio
import csv
from datetime import timedelta
import io
import json
import secrets
import time
from collections import defaultdict, deque
import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DB
from argon2.exceptions import VerificationError
from app.config import settings
from app.database import get_db, now, utc
from app.models import User, Session, Organization, Workshop, Asset, Motor, Device, Installation, Measurement, Baseline, Alert, AlertHistory, Inspection, MaintenanceRecord
from app.schemas import Login, OrganizationIn, WorkshopIn, AssetIn, MotorIn, DeviceIn, SimulationIn, Telemetry, AlertUpdate, InspectionIn, UserIn
from app.security import authenticate, engineer, administrator, passwords, new_session, digest
from app.services.read import as_dict, audit, motor_view, alert_view
from app.analytics.rules import WRITE_LOCK, latest, baseline_for, VERSION
from app.ingestion import ingest

router = APIRouter(prefix="/api")
attempts = defaultdict(deque)


def get_or_404(db, model, key):
    obj = db.get(model, key)
    if not obj:
        raise HTTPException(404, "Запись не найдена")
    return obj


def save(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Запись с таким идентификатором уже существует")


@router.get("/health")
def health(db: DB = Depends(get_db)):
    db.execute(select(1))
    return {"status": "ok", "service": "MEKORA Monitor", "version": "0.1.0"}


@router.post("/auth/login")
def login(body: Login, request: Request, response: Response, db: DB = Depends(get_db)):
    ip = request.client.host if request.client else "local"
    queue = attempts[ip]
    while queue and time.monotonic() - queue[0] > 60:
        queue.popleft()
    if len(queue) >= 10:
        raise HTTPException(429, "Слишком много попыток. Подождите минуту")
    queue.append(time.monotonic())
    user = db.scalar(select(User).where(User.username == body.username))
    valid = False
    if user:
        try:
            valid = passwords.verify(user.password_hash, body.password)
        except VerificationError:
            pass
    if not valid:
        raise HTTPException(401, "Неверный логин или пароль")
    queue.clear()
    token, csrf = new_session(db, user)
    response.set_cookie("mekora_session", token, httponly=True, secure=settings.cookie_secure,
                        samesite="strict", max_age=settings.session_hours * 3600, path="/api")
    audit(db, user, "login", user.id)
    db.commit()
    return {"user": as_dict(user), "csrf": csrf}


@router.get("/auth/me")
def me(request: Request, user=Depends(authenticate)):
    return {"user": as_dict(user), "csrf": request.state.session.csrf}


@router.post("/auth/logout")
def logout(request: Request, response: Response, user=Depends(authenticate), db: DB = Depends(get_db)):
    db.delete(db.get(Session, request.state.session.token_hash))
    db.commit()
    response.delete_cookie("mekora_session", path="/api")
    return {"ok": True}


@router.get("/settings")
def configuration(user=Depends(authenticate)):
    return {"demo_enabled": settings.demo_enabled, "stale_seconds": settings.stale_seconds,
            "rule_version": VERSION, "storage": "PostgreSQL" if settings.database_url.startswith("postgresql") else "SQLite"}


@router.get("/catalog")
def catalog(user=Depends(authenticate), db: DB = Depends(get_db)):
    return {"organizations": [as_dict(r) for r in db.scalars(select(Organization).order_by(Organization.name))],
            "workshops": [as_dict(r) for r in db.scalars(select(Workshop).order_by(Workshop.name))],
            "assets": [as_dict(r) for r in db.scalars(select(Asset).order_by(Asset.name))]}


@router.post("/organizations", status_code=201)
def organization_create(body: OrganizationIn, user=Depends(administrator), db: DB = Depends(get_db)):
    row = Organization(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "organization.create", row.id)
    save(db)
    return as_dict(row)


@router.post("/workshops", status_code=201)
def workshop_create(body: WorkshopIn, user=Depends(administrator), db: DB = Depends(get_db)):
    get_or_404(db, Organization, body.organization_id)
    row = Workshop(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "workshop.create", row.id)
    save(db)
    return as_dict(row)


@router.post("/assets", status_code=201)
def asset_create(body: AssetIn, user=Depends(administrator), db: DB = Depends(get_db)):
    get_or_404(db, Workshop, body.workshop_id)
    row = Asset(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "asset.create", row.id)
    save(db)
    return as_dict(row)


@router.get("/motors")
def motors(archived: bool = False, user=Depends(authenticate), db: DB = Depends(get_db)):
    return [motor_view(db, m) for m in db.scalars(select(Motor).where(Motor.archived == archived).order_by(Motor.created_at.desc()))]


@router.post("/motors", status_code=201)
def motor_create(body: MotorIn, user=Depends(administrator), db: DB = Depends(get_db)):
    get_or_404(db, Asset, body.asset_id)
    row = Motor(**body.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "motor.create", row.id)
    save(db)
    return motor_view(db, row)


@router.get("/motors/{motor_id}")
def motor_get(motor_id: str, user=Depends(authenticate), db: DB = Depends(get_db)):
    return motor_view(db, get_or_404(db, Motor, motor_id))


@router.put("/motors/{motor_id}")
def motor_edit(motor_id: str, body: MotorIn, user=Depends(administrator), db: DB = Depends(get_db)):
    row = get_or_404(db, Motor, motor_id)
    get_or_404(db, Asset, body.asset_id)
    for k, v in body.model_dump().items():
        setattr(row, k, v)
    audit(db, user, "motor.update", row.id, body.model_dump())
    save(db)
    return motor_view(db, row)


@router.post("/motors/{motor_id}/archive")
def motor_archive(motor_id: str, user=Depends(administrator), db: DB = Depends(get_db)):
    motor = get_or_404(db, Motor, motor_id)
    motor.archived = not motor.archived
    installation = db.scalar(select(Installation).where(Installation.motor_id == motor.id))
    if installation:
        get_or_404(db, Device, installation.device_id).simulation_enabled = False
    audit(db, user, "motor.archive" if motor.archived else "motor.restore", motor.id)
    save(db)
    return motor_view(db, motor)


@router.get("/motors/{motor_id}/measurements")
def measurements(motor_id: str, hours: int = Query(1, ge=1, le=720), limit: int = Query(2000, ge=1, le=10000),
                 user=Depends(authenticate), db: DB = Depends(get_db)):
    get_or_404(db, Motor, motor_id)
    rows = list(db.scalars(select(Measurement).where(Measurement.motor_id == motor_id,
                           Measurement.measured_at >= now() - timedelta(hours=hours))
                           .order_by(Measurement.measured_at.desc()).limit(limit)))
    return {"items": [as_dict(r) for r in reversed(rows)], "limit": limit, "truncated": len(rows) == limit}


@router.post("/motors/{motor_id}/baseline")
def approve_baseline(motor_id: str, user=Depends(administrator), db: DB = Depends(get_db)):
    with WRITE_LOCK:
        motor = get_or_404(db, Motor, motor_id)
        installation = db.scalar(select(Installation).where(Installation.motor_id == motor.id))
        if not installation or motor.archived:
            raise HTTPException(409, "Нужен активный двигатель с датчиком")
        get_or_404(db, Device, installation.device_id)
        rows = latest(db, motor.id, 30)
        rows = [r for r in rows if not r.quality_flags and (now() - utc(r.measured_at)).total_seconds() <= 600]
        if len(rows) < 10 or (now() - utc(rows[0].measured_at)).total_seconds() > settings.stale_seconds:
            raise HTTPException(409, "Нужно не менее 10 корректных измерений за 10 минут и свежая связь")
        rms = float(np.median([r.acceleration_rms_g for r in rows]))
        rpm = float(np.median([r.rpm for r in rows]))
        load = float(np.median([r.load_percent for r in rows]))
        if rms <= 0 or rpm <= 0 or any(abs(r.rpm-rpm) > rpm*.1 or abs(r.load_percent-load) > 15 or r.measurement_band != rows[0].measurement_band for r in rows):
            raise HTTPException(409, "Выберите стабильный рабочий режим с одинаковой полосой, оборотами и нагрузкой")
        if any(motor.temperature_limit_c is not None and r.temperature_c >= motor.temperature_limit_c for r in rows):
            raise HTTPException(409, "База не утверждена: температура достигает заданного ограничения")
        if np.std([r.acceleration_rms_g for r in rows]) / rms > .15:
            raise HTTPException(409, "Вибрация нестабильна: повторите после проверки оборудования")
        old = baseline_for(db, installation.id)
        if old:
            old.active = False
        row = Baseline(installation_id=installation.id, temperature_c=float(np.median([r.temperature_c for r in rows])),
                       acceleration_rms_g=rms, rpm=rpm, load_percent=load, sample_count=len(rows),
                       measurement_ids=[r.id for r in rows], measurement_band=rows[0].measurement_band, approved_by=user.id)
        db.add(row)
        db.flush()
        audit(db, user, "baseline.approve", motor.id, {"baseline_id": row.id, "samples": len(rows)})
        save(db)
        return as_dict(row)


@router.get("/devices")
def devices(user=Depends(authenticate), db: DB = Depends(get_db)):
    result = []
    for device in db.scalars(select(Device).order_by(Device.created_at.desc())):
        installation = db.scalar(select(Installation).where(Installation.device_id == device.id))
        item = as_dict(device)
        item["installation"] = as_dict(installation)
        item["motor_name"] = db.get(Motor, installation.motor_id).name if installation else ""
        result.append(item)
    return result


@router.post("/devices", status_code=201)
def device_create(body: DeviceIn, user=Depends(administrator), db: DB = Depends(get_db)):
    if not settings.demo_enabled:
        raise HTTPException(403, "Демонстрационная регистрация выключена")
    motor = get_or_404(db, Motor, body.motor_id)
    if motor.archived:
        raise HTTPException(409, "Двигатель архивирован")
    if db.scalar(select(Installation).where(Installation.motor_id == motor.id)):
        raise HTTPException(409, "К двигателю уже привязан датчик")
    token = secrets.token_urlsafe(32)
    device = Device(name=body.name, serial_number=body.serial_number, token_hash=digest(token))
    db.add(device)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Серийный номер уже зарегистрирован")
    db.add(Installation(motor_id=motor.id, device_id=device.id, position=body.position, mount=body.mount))
    audit(db, user, "device.register_virtual", device.id)
    save(db)
    return as_dict(device)


@router.put("/devices/{device_id}/simulation")
def simulation(device_id: str, body: SimulationIn, user=Depends(administrator), db: DB = Depends(get_db)):
    device = get_or_404(db, Device, device_id)
    if not settings.demo_enabled or not device.virtual:
        raise HTTPException(403, "Управление доступно только виртуальным устройствам в деморежиме")
    installation = db.scalar(select(Installation).where(Installation.device_id == device.id))
    if installation and db.get(Motor, installation.motor_id).archived:
        raise HTTPException(409, "Двигатель архивирован")
    if device.scenario != body.scenario or device.simulation_enabled != body.enabled:
        device.scenario_started_at = now()
    device.simulation_enabled, device.scenario = body.enabled, body.scenario
    device.interval_seconds = body.interval_seconds
    audit(db, user, "simulation.configure", device.id, body.model_dump())
    save(db)
    return as_dict(device)


def simulator_auth(request):
    token = request.headers.get("X-Gateway-Key", "")
    if not settings.demo_enabled or not settings.simulator_key or not secrets.compare_digest(token, settings.simulator_key):
        raise HTTPException(401, "Неверный ключ симулятора")


@router.get("/simulator/devices")
def simulator_devices(request: Request, db: DB = Depends(get_db)):
    simulator_auth(request)
    result = []
    for device in db.scalars(select(Device).where(Device.virtual.is_(True))):
        installation = db.scalar(select(Installation).where(Installation.device_id == device.id))
        if not installation or db.get(Motor, installation.motor_id).archived:
            continue
        last = db.scalar(select(func.max(Measurement.sequence_number)).where(Measurement.device_id == device.id))
        result.append(dict(as_dict(device), next_sequence=0 if last is None else last+1,
                           nominal_rpm=db.get(Motor, installation.motor_id).rpm))
    return result


@router.post("/ingestion", status_code=201)
def ingestion(body: Telemetry, request: Request, response: Response, db: DB = Depends(get_db)):
    device = get_or_404(db, Device, body.device_id)
    key = request.headers.get("X-Gateway-Key", "")
    if body.source == "simulator":
        simulator_auth(request)
        if not device.virtual:
            raise HTTPException(403, "Симулятор не может отправлять данные физического устройства")
    elif device.virtual or not secrets.compare_digest(digest(key), device.token_hash):
        raise HTTPException(401, "Неверный ключ шлюза")
    with WRITE_LOCK:
        try:
            row, duplicate = ingest(db, body)
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, "Конфликт повторной доставки")
    if duplicate:
        response.status_code = 200
    return {"id": row.id, "duplicate": duplicate, "gap_count": row.gap_count}


@router.get("/alerts")
def alerts(user=Depends(authenticate), db: DB = Depends(get_db)):
    return [alert_view(db, a) for a in db.scalars(select(Alert).order_by(Alert.opened_at.desc()).limit(500))]


@router.get("/alerts/{alert_id}")
def alert_get(alert_id: str, user=Depends(authenticate), db: DB = Depends(get_db)):
    return alert_view(db, get_or_404(db, Alert, alert_id), True)


ALLOWED_TRANSITIONS = {"new": {"acknowledged"}, "acknowledged": {"investigating"},
                       "investigating": {"confirmed", "rejected"}, "confirmed": {"resolved"},
                       "rejected": {"closed"}, "resolved": {"closed"}, "closed": set()}


@router.patch("/alerts/{alert_id}")
def alert_update(alert_id: str, body: AlertUpdate, user=Depends(engineer), db: DB = Depends(get_db)):
    alert = get_or_404(db, Alert, alert_id)
    if body.status not in ALLOWED_TRANSITIONS[alert.status]:
        raise HTTPException(409, "Недопустимый переход статуса события")
    if not body.comment.strip():
        raise HTTPException(422, "Укажите комментарий или результат")
    inspection = db.scalar(select(Inspection).where(Inspection.alert_id == alert.id).order_by(Inspection.created_at.desc()).limit(1))
    if body.status in ("confirmed", "rejected") and (not inspection or inspection.confirmed != (body.status == "confirmed")):
        raise HTTPException(409, "Сначала сохраните соответствующий результат осмотра")
    if body.status == "resolved" and not db.scalar(select(MaintenanceRecord).where(MaintenanceRecord.alert_id == alert.id)):
        raise HTTPException(409, "Сначала зарегистрируйте выполненные работы")
    alert.status, alert.assignee = body.status, body.assignee.strip() or user.username
    if body.status == "closed":
        alert.result = body.comment
    db.add(AlertHistory(alert_id=alert.id, user_id=user.id, status=body.status, comment=body.comment))
    audit(db, user, "alert.transition", alert.id, body.model_dump())
    save(db)
    return alert_view(db, alert, True)


@router.post("/alerts/{alert_id}/inspections", status_code=201)
def inspection_add(alert_id: str, body: InspectionIn, user=Depends(engineer), db: DB = Depends(get_db)):
    alert = get_or_404(db, Alert, alert_id)
    if alert.status not in ("investigating", "confirmed"):
        raise HTTPException(409, "Сначала примите событие в работу и начните проверку")
    db.add(Inspection(alert_id=alert.id, user_id=user.id, findings=body.findings, confirmed=body.confirmed))
    if body.work:
        db.add(MaintenanceRecord(alert_id=alert.id, user_id=user.id, work=body.work))
    db.add(AlertHistory(alert_id=alert.id, user_id=user.id, status=alert.status, comment="Осмотр: " + body.findings))
    audit(db, user, "inspection.create", alert.id)
    save(db)
    return alert_view(db, alert, True)


@router.get("/reports/measurements.csv")
def export_csv(motor_id: str, hours: int = Query(24, ge=1, le=720), user=Depends(authenticate), db: DB = Depends(get_db)):
    get_or_404(db, Motor, motor_id)
    rows = list(db.scalars(select(Measurement).where(Measurement.motor_id == motor_id, Measurement.measured_at >= now()-timedelta(hours=hours))
                           .order_by(Measurement.measured_at).limit(100001)))
    if len(rows) > 100000:
        raise HTTPException(422, "Слишком много измерений. Сократите период")
    content = io.StringIO()
    content.write("\ufeff")  # Excel on Windows: UTF-8 BOM.
    writer = csv.writer(content, delimiter=";")
    writer.writerow(["Время UTC", "Температура °C", "RMS X g", "RMS Y g", "RMS Z g", "Общий RMS g", "Заряд %", "Источник", "Полоса Гц", "Качество"])
    for r in rows:
        writer.writerow([utc(r.measured_at).isoformat(), r.temperature_c, r.acceleration_rms_x_g, r.acceleration_rms_y_g,
                         r.acceleration_rms_z_g, r.acceleration_rms_g, r.battery_percent, r.source, json.dumps(r.measurement_band), ",".join(r.quality_flags)])
    return Response(content.getvalue(), media_type="text/csv", headers={"Content-Disposition": 'attachment; filename="mekora-measurements.csv"'})


@router.get("/users")
def users(user=Depends(administrator), db: DB = Depends(get_db)):
    return [as_dict(r) for r in db.scalars(select(User).order_by(User.username))]


@router.post("/users", status_code=201)
def user_create(body: UserIn, user=Depends(administrator), db: DB = Depends(get_db)):
    if user.role != "admin":
        raise HTTPException(403, "Пользователей создаёт администратор")
    row = User(username=body.username, password_hash=passwords.hash(body.password), role=body.role)
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Логин уже занят")
    audit(db, user, "user.create", row.id, {"role": body.role})
    save(db)
    return as_dict(row)


@router.get("/stream")
async def stream(request: Request, user=Depends(authenticate), db: DB = Depends(get_db)):
    expires_at = utc(request.state.session.expires_at)
    # Do not hold a pooled SQL connection for the lifetime of an SSE browser tab.
    db.close()
    async def events():
        while now() < expires_at:
            if await request.is_disconnected():
                break
            yield "event: update\ndata: " + json.dumps({"at": now().isoformat()}) + "\n\n"
            await asyncio.sleep(2)
        yield "event: expired\ndata: {}\n\n"
    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
