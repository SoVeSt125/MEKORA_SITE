"""Signal features. Acceleration input is g; velocity uses m/s² and frequency integration."""
import numpy as np
from scipy.signal import butter, sosfiltfilt


def features(samples, sample_rate_hz, band=(10, 500)):
    signal = np.asarray(samples, dtype=float)
    low, high = band
    if signal.ndim != 1 or len(signal) < 64 or not np.isfinite(signal).all():
        raise ValueError("Нужен конечный одномерный сигнал минимум из 64 отсчётов")
    if not 0 < low < high < sample_rate_hz / 2:
        raise ValueError("Некорректная полоса")
    centered = signal - np.mean(signal)
    filtered = sosfiltfilt(butter(4, [low, high], btype="bandpass", fs=sample_rate_hz, output="sos"), centered)
    frequency = np.fft.rfftfreq(len(signal), 1 / sample_rate_hz)
    transform = np.fft.rfft(centered)
    # Integrate only within the stated band, never divide the DC bin.
    velocity = np.zeros_like(transform)
    mask = (frequency >= low) & (frequency <= high)
    velocity[mask] = transform[mask] * 9.80665 / (2j * np.pi * frequency[mask])
    velocity_time_mm_s = np.fft.irfft(velocity, n=len(signal)) * 1000
    window = np.hanning(len(signal))
    amplitude = 2 * np.abs(np.fft.rfft(centered * window)) / window.sum()
    return {
        "acceleration_rms_g": float(np.sqrt(np.mean(filtered ** 2))),
        "velocity_rms_mm_s": float(np.sqrt(np.mean(velocity_time_mm_s ** 2))),
        "peak_g": float(np.max(np.abs(filtered))),
        "frequencies_hz": frequency.tolist(), "amplitude_g": amplitude.tolist(),
        "window": "hann", "sample_count": len(signal), "sample_rate_hz": sample_rate_hz,
        "resolution_hz": sample_rate_hz / len(signal), "band_hz": list(band),
    }
