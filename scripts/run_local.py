"""Start native Monitor from any directory. Site 8000, API 8001, Monitor 5173."""
import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import webbrowser
from dotenv import dotenv_values
from local_tools import ensure_free_port, npm_command, spawn, stop_children, wait_for_service
from serve_site import port_number

ROOT = Path(__file__).resolve().parents[1]


def main():
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, signal.default_int_handler)
    parser = argparse.ArgumentParser(description="MEKORA Monitor · сервер, приложение и симулятор")
    parser.add_argument("--port", type=port_number, default=5173, help="Порт интерфейса (5173)")
    parser.add_argument("--api-port", type=port_number, default=8001, help="Порт API (8001)")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    children = []
    try:
        if args.port == args.api_port:
            raise RuntimeError("Порты интерфейса и API должны отличаться.")
        ensure_free_port(args.port)
        ensure_free_port(args.api_port)
        frontend = npm_command("run", "dev", "--", "--port", str(args.port), "--strictPort")
        environment = {k: v for k, v in dotenv_values(ROOT / ".env").items() if v is not None}
        environment.update(os.environ)
        if not environment.get("MEKORA_SIMULATOR_KEY") or not environment.get("MEKORA_ADMIN_PASSWORD"):
            raise RuntimeError("Сначала запустите start-windows.cmd: он создаст локальную конфигурацию.")
        environment.setdefault("MEKORA_DATABASE_URL", "sqlite:///" + (ROOT / "data/mekora.db").as_posix())
        environment["PYTHONUNBUFFERED"] = "1"
        api_url = f"http://127.0.0.1:{args.api_port}"
        environment["MEKORA_API_URL"] = api_url
        environment["MEKORA_BACKEND_URL"] = api_url
        origins = environment.get("MEKORA_ALLOWED_ORIGINS", "").split(",")
        origins.extend([f"http://localhost:{args.port}", f"http://127.0.0.1:{args.port}"])
        environment["MEKORA_ALLOWED_ORIGINS"] = ",".join(dict.fromkeys(o for o in origins if o))
        subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=ROOT / "backend", env=environment, check=True)
        subprocess.run([sys.executable, "-m", "app.bootstrap"], cwd=ROOT / "backend", env=environment, check=True)
        children.append(spawn([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                               "--port", str(args.api_port), "--workers", "1"], ROOT / "backend", environment))
        wait_for_service(api_url + "/api/health", children, "Backend")
        outbox = environment.get("MEKORA_SIMULATOR_OUTBOX", str(ROOT / "data/simulator-outbox.db"))
        children.append(spawn([sys.executable, "-m", "simulator", "--outbox", outbox], ROOT, environment))
        children.append(spawn(frontend, ROOT / "frontend", environment))
        url = f"http://localhost:{args.port}"
        wait_for_service(url + "/api/health", children, "Интерфейс и соединение с API", seconds=60)
        print(f"\nMEKORA Monitor готов: {url}\nAPI: {api_url}\n"
              "Логин: admin. Пароль — MEKORA_ADMIN_PASSWORD в .env.\n"
              "Оставьте окно открытым. Ctrl+C — остановить. Данные сохраняются.\n", flush=True)
        if not args.no_browser:
            try:
                webbrowser.open(url)
            except webbrowser.Error:
                print("Откройте адрес приложения в браузере вручную.", flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(.5)
        raise RuntimeError("Один из процессов завершился. Проверьте вывод выше.")
    except KeyboardInterrupt:
        print("\nОстанавливаем MEKORA; данные сохранены.", flush=True)
        return 0
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print(f"\nНе удалось запустить Monitor: {error}", flush=True)
        return 1
    finally:
        stop_children(children)


if __name__ == "__main__":
    raise SystemExit(main())
