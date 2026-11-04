from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, AwareDatetime, model_validator

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Login(Strict):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=256)


class OrganizationIn(Strict):
    name: Name
    description: Note = ""


class WorkshopIn(Strict):
    organization_id: str
    name: Name


class AssetIn(Strict):
    workshop_id: str
    name: Name
    inventory_number: Name = Field(max_length=80)
    category: Name = Field(default="Электропривод", max_length=80)


class MotorIn(Strict):
    asset_id: str
    name: Name
    serial_number: str = Field(default="", max_length=100)
    model: str = Field(default="", max_length=100)
    power_kw: float = Field(gt=0, le=100000)
    rpm: int = Field(gt=0, le=100000)
    engineer: str = Field(default="", max_length=120)
    temperature_limit_c: float | None = Field(default=None, ge=-50, le=200)


class DeviceIn(Strict):
    motor_id: str
    name: Name
    serial_number: Name = Field(max_length=100)
    position: Literal["DE", "NDE", "other"] = "DE"
    mount: Literal["Flat", "Fin", "other"] = "Flat"


class SimulationIn(Strict):
    enabled: bool
    scenario: Literal["normal", "vibration", "temperature", "load", "impulse", "offline", "battery"]
    interval_seconds: float = Field(default=2, ge=0.5, le=60)


class Telemetry(Strict):
    schema_version: Literal["1.0"]
    message_type: Literal["vibration_features"] = "vibration_features"
    device_id: str
    sequence_number: int = Field(ge=0, le=9_000_000_000_000_000)
    measurement_id: str = Field(pattern=r"^[a-zA-Z0-9-]{1,36}$")
    device_timestamp: AwareDatetime
    gateway_received_at: AwareDatetime
    timestamp_source: Literal["device", "gateway"] = "device"
    temperature_c: float = Field(ge=-50, le=200)
    acceleration_rms_x_g: float = Field(ge=0, le=16)
    acceleration_rms_y_g: float = Field(ge=0, le=16)
    acceleration_rms_z_g: float = Field(ge=0, le=16)
    vibration_peak_g: float = Field(ge=0, le=32)
    battery_percent: float = Field(ge=0, le=100)
    rssi_dbm: int = Field(ge=-140, le=0)
    rpm: int = Field(ge=0, le=100000)
    load_percent: float = Field(ge=0, le=150)
    sample_rate_hz: int = Field(ge=100, le=100000)
    sample_count: int = Field(ge=64, le=1_000_000)
    measurement_band: tuple[float, float]
    firmware_version: str = Field(min_length=1, max_length=80)
    quality_flags: list[Literal["clipped", "sensor_error", "timing_error"]] = Field(default_factory=list, max_length=3)
    source: Literal["simulator", "gateway"]

    @model_validator(mode="after")
    def physics(self):
        low, high = self.measurement_band
        if not (0 < low < high <= self.sample_rate_hz / 2):
            raise ValueError("Полоса должна лежать между 0 и частотой Найквиста")
        if self.vibration_peak_g < max(self.acceleration_rms_x_g, self.acceleration_rms_y_g, self.acceleration_rms_z_g):
            raise ValueError("Пиковое ускорение меньше RMS")
        return self


class AlertUpdate(Strict):
    status: Literal["acknowledged", "investigating", "confirmed", "rejected", "resolved", "closed"]
    assignee: str = Field(default="", max_length=120)
    comment: Note


class InspectionIn(Strict):
    findings: Note = Field(min_length=1)
    confirmed: bool
    work: Note = ""


class UserIn(Strict):
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,80}$")
    password: str = Field(min_length=12, max_length=256)
    role: Literal["admin", "chief", "engineer", "viewer"]
