from copy import deepcopy
from datetime import timedelta
import os
import numpy as np
import pytest
from sqlalchemy import select, func
from app.database import now, SessionLocal
from app.models import Device, Measurement, Installation, Motor, User
from app.main import check_connections
from app.security import passwords
from simulator.generator import packet


def telemetry(device, sequence=0, scale=1, temperature=48, **overrides):
    result = packet(dict(device, scenario="normal", nominal_rpm=1500, interval_seconds=2), sequence, 0, np.random.default_rng(sequence))
    for field in ("acceleration_rms_x_g", "acceleration_rms_y_g", "acceleration_rms_z_g", "vibration_peak_g"):
        result[field] *= scale
    result["temperature_c"] = temperature
    result.update(overrides)
    return result


def ingest(client, payload):
    return client.post("/api/ingestion", json=payload, headers={"X-Gateway-Key": os.environ["MEKORA_SIMULATOR_KEY"]})


def approve(client, motor, device):
    for sequence in range(10):
        assert ingest(client, telemetry(device, sequence)).status_code == 201
    assert client.get('/api/motors/' + motor['id']).json()['status'] == 'insufficient'
    response = client.post('/api/motors/' + motor['id'] + '/baseline', json={})
    assert response.status_code == 200, response.text


def test_simulator_ingestion_baseline_alert_repair_history_and_hysteresis(client, setup_motor):
    motor, device = setup_motor()
    approve(client, motor, device)
    assert client.get('/api/motors/' + motor['id']).json()['status'] == 'normal'
    for n in range(10,12):
        assert ingest(client, telemetry(device, n, scale=3)).status_code == 201
        assert client.get('/api/alerts').json() == []
    assert ingest(client, telemetry(device, 12, scale=3)).status_code == 201
    alert = client.get('/api/alerts').json()[0]
    assert alert['analysis']['demonstration']
    assert alert['kind'] == 'vibration_baseline'
    assert len(alert['analysis']['measurement_ids']) == 3
    assert alert['analysis']['hypothesis'] == 'Причина не установлена'
    for n in range(13,16):
        ingest(client, telemetry(device, n, scale=3))
    assert len(client.get('/api/alerts').json()) == 1
    path = '/api/alerts/' + alert['id']
    assert client.patch(path, json={"status":"closed", "comment":"Проверено"}).status_code == 409
    for status in ['acknowledged', 'investigating']:
        assert client.patch(path, json={"status":status, "comment":"Инженер принял событие"}).status_code == 200
    assert client.patch(path, json={"status":"confirmed", "comment":"Да"}).status_code == 409
    assert client.post(path + '/inspections', json={"findings":"Проверено крепление на стенде", "confirmed":True, "work":"Выполнена контрольная затяжка"}).status_code == 201
    for status in ['confirmed','resolved','closed']:
        assert client.patch(path, json={"status":status, "comment":"Результат осмотра и работ записан"}).status_code == 200
    assert ingest(client, telemetry(device, 16, scale=3)).status_code == 201
    assert len(client.get('/api/alerts').json()) == 1  # A human close is not a reset of the episode.
    for n in range(17,20):
        ingest(client, telemetry(device, n, scale=1.7))
    assert not client.get(path).json()['recovered_at']  # Hysteresis band.
    for n in range(20,23):
        ingest(client, telemetry(device, n))
    detail = client.get(path).json()
    assert detail['recovered_at']
    assert detail['result']
    assert detail['inspections'] and detail['maintenance']
    assert [h['status'] for h in detail['history']] == ['new', 'acknowledged', 'investigating', 'investigating', 'confirmed', 'resolved', 'closed', 'closed']
    for n in range(23,26):
        ingest(client, telemetry(device, n, scale=3))
    assert len(client.get('/api/alerts').json()) == 2


def test_duplicates_conflicts_gap_invalid_future_and_units(client, setup_motor):
    motor, device = setup_motor()
    p = telemetry(device)
    assert ingest(client, p).status_code == 201
    assert ingest(client, p).json()['duplicate'] is True
    assert client.get('/api/motors/' + motor['id'] + '/measurements').json()['items'][0]['acceleration_rms_g'] == pytest.approx(np.linalg.norm([p['acceleration_rms_x_g'], p['acceleration_rms_y_g'], p['acceleration_rms_z_g']]))
    altered = dict(p, temperature_c=70)
    assert ingest(client, altered).status_code == 409
    altered = dict(p, measurement_id='different-id')
    assert ingest(client, altered).status_code == 409
    assert ingest(client, telemetry(device, 3)).json()['gap_count'] == 2
    for overrides in [{"temperature_c":300}, {"battery_percent":-1}, {"measurement_band":[10,2000]}, {"vibration_peak_g":.0001}, {"schema_version":"2.0"}, {"device_timestamp":(now()+timedelta(minutes=5)).isoformat()}, {"acceleration_rms_x_g": "NaN"}]:
        assert ingest(client, telemetry(device, 4, **overrides)).status_code == 422
    assert len(client.get('/api/motors/' + motor['id'] + '/measurements').json()['items']) == 2


def test_stale_quality_and_changed_mode_do_not_trigger_relative_diagnosis(client, setup_motor):
    motor, device = setup_motor()
    approve(client, motor, device)
    for n in range(10,13):
        ingest(client, telemetry(device, n, scale=3, rpm=2200, load_percent=95))
    assert client.get('/api/motors/' + motor['id']).json()['status'] == 'mode_changed'
    assert client.get('/api/alerts').json() == []
    for n in range(13,16):
        ingest(client, telemetry(device, n, scale=3, quality_flags=['clipped']))
    assert client.get('/api/motors/' + motor['id']).json()['status'] == 'quality'
    assert client.get('/api/alerts').json() == []
    with SessionLocal() as db:
        for r in db.scalars(select(Measurement)):
            r.measured_at = now()-timedelta(minutes=5)
        db.commit()
    check_connections()
    assert client.get('/api/motors/' + motor['id']).json()['status'] == 'offline'
    assert [a['kind'] for a in client.get('/api/alerts').json()] == ['connection']
    check_connections()
    assert len(client.get('/api/alerts').json()) == 1
    ingest(client, telemetry(device,16))
    check_connections()
    assert client.get('/api/alerts').json()[0]['recovered_at']


def test_temperature_requires_configured_limit_and_three_samples(client, setup_motor):
    motor, device = setup_motor(75)
    for n in range(3):
        ingest(client,telemetry(device,n,temperature=76))
    alert = client.get('/api/alerts').json()[0]
    assert alert['kind'] == 'temperature_limit' and alert['severity'] == 'critical'
    for n in range(3,6):
        ingest(client,telemetry(device,n,temperature=73))
    assert client.get('/api/alerts').json()[0]['recovered_at'] is None
    for n in range(6,9):
        ingest(client,telemetry(device,n,temperature=69))
    assert client.get('/api/alerts').json()[0]['recovered_at']


def test_registration_archive_preserves_history_and_csv(client, setup_motor):
    motor, device = setup_motor()
    assert client.post('/api/devices', json={'motor_id':motor['id'],'name':'Другой','serial_number':'SIM-013'}).status_code == 409
    ingest(client,telemetry(device))
    csv = client.get('/api/reports/measurements.csv',params={'motor_id':motor['id']})
    assert csv.status_code == 200 and 'Температура °C' in csv.text and 'simulator' in csv.text
    assert client.post('/api/motors/' + motor['id'] + '/archive',json={}).json()['archived']
    assert ingest(client,telemetry(device,1)).status_code == 409
    assert len(client.get('/api/motors/' + motor['id'] + '/measurements').json()['items']) == 1
    assert client.get('/api/motors').json() == []
    assert len(client.get('/api/motors?archived=true').json()) == 1


def test_auth_csrf_roles_gateway_isolation(client, setup_motor):
    motor, device = setup_motor()
    assert client.post('/api/organizations', json={'name':'test'},headers={'X-CSRF-Token':''}).status_code == 403
    assert client.post('/api/organizations', json={'name':'test'},headers={'Origin':'https://evil.invalid'}).status_code == 403
    assert client.post('/api/ingestion',json=telemetry(device)).status_code == 401
    assert client.get('/api/simulator/devices').status_code == 401
    assert client.post('/api/users',json={'username':'viewer','password':'viewer-test-password','role':'viewer'}).status_code == 201
    result = client.post('/api/auth/login',json={'username':'viewer','password':'viewer-test-password'}).json()
    client.headers['X-CSRF-Token'] = result['csrf']
    assert client.get('/api/motors').status_code == 200
    assert client.post('/api/devices',json={'motor_id':motor['id'],'name':'test','serial_number':'test'}).status_code == 403
    assert client.post('/api/motors/' + motor['id'] + '/baseline',json={}).status_code == 403
    assert client.get('/api/users').status_code == 403
    assert client.post('/api/auth/logout',json={}).status_code == 200
    assert client.get('/api/motors').status_code == 401


def test_baseline_requires_enough_good_stable_data(client, setup_motor):
    motor, device = setup_motor()
    assert client.post('/api/motors/' + motor['id'] + '/baseline',json={}).status_code == 409
    for n in range(10):
        ingest(client,telemetry(device,n,scale=(3 if n%2 else 1)))
    assert client.post('/api/motors/' + motor['id'] + '/baseline',json={}).status_code == 409
    assert client.get('/api/alerts').json() == []


def test_delayed_packets_saved_without_current_alert(client, setup_motor):
    motor, device = setup_motor()
    with SessionLocal() as db:
        installation = db.scalar(select(Installation).where(Installation.device_id == device['id']))
        installation.installed_at = now()-timedelta(hours=1)
        db.commit()
    old = (now()-timedelta(minutes=10)).isoformat()
    for n in range(3):
        assert ingest(client,telemetry(device,n,temperature=100,device_timestamp=old,gateway_received_at=old)).status_code == 201
    assert client.get('/api/alerts').json() == []
    assert client.get('/api/motors/' + motor['id']).json()['status'] == 'offline'


def test_restart_preserves_measurements_and_session(client, setup_motor):
    motor, device = setup_motor()
    ingest(client,telemetry(device))
    from app.database import engine
    engine.dispose()
    assert client.get('/api/auth/me').status_code == 200
    assert client.get('/api/motors/' + motor['id'] + '/measurements').json()['items'][0]['device_id'] == device['id']
