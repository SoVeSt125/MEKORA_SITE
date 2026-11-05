"""Exercise actual servers from an unrelated directory, not the repository root."""
from contextlib import contextmanager
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def ready(url, process):
    for _ in range(120):
        assert process.poll() is None, "Launcher exited before readiness"
        try:
            result = httpx.get(url, timeout=1)
            if result.status_code == 200:
                return result
        except httpx.HTTPError:
            pass
        time.sleep(.25)
    pytest.fail("Server never became ready")


@contextmanager
def running(command, cwd, log, environment=None):
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    with log.open("w", encoding="utf-8") as output:
        process = subprocess.Popen(command, cwd=cwd, env=environment or {**os.environ, "PYTHONUTF8": "1"}, stdout=output, stderr=subprocess.STDOUT, **options)
        try:
            yield process
        finally:
            if process.poll() is None:
                process.send_signal(signal.CTRL_BREAK_EVENT if os.name == "nt" else signal.SIGINT)
                try:
                    process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    if os.name == "nt":
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
                    else:
                        os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=5)


@pytest.fixture
def site(tmp_path):
    root = tmp_path / "MEKORA сайт с пробелами"
    (root / "scripts").mkdir(parents=True)
    for name in ("index.html", "styles.css", "app.js", "start-site.cmd"):
        shutil.copy2(ROOT / name, root / name)
    shutil.copy2(ROOT / "scripts/serve_site.py", root / "scripts/serve_site.py")
    shutil.copytree(ROOT / "assets", root / "assets")
    (root / ".env").write_text("PRIVATE_CONFIG=must-not-be-served")
    (root / "backend").mkdir()
    (root / "backend/private.txt").write_text("must-not-be-served")
    caller = tmp_path / "unrelated directory"
    caller.mkdir()
    (caller / "wrong.txt").write_text("Wrong working directory")
    port = free_port()
    url = f"http://127.0.0.1:{port}"
    with running([sys.executable, str(root / "scripts/serve_site.py"), "--port", str(port), "--no-browser"], caller, tmp_path / "site.log") as process:
        ready(url, process)
        yield root, caller, port, url


def test_site_from_other_directory_serves_website_not_directory_listing(site):
    root, _, _, url = site
    response = httpx.get(url)
    assert "MEKORA / Замечает до поломки" in response.text
    assert response.text == (root / "index.html").read_text(encoding="utf-8")
    for path in ("/styles.css", "/app.js", "/assets/css/style.css"):
        assert httpx.get(url + path).status_code == 200
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["/.env", "/backend/private.txt", "/assets/", "/wrong.txt", "/.git/config", "/assets/%2e%2e/.env"])
def test_site_never_exposes_private_files_or_directory_listings(site, path):
    assert httpx.get(site[3] + path).status_code == 404


def test_busy_port_gives_actionable_error_without_stopping_existing_server(site):
    root, caller, port, url = site
    result = subprocess.run([sys.executable, str(root / "scripts/serve_site.py"), "--port", str(port), "--no-browser"], cwd=caller, capture_output=True, encoding="utf-8", env={**os.environ, "PYTHONUTF8": "1"}, timeout=10)
    assert result.returncode == 1
    assert "уже занят" in result.stdout and "Ctrl+C" in result.stdout
    assert httpx.get(url).status_code == 200


def test_monitor_port_conflict_does_not_touch_database_or_other_listener(site, tmp_path):
    _, caller, port, url = site
    database = tmp_path / "must-not-be-created.db"
    result = subprocess.run([sys.executable, str(ROOT / "scripts/run_local.py"), "--port", str(port), "--no-browser"], cwd=caller,
                            env={**os.environ, "PYTHONUTF8": "1", "MEKORA_DATABASE_URL": "sqlite:///" + database.as_posix()},
                            capture_output=True, encoding="utf-8", timeout=15)
    assert result.returncode == 1 and "уже занят" in result.stdout
    assert not database.exists()
    assert httpx.get(url).status_code == 200


def test_monitor_and_site_coexist_and_restart_preserves_data(site, tmp_path):
    _, caller, _, site_url = site
    frontend_port, api_port = free_port(), free_port()
    url = f"http://127.0.0.1:{frontend_port}"
    environment = {**os.environ, "PYTHONUTF8": "1", "MEKORA_DATABASE_URL": "sqlite:///" + (tmp_path / "monitor.db").as_posix(),
                   "MEKORA_ADMIN_PASSWORD": secrets.token_urlsafe(20), "MEKORA_SIMULATOR_KEY": secrets.token_urlsafe(32),
                   "MEKORA_SIMULATOR_OUTBOX": str(tmp_path / "outbox.db")}
    command = [sys.executable, str(ROOT / "scripts/run_local.py"), "--port", str(frontend_port), "--api-port", str(api_port), "--no-browser"]
    motor_id = None
    for iteration in range(2):
        with running(command, caller, tmp_path / f"monitor-{iteration}.log", environment) as process:
            assert ready(url + "/api/health", process).json()["status"] == "ok"
            assert httpx.get(site_url).status_code == 200
            with httpx.Client(base_url=url, headers={"Origin": url}, timeout=15) as client:
                login = client.post("/api/auth/login", json={"username": "admin", "password": environment["MEKORA_ADMIN_PASSWORD"]})
                assert login.status_code == 200
                client.headers["X-CSRF-Token"] = login.json()["csrf"]
                if iteration == 0:
                    organization = client.post("/api/organizations", json={"name": "Проверка запуска"}).json()
                    workshop = client.post("/api/workshops", json={"name": "Цех", "organization_id": organization["id"]}).json()
                    asset = client.post("/api/assets", json={"name": "Агрегат", "inventory_number": "START-1", "workshop_id": workshop["id"]}).json()
                    motor = client.post("/api/motors", json={"name": "Проверочный двигатель", "asset_id": asset["id"], "power_kw": 7.5, "rpm": 1500}).json()
                    motor_id = motor["id"]
                    device = client.post("/api/devices", json={"name": "Виртуальный датчик", "serial_number": "START-SIM-1", "motor_id": motor_id}).json()
                    assert client.put("/api/devices/" + device["id"] + "/simulation", json={"enabled": True, "scenario": "normal", "interval_seconds": .5}).status_code == 200
                    for _ in range(40):
                        if len(client.get(f"/api/motors/{motor_id}/measurements").json()["items"]) >= 2:
                            break
                        time.sleep(.25)
                assert client.get(f"/api/motors/{motor_id}").status_code == 200
                assert len(client.get(f"/api/motors/{motor_id}/measurements").json()["items"]) >= 2
        assert process.returncode == 0
        for port in (frontend_port, api_port):
            with pytest.raises(httpx.TransportError):
                httpx.get(f"http://127.0.0.1:{port}/api/health", timeout=1)
