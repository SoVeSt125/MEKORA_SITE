"""Shared process helpers for the native launcher; no application dependencies."""
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import time
from urllib.request import urlopen
from urllib.error import URLError


def ensure_free_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        if os.name == "nt":
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        else:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind(("127.0.0.1", port))
        except OSError:
            raise RuntimeError(f"Порт {port} уже занят. Остановите прежний сервер через Ctrl+C "
                               "или выберите другой порт. Другие процессы не остановлены.") from None


def npm_command(*arguments):
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    node = shutil.which("node.exe" if os.name == "nt" else "node")
    if not npm or not node:
        raise RuntimeError("Установите Node.js 24 LTS, затем заново откройте окно запуска.")
    if os.name == "nt":
        cli = Path(npm).parent / "node_modules/npm/bin/npm-cli.js"
        if not cli.is_file():
            raise RuntimeError("Не найден npm-cli.js. Восстановите стандартную установку Node.js 24 LTS.")
        return [node, str(cli), *arguments]
    return [npm, *arguments]


def spawn(command, directory, environment):
    options = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP} if os.name == "nt" else {"start_new_session": True}
    return subprocess.Popen(command, cwd=directory, env=environment, **options)


def wait_for_service(url, children, label, seconds=30):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if any(child.poll() is not None for child in children):
            raise RuntimeError(f"{label}: процесс завершился. Проверьте сообщение выше.")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except (URLError, OSError):
            pass
        time.sleep(.25)
    raise RuntimeError(f"{label} не готов за {seconds} секунд. Проверьте сообщение выше.")


def stop_children(children):
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
