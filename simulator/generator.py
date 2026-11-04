"""Deterministic, explicitly synthetic signals; no claim of real fault accuracy."""
from datetime import datetime, timezone
from uuid import uuid4
import numpy as np
from backend.app.analytics.signals import features


SCENARIOS = ("normal", "vibration", "temperature", "load", "impulse", "offline", "battery")


class SimulatorAdapter:
    def read(self, device, sequence, elapsed):
        return packet(device, sequence, elapsed)


def packet(device, sequence, elapsed, rng=None):
    rng = rng if rng is not None else np.random.default_rng()
    scenario = device["scenario"]
    if scenario == "offline":
        return None
    timestamp = datetime.now(timezone.utc).isoformat()
    rpm = device["nominal_rpm"] * (1.3 if scenario == "load" else 1)
    scale = 1 + min(3, elapsed / 8) if scenario == "vibration" else 1
    if scenario == "load":
        scale = 1.7
    if scenario == "impulse" and elapsed < device["interval_seconds"] * 1.5:
        scale = 4
    rate, count = 2048, 2048
    t = np.arange(count) / rate
    axes = []
    peaks = []
    for amplitude, phase in ((.04, 0), (.035, .5), (.025, 1)):
        signal = amplitude * scale * np.sin(2 * np.pi * max(20, rpm/60) * t + phase)
        signal += rng.normal(0, .0008, count)
        stats = features(signal, rate, (10, 500))
        axes.append(round(stats["acceleration_rms_g"], 6))
        peaks.append(stats["peak_g"])
    temperature = 48 + rng.normal(0, .25) + (min(50, elapsed * 2) if scenario == "temperature" else 0)
    return {"schema_version": "1.0", "message_type": "vibration_features", "device_id": device["id"],
            "sequence_number": sequence, "measurement_id": str(uuid4()), "device_timestamp": timestamp,
            "gateway_received_at": timestamp, "timestamp_source": "device", "temperature_c": round(temperature, 2),
            "acceleration_rms_x_g": axes[0], "acceleration_rms_y_g": axes[1], "acceleration_rms_z_g": axes[2],
            "vibration_peak_g": round(max(peaks), 6), "battery_percent": round(max(0, (12 if scenario == "battery" else 98) - sequence * .0001), 2),
            "rssi_dbm": -52, "rpm": round(rpm), "load_percent": 85 if scenario == "load" else 60,
            "sample_rate_hz": rate, "sample_count": count, "measurement_band": [10, 500],
            "firmware_version": "simulator-0.1.0", "quality_flags": [], "source": "simulator"}
