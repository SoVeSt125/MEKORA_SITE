"""Install Monitor dependencies once; refresh only when lockfiles change."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
from local_tools import npm_command

ROOT = Path(__file__).resolve().parents[1]


def fingerprint(*paths):
    result = hashlib.sha256()
    for path in paths:
        result.update(path.read_bytes())
    return result.hexdigest()


def main():
    stamp = ROOT / ".venv/mekora-setup.json"
    if Path(sys.prefix).resolve() != (ROOT / ".venv").resolve():
        print("Запустите start-windows.cmd: установка выполняется в отдельной .venv.", flush=True)
        return 1
    try:
        install_frontend = npm_command("ci", "--cache", str(ROOT / ".venv/npm-cache"))
        node_version = subprocess.check_output([shutil.which("node"), "--version"], text=True).strip()
        if int(node_version.lstrip("v").split(".")[0]) < 24:
            raise RuntimeError("Нужна Node.js 24 LTS или новее. Обновите Node.js.")
        try:
            previous = json.loads(stamp.read_text()) if stamp.is_file() else {}
        except (OSError, json.JSONDecodeError):
            previous = {}
        required = {
            "python": fingerprint(ROOT / "backend/requirements.lock") + f":{sys.version_info[:2]}",
            "node": fingerprint(ROOT / "frontend/package.json", ROOT / "frontend/package-lock.json"),
        }
        modules = ("fastapi", "sqlalchemy", "alembic", "httpx", "numpy", "scipy", "dotenv", "uvicorn")
        if previous.get("python") != required["python"] or not all(importlib.util.find_spec(m) for m in modules):
            print("Устанавливаем зависимости сервера…", flush=True)
            subprocess.run([sys.executable, "-m", "pip", "install", "--cache-dir", str(ROOT / ".venv/pip-cache"),
                            "-r", str(ROOT / "backend/requirements.lock")], cwd=ROOT, check=True)
        frontend_ready = (ROOT / "frontend/node_modules/vite/bin/vite.js").is_file()
        if previous.get("node") != required["node"] or not frontend_ready:
            print("Устанавливаем зависимости интерфейса…", flush=True)
            subprocess.run(install_frontend, cwd=ROOT / "frontend", check=True)
        stamp.write_text(json.dumps(required))
        print("Зависимости Monitor готовы. Повторная установка без изменений не требуется.", flush=True)
        return 0
    except (RuntimeError, OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"Не удалось подготовить Monitor: {error}", flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
