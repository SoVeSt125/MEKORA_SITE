from sqlalchemy import select, func
from app.database import now, utc
from app.config import settings
from app.models import Organization, Workshop, Asset, Motor, Device, Installation, Measurement, Alert, AlertHistory, Baseline, Inspection, MaintenanceRecord, AuditLog
from app.analytics.rules import latest, baseline_for, compatible, explanation


def as_dict(row):
    if row is None:
        return None
    result = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name)
        if column.name in ("password_hash", "token_hash"):
            continue
        result[column.name] = utc(value).isoformat() if hasattr(value, "tzinfo") else value
    return result


def audit(db, user, action, entity_id, detail=None):
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity_id=entity_id, detail=detail or {}))


def motor_view(db, motor):
    result = as_dict(motor)
    asset = db.get(Asset, motor.asset_id)
    workshop = db.get(Workshop, asset.workshop_id)
    organization = db.get(Organization, workshop.organization_id)
    installation = db.scalar(select(Installation).where(Installation.motor_id == motor.id))
    device = db.get(Device, installation.device_id) if installation else None
    rows = latest(db, motor.id)
    last = rows[0] if rows else None
    baseline = baseline_for(db, installation.id) if installation else None
    alerts = list(db.scalars(select(Alert).where(Alert.motor_id == motor.id, Alert.recovered_at.is_(None))))
    if not device or not last:
        status = "insufficient"
        if device and device.simulation_enabled and (now() - utc(device.scenario_started_at)).total_seconds() > settings.stale_seconds:
            status = "offline"
    elif (now() - utc(last.measured_at)).total_seconds() > settings.stale_seconds:
        status = "offline"
    elif last.quality_flags:
        status = "quality"
    elif any(a.kind != "connection" for a in alerts):
        status = "critical" if any(a.severity == "critical" for a in alerts) else "warning"
    elif baseline is None:
        status = "insufficient"
    elif not compatible(last, baseline):
        status = "mode_changed"
    else:
        status = "normal"
    result.update(asset=as_dict(asset), workshop=as_dict(workshop), organization=as_dict(organization),
                  installation=as_dict(installation), device=as_dict(device), latest=as_dict(last), baseline=as_dict(baseline), status=status)
    return result


def alert_view(db, alert, detailed=False):
    result = as_dict(alert)
    result["motor_name"] = db.get(Motor, alert.motor_id).name
    result["analysis"] = explanation(alert)
    if detailed:
        result["history"] = [as_dict(r) for r in db.scalars(select(AlertHistory).where(AlertHistory.alert_id == alert.id).order_by(AlertHistory.at))]
        result["inspections"] = [as_dict(r) for r in db.scalars(select(Inspection).where(Inspection.alert_id == alert.id).order_by(Inspection.created_at))]
        result["maintenance"] = [as_dict(r) for r in db.scalars(select(MaintenanceRecord).where(MaintenanceRecord.alert_id == alert.id).order_by(MaintenanceRecord.created_at))]
    return result
