import math
from fastapi import HTTPException
from sqlalchemy import select, or_
from app.database import now, utc
from app.models import Measurement, Device, Motor, Installation
from app.analytics.rules import analyze


def ingest(db, payload):
    device = db.scalar(select(Device).where(Device.id == payload.device_id).with_for_update())
    if not device:
        raise HTTPException(404, "Датчик не зарегистрирован")
    duplicate = db.scalar(select(Measurement).where(or_(Measurement.id == payload.measurement_id,
                           (Measurement.device_id == payload.device_id) & (Measurement.sequence_number == payload.sequence_number))))
    data = payload.model_dump()
    if duplicate:
        equal = duplicate.id == payload.measurement_id and duplicate.device_id == payload.device_id
        mappings = {"measurement_id": "id", "device_timestamp": "measured_at"}
        for key in ("sequence_number", "device_timestamp", "gateway_received_at", "timestamp_source", "temperature_c", "acceleration_rms_x_g", "acceleration_rms_y_g", "acceleration_rms_z_g", "vibration_peak_g", "battery_percent", "rssi_dbm", "rpm", "load_percent", "sample_rate_hz", "sample_count", "firmware_version", "source", "quality_flags"):
            stored = getattr(duplicate, mappings.get(key, key))
            value = data[key]
            if hasattr(stored, "tzinfo"):
                stored, value = utc(stored), utc(value)
            equal = equal and stored == value
        equal = equal and list(duplicate.measurement_band) == list(payload.measurement_band)
        if not equal:
            raise HTTPException(409, "ID или sequence уже использован для другого измерения")
        return duplicate, True
    current = now()
    if (utc(payload.device_timestamp) - current).total_seconds() > 5 or (utc(payload.gateway_received_at) - current).total_seconds() > 5:
        raise HTTPException(422, "Временная метка находится в будущем")
    if payload.device_timestamp > payload.gateway_received_at:
        raise HTTPException(422, "Время шлюза предшествует времени измерения")
    installation = db.scalar(select(Installation).where(Installation.device_id == device.id))
    if not installation:
        raise HTTPException(409, "Нет установки датчика")
    motor = db.get(Motor, installation.motor_id)
    if motor.archived:
        raise HTTPException(409, "Двигатель архивирован")
    if utc(payload.device_timestamp) < utc(installation.installed_at):
        raise HTTPException(422, "Измерение предшествует установке датчика")
    previous = db.scalar(select(Measurement).where(Measurement.device_id == device.id).order_by(Measurement.sequence_number.desc()).limit(1))
    gap = max(0, payload.sequence_number - previous.sequence_number - 1) if previous else 0
    row = Measurement(id=payload.measurement_id, installation_id=installation.id, device_id=device.id, motor_id=motor.id,
                      sequence_number=payload.sequence_number, measured_at=payload.device_timestamp, source=payload.source,
                      gateway_received_at=payload.gateway_received_at, timestamp_source=payload.timestamp_source,
                      temperature_c=payload.temperature_c, acceleration_rms_x_g=payload.acceleration_rms_x_g,
                      acceleration_rms_y_g=payload.acceleration_rms_y_g, acceleration_rms_z_g=payload.acceleration_rms_z_g,
                      acceleration_rms_g=math.sqrt(sum(v*v for v in (payload.acceleration_rms_x_g, payload.acceleration_rms_y_g, payload.acceleration_rms_z_g))),
                      vibration_peak_g=payload.vibration_peak_g, battery_percent=payload.battery_percent,
                      rssi_dbm=payload.rssi_dbm, rpm=payload.rpm, load_percent=payload.load_percent,
                      sample_rate_hz=payload.sample_rate_hz, sample_count=payload.sample_count,
                      measurement_band=list(payload.measurement_band), quality_flags=payload.quality_flags,
                      firmware_version=payload.firmware_version, gap_count=gap)
    db.add(row)
    db.flush()
    # Delayed/reordered telemetry is historical only; never triggers current alerts.
    if (not previous or payload.sequence_number > previous.sequence_number) and (not previous or utc(payload.device_timestamp) > utc(previous.measured_at)):
        analyze(db, motor, device, installation)
    db.commit()
    return row, False
