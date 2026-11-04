import numpy as np
import pytest
from app.analytics.signals import features


def test_known_sine_rms_fft_and_physical_velocity():
    rate = 4096
    t = np.arange(rate*2)/rate
    amplitude, frequency = .2, 64
    signal = amplitude*np.sin(2*np.pi*frequency*t) + 3  # DC must not be integrated.
    result = features(signal, rate, (10,500))
    assert result['acceleration_rms_g'] == pytest.approx(amplitude/np.sqrt(2),rel=.015)
    peak_index = np.argmax(result['amplitude_g'])
    assert result['frequencies_hz'][peak_index] == frequency
    assert result['amplitude_g'][peak_index] == pytest.approx(amplitude,rel=.002)
    expected_mm_s = amplitude*9.80665/(2*np.pi*frequency*np.sqrt(2))*1000
    assert result['velocity_rms_mm_s'] == pytest.approx(expected_mm_s,rel=.002)
    assert result['resolution_hz'] == .5
    assert result['window'] == 'hann'


def test_band_excludes_slow_acceleration_and_rejects_invalid_signal():
    t = np.arange(4096)/2048
    result = features(np.sin(2*np.pi*2*t),2048,(10,500))
    assert result['velocity_rms_mm_s'] < .001
    with pytest.raises(ValueError):
        features([float('nan')]*100,2048)
    with pytest.raises(ValueError):
        features(np.zeros(100),100,(10,500))
