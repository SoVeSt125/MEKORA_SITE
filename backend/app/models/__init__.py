from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, Index
from app.database import Base, now, uid


class User(Base):
    __tablename__ = "users"
    id = Column(String(36), primary_key=True, default=uid)
    username = Column(String(80), unique=True, nullable=False)
    password_hash = Column(Text, nullable=False)
    role = Column(String(20), nullable=False, default="admin")
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class Session(Base):
    __tablename__ = "sessions"
    token_hash = Column(String(64), primary_key=True)
    user_id = Column(ForeignKey("users.id"), nullable=False)
    csrf = Column(String(80), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)


class Organization(Base):
    __tablename__ = "organizations"
    id = Column(String(36), primary_key=True, default=uid)
    name = Column(String(160), nullable=False)
    description = Column(Text, default="", nullable=False)


class Workshop(Base):
    __tablename__ = "workshops"
    id = Column(String(36), primary_key=True, default=uid)
    organization_id = Column(ForeignKey("organizations.id"), nullable=False)
    name = Column(String(160), nullable=False)


class Asset(Base):
    __tablename__ = "assets"
    id = Column(String(36), primary_key=True, default=uid)
    workshop_id = Column(ForeignKey("workshops.id"), nullable=False)
    name = Column(String(160), nullable=False)
    inventory_number = Column(String(80), nullable=False)
    category = Column(String(80), default="Электропривод", nullable=False)


class Motor(Base):
    __tablename__ = "motors"
    id = Column(String(36), primary_key=True, default=uid)
    asset_id = Column(ForeignKey("assets.id"), nullable=False)
    name = Column(String(160), nullable=False)
    serial_number = Column(String(100), default="", nullable=False)
    model = Column(String(100), default="", nullable=False)
    power_kw = Column(Float, nullable=False)
    rpm = Column(Integer, nullable=False)
    engineer = Column(String(120), default="", nullable=False)
    temperature_limit_c = Column(Float, nullable=True)
    archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class Device(Base):
    __tablename__ = "devices"
    id = Column(String(36), primary_key=True, default=uid)
    name = Column(String(160), nullable=False)
    serial_number = Column(String(100), unique=True, nullable=False)
    virtual = Column(Boolean, default=True, nullable=False)
    token_hash = Column(String(64), nullable=False)
    simulation_enabled = Column(Boolean, default=False, nullable=False)
    scenario = Column(String(24), default="normal", nullable=False)
    interval_seconds = Column(Float, default=2, nullable=False)
    scenario_started_at = Column(DateTime(timezone=True), default=now, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class Installation(Base):
    __tablename__ = "installations"
    id = Column(String(36), primary_key=True, default=uid)
    device_id = Column(ForeignKey("devices.id"), unique=True, nullable=False)
    motor_id = Column(ForeignKey("motors.id"), unique=True, nullable=False)
    position = Column(String(20), default="DE", nullable=False)
    mount = Column(String(20), default="Flat", nullable=False)
    installed_at = Column(DateTime(timezone=True), default=now, nullable=False)


class Measurement(Base):
    __tablename__ = "measurements"
    id = Column(String(36), primary_key=True)
    installation_id = Column(ForeignKey("installations.id"), nullable=False)
    device_id = Column(ForeignKey("devices.id"), nullable=False)
    motor_id = Column(ForeignKey("motors.id"), nullable=False)
    sequence_number = Column(Integer, nullable=False)
    measured_at = Column(DateTime(timezone=True), nullable=False)
    gateway_received_at = Column(DateTime(timezone=True), nullable=False)
    timestamp_source = Column(String(20), nullable=False)
    received_at = Column(DateTime(timezone=True), default=now, nullable=False)
    source = Column(String(20), nullable=False)
    temperature_c = Column(Float, nullable=False)
    acceleration_rms_x_g = Column(Float, nullable=False)
    acceleration_rms_y_g = Column(Float, nullable=False)
    acceleration_rms_z_g = Column(Float, nullable=False)
    acceleration_rms_g = Column(Float, nullable=False)
    vibration_peak_g = Column(Float, nullable=False)
    battery_percent = Column(Float, nullable=False)
    rssi_dbm = Column(Integer, nullable=False)
    rpm = Column(Integer, nullable=False)
    load_percent = Column(Float, nullable=False)
    sample_rate_hz = Column(Integer, nullable=False)
    sample_count = Column(Integer, nullable=False)
    measurement_band = Column(JSON, nullable=False)
    quality_flags = Column(JSON, nullable=False)
    firmware_version = Column(String(80), nullable=False)
    gap_count = Column(Integer, default=0, nullable=False)
    __table_args__ = (UniqueConstraint("device_id", "sequence_number"),
                     Index("ix_measurement_motor_time", "motor_id", "measured_at"),
                     Index("ix_measurement_device_time", "device_id", "measured_at"))


class Baseline(Base):
    __tablename__ = "diagnostic_baselines"
    id = Column(String(36), primary_key=True, default=uid)
    installation_id = Column(ForeignKey("installations.id"), nullable=False, index=True)
    temperature_c = Column(Float, nullable=False)
    acceleration_rms_g = Column(Float, nullable=False)
    rpm = Column(Float, nullable=False)
    load_percent = Column(Float, nullable=False)
    sample_count = Column(Integer, nullable=False)
    measurement_band = Column(JSON, nullable=False)
    measurement_ids = Column(JSON, nullable=False)
    approved_by = Column(ForeignKey("users.id"), nullable=False)
    approved_at = Column(DateTime(timezone=True), default=now, nullable=False)
    active = Column(Boolean, default=True, nullable=False)


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(String(36), primary_key=True, default=uid)
    motor_id = Column(ForeignKey("motors.id"), nullable=False, index=True)
    device_id = Column(ForeignKey("devices.id"), nullable=False)
    kind = Column(String(40), nullable=False)
    severity = Column(String(20), nullable=False)
    status = Column(String(20), default="new", nullable=False)
    title = Column(String(240), nullable=False)
    evidence = Column(JSON, nullable=False)
    rule_version = Column(String(40), nullable=False)
    opened_at = Column(DateTime(timezone=True), default=now, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), default=now, nullable=False)
    recovered_at = Column(DateTime(timezone=True), nullable=True)
    assignee = Column(String(120), default="", nullable=False)
    result = Column(Text, default="", nullable=False)


class AlertHistory(Base):
    __tablename__ = "alert_history"
    id = Column(String(36), primary_key=True, default=uid)
    alert_id = Column(ForeignKey("alerts.id"), nullable=False, index=True)
    user_id = Column(ForeignKey("users.id"), nullable=True)
    at = Column(DateTime(timezone=True), default=now, nullable=False)
    status = Column(String(20), nullable=False)
    comment = Column(Text, default="", nullable=False)


class Inspection(Base):
    __tablename__ = "inspections"
    id = Column(String(36), primary_key=True, default=uid)
    alert_id = Column(ForeignKey("alerts.id"), nullable=False)
    user_id = Column(ForeignKey("users.id"), nullable=False)
    findings = Column(Text, nullable=False)
    confirmed = Column(Boolean, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"
    id = Column(String(36), primary_key=True, default=uid)
    alert_id = Column(ForeignKey("alerts.id"), nullable=False)
    user_id = Column(ForeignKey("users.id"), nullable=False)
    work = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(String(36), primary_key=True, default=uid)
    user_id = Column(ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_id = Column(String(80), nullable=False)
    detail = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime(timezone=True), default=now, nullable=False)
