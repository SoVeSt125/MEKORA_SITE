from datetime import timedelta
from threading import RLock
from sqlalchemy import select
from app.config import settings
from app.database import now, utc
from app.models import Alert, AlertHistory, Baseline, Measurement

VERSION = "rules-1.0.0"
WRITE_LOCK = RLock()  # SQLite profile and one backend worker; PostgreSQL additionally locks device rows.


def latest(db, motor_id, count=1):
    return list(db.scalars(select(Measurement).where(Measurement.motor_id == motor_id)
                          .order_by(Measurement.measured_at.desc(), Measurement.sequence_number.desc()).limit(count)))


def baseline_for(db, installation_id):
    return db.scalar(select(Baseline).where(Baseline.installation_id == installation_id, Baseline.active.is_(True)))


def compatible(measurement, baseline):
    return (abs(measurement.rpm - baseline.rpm) <= max(1, baseline.rpm * .1)
            and abs(measurement.load_percent - baseline.load_percent) <= 15
            and list(measurement.measurement_band) == list(baseline.measurement_band))


def current_alert(db, motor_id, kind):
    return db.scalar(select(Alert).where(Alert.motor_id == motor_id, Alert.kind == kind)
                     .order_by(Alert.opened_at.desc()).limit(1))


def transition_condition(db, motor, device, kind, hit, recovered, severity, title, evidence):
    alert = current_alert(db, motor.id, kind)
    if hit:
        if alert and alert.recovered_at is None:
            alert.last_seen_at = now()  # Closed by a human still suppresses the same continuing episode.
            return
        alert = Alert(motor_id=motor.id, device_id=device.id, kind=kind, severity=severity,
                      title=title, evidence=evidence, rule_version=VERSION)
        db.add(alert)
        db.flush()
        db.add(AlertHistory(alert_id=alert.id, status="new", comment="Условие подтверждено правилом " + VERSION))
    elif recovered and alert and alert.recovered_at is None:
        alert.recovered_at = now()
        db.add(AlertHistory(alert_id=alert.id, status=alert.status,
                            comment="Параметр вернулся в зону восстановления. Требуется результат проверки инженера."))


def analyze(db, motor, device, installation):
    rows = latest(db, motor.id, 3)
    if not rows:
        return
    latest_row = rows[0]
    recent = [r for r in rows if not r.quality_flags and (now() - utc(r.measured_at)).total_seconds() <= settings.stale_seconds]
    if len(recent) < 3:
        return
    # All three must be consecutive, valid, fresh and belong to the same installation.
    if len({r.installation_id for r in recent}) != 1:
        return
    evidence = {"measurement_ids": [r.id for r in reversed(recent)],
                "source": latest_row.source, "temperature_c": latest_row.temperature_c,
                "acceleration_rms_g": latest_row.acceleration_rms_g,
                "band_hz": latest_row.measurement_band, "confirmed_samples": 3}
    if motor.temperature_limit_c is not None:
        transition_condition(db, motor, device, "temperature_limit",
                             all(r.temperature_c >= motor.temperature_limit_c for r in recent),
                             all(r.temperature_c <= motor.temperature_limit_c - 5 for r in recent),
                             "critical", "Подтверждено превышение заданного температурного ограничения",
                             dict(evidence, limit_c=motor.temperature_limit_c, recovery_c=motor.temperature_limit_c - 5))
    baseline = baseline_for(db, installation.id)
    if baseline and all(compatible(r, baseline) for r in recent):
        transition_condition(db, motor, device, "vibration_baseline",
                             all(r.acceleration_rms_g >= baseline.acceleration_rms_g * 2 for r in recent),
                             all(r.acceleration_rms_g <= baseline.acceleration_rms_g * 1.5 for r in recent),
                             "warning", "Устойчивый рост вибрации относительно утверждённой базы",
                             dict(evidence, baseline_id=baseline.id, baseline_g=baseline.acceleration_rms_g,
                                  ratio=latest_row.acceleration_rms_g / baseline.acceleration_rms_g,
                                  threshold_ratio=2, recovery_ratio=1.5))
    transition_condition(db, motor, device, "battery",
                         all(r.battery_percent <= 15 for r in recent), all(r.battery_percent >= 20 for r in recent),
                         "warning", "Низкий заряд батареи датчика", dict(evidence, battery_percent=latest_row.battery_percent))


def connection_check(db, motor, device):
    rows = latest(db, motor.id)
    if not rows:
        if not device.simulation_enabled:
            return
        timestamp = device.scenario_started_at
    else:
        timestamp = rows[0].measured_at
    lost = now() - utc(timestamp) > timedelta(seconds=settings.stale_seconds)
    transition_condition(db, motor, device, "connection", lost, not lost, "warning", "Нет свежих измерений от датчика",
                         {"last_measurement_at": utc(timestamp).isoformat(), "timeout_seconds": settings.stale_seconds,
                          "source": "simulator" if device.virtual else "gateway"})


def explanation(alert):
    e = alert.evidence
    if alert.kind == "vibration_baseline":
        fact = f"Вибрация {e['acceleration_rms_g']:.3f} g; база {e['baseline_g']:.3f} g. Рост в {e['ratio']:.2f} раза подтверждён тремя измерениями."
        reason = "RMS не ниже 2× утверждённой базы при сопоставимых оборотах, нагрузке и полосе измерения."
        checks = ["Сравнить нагрузку и режим работы", "Проверить крепление датчика и агрегата", "Провести контрольную вибродиагностику и осмотр подшипников"]
    elif alert.kind == "temperature_limit":
        fact = f"Температура {e['temperature_c']:.1f} °C; заданное ограничение {e['limit_c']:.1f} °C."
        reason = "Три последовательных свежих измерения достигли ограничения, указанного инженером для этого двигателя."
        checks = ["Проверить охлаждение и нагрузку", "Проверить температурный контакт", "Сопоставить с инструкцией производителя"]
    elif alert.kind == "battery":
        fact, reason = f"Заряд {e['battery_percent']:.0f}%.", "Три измерения с зарядом не выше 15%."
        checks = ["Проверить питание и запланировать замену батареи"]
    else:
        fact, reason = "Свежие измерения не поступают.", f"Данные старше {e['timeout_seconds']} секунд."
        checks = ["Проверить датчик, шлюз и сеть", "Для виртуального устройства проверить отдельный процесс симулятора"]
    return {"fact": fact, "reason": reason, "hypothesis": "Причина не установлена",
            "limitations": "Общие показатели не определяют конкретный дефект. Требуются осмотр и дополнительные измерения. Вероятность и срок отказа не рассчитываются.",
            "consequence": "Если отклонение связано с неисправностью, эксплуатация без проверки может увеличить риск повреждения оборудования.",
            "checks": checks, "algorithm_version": alert.rule_version,
            "measurement_ids": e.get("measurement_ids", []), "demonstration": e.get("source") == "simulator"}
