"""Run from the project's virtualenv. Ctrl+C stops children without deleting data."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
from dotenv import dotenv_values

root = Path(__file__).resolve().parents[1]
environment = dict(os.environ)
environment.update({k:v for k,v in dotenv_values(root/".env").items() if v is not None})
if not environment.get("MEKORA_SIMULATOR_KEY") or not environment.get("MEKORA_ADMIN_PASSWORD"):
    raise SystemExit("Сначала запустите python scripts/init_env.py и настройте .env")
environment.setdefault("MEKORA_DATABASE_URL", "sqlite:///" + (root/"data"/"mekora.db").as_posix())
environment["PYTHONUNBUFFERED"] = "1"
if not shutil.which("npm"):
    raise SystemExit("Установите Node.js 24 LTS, затем заново откройте терминал")
subprocess.run([sys.executable,"-m","alembic","upgrade","head"],cwd=root/"backend",env=environment,check=True)
subprocess.run([sys.executable,"-m","app.bootstrap"],cwd=root/"backend",env=environment,check=True)
children = []


def spawn(command, directory):
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    return subprocess.Popen(command, cwd=directory, env=environment, **options)


try:
    children.append(spawn([sys.executable,"-m","uvicorn","app.main:app","--host","127.0.0.1","--port","8000","--workers","1"], root/"backend"))
    import httpx
    for _ in range(60):
        if children[0].poll() is not None:
            raise RuntimeError("Backend завершился. Проверьте сообщение выше и свободен ли порт 8000")
        try:
            if httpx.get("http://127.0.0.1:8000/api/health",timeout=1).status_code == 200:
                break
        except httpx.HTTPError:
            pass
        time.sleep(.5)
    else:
        raise RuntimeError("Сервер не готов за 30 секунд")
    children.append(spawn([sys.executable,"-m","simulator"], root))
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    children.append(spawn([npm,"run","dev","--","--strictPort"], root/"frontend"))
    print("\nMEKORA Monitor: http://localhost:5173\nЛогин: admin. Пароль — MEKORA_ADMIN_PASSWORD в .env.\nCtrl+C — остановить. Данные сохраняются в data/mekora.db.\n",flush=True)
    while all(child.poll() is None for child in children):
        time.sleep(.5)
    raise RuntimeError("Один из процессов завершился. Проверьте вывод выше")
except KeyboardInterrupt:
    print("\nОстанавливаем MEKORA; данные сохранены.")
finally:
    for child in reversed(children):
        try:
            if os.name != "nt":
                os.killpg(child.pid, signal.SIGTERM)
            elif child.poll() is None:
                child.send_signal(signal.CTRL_BREAK_EVENT)
        except ProcessLookupError:
            pass
    for child in reversed(children):
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(child.pid), "/T", "/F"], capture_output=True)
            else:
                os.killpg(child.pid, signal.SIGKILL)
