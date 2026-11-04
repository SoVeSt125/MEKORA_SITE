import os
from pathlib import Path
import subprocess
import sys
import tempfile
import pytest

test_root = tempfile.TemporaryDirectory(prefix="mekora-tests-")
os.environ["MEKORA_DATABASE_URL"] = os.environ.get("MEKORA_TEST_DATABASE_URL", "sqlite:///" + str(Path(test_root.name) / "test.db"))
os.environ["MEKORA_SIMULATOR_KEY"] = "test-only-" + os.urandom(20).hex()
os.environ["MEKORA_STALE_SECONDS"] = "30"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=Path(__file__).resolve().parents[1], check=True)

from fastapi.testclient import TestClient
from sqlalchemy import delete
from app.database import Base, SessionLocal
from app.models import User
from app.security import passwords
from app.main import app


@pytest.fixture
def client():
    with SessionLocal() as db:
        for table in reversed(Base.metadata.sorted_tables):
            db.execute(delete(table))
        db.add(User(username="admin", password_hash=passwords.hash("test-admin-password"), role="admin"))
        db.commit()
    with TestClient(app) as client:
        result = client.post("/api/auth/login", json={"username": "admin", "password": "test-admin-password"})
        assert result.status_code == 200
        client.headers["X-CSRF-Token"] = result.json()["csrf"]
        yield client


@pytest.fixture
def setup_motor(client):
    def create(temperature_limit=80):
        o = client.post("/api/organizations", json={"name": "Тестовое производство"}).json()
        w = client.post("/api/workshops", json={"name": "Цех №1", "organization_id": o["id"]}).json()
        a = client.post("/api/assets", json={"name": "Насос", "inventory_number": "Н-012", "workshop_id": w["id"]}).json()
        m = client.post("/api/motors", json={"name": "Двигатель №12", "asset_id": a["id"], "rpm": 1500, "power_kw": 7.5, "temperature_limit_c": temperature_limit}).json()
        d = client.post("/api/devices", json={"motor_id": m["id"], "name": "Виртуальный Core", "serial_number": "SIM-012"}).json()
        return m, d
    return create
