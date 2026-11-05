"""Serve the product website, independent of the caller's current directory."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import signal
from urllib.parse import unquote, urlsplit
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = {"index.html", "styles.css", "app.js"}


def port_number(value):
    number = int(value)
    if not 1 <= number <= 65535:
        raise argparse.ArgumentTypeError("Порт должен быть от 1 до 65535")
    return number


class SiteHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = unquote(urlsplit(self.path).path).lstrip("/") or "index.html"
        candidate = (ROOT / path).resolve()
        try:
            relative = candidate.relative_to(ROOT)
        except ValueError:
            self.send_error(404, "Not found")
            return None
        allowed = (str(relative) in PUBLIC_FILES or
                   (relative.parts and relative.parts[0] == "assets"))
        if (not allowed or not candidate.is_file() or
                any(part.startswith(".") for part in relative.parts)):
            self.send_error(404, "Not found")
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404, "Not found")
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main():
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, signal.default_int_handler)
    parser = argparse.ArgumentParser(description="Сайт MEKORA на localhost:8000")
    parser.add_argument("--port", type=port_number, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if any(not (ROOT / name).is_file() for name in PUBLIC_FILES):
        print("Не найдены файлы сайта. Сначала полностью распакуйте ZIP MEKORA.", flush=True)
        return 1
    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), SiteHandler)
    except OSError:
        print(f"Порт {args.port} уже занят. В окне прежнего сервера нажмите Ctrl+C, "
              "затем запустите start-site.cmd ещё раз. Другие программы не остановлены.", flush=True)
        return 1
    url = f"http://localhost:{args.port}"
    print(f"\nСайт MEKORA запущен: {url}\n"
          "Папка сайта определяется автоматически. Оставьте это окно открытым.\n"
          "Ctrl+C — остановить сервер.\n", flush=True)
    if not args.no_browser:
        try:
            webbrowser.open(url)
        except webbrowser.Error:
            print("Откройте указанный адрес в браузере вручную.", flush=True)
    try:
        server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:
        print("\nСайт остановлен.", flush=True)
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
