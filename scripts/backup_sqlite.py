"""Consistent online SQLite backup using the built-in backup API."""
import argparse
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument("--source", default="data/mekora.db")
parser.add_argument("--target", required=True)
args = parser.parse_args()
source, target = Path(args.source).resolve(), Path(args.target).resolve()
if not source.is_file() or target.exists() or source == target:
    raise SystemExit("Источник должен существовать, а файл копии — быть новым")
target.parent.mkdir(parents=True, exist_ok=True)
with sqlite3.connect(f"file:{source.as_posix()}?mode=ro",uri=True) as original, sqlite3.connect(target) as backup:
    original.backup(backup)
    assert backup.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
print("Проверенная копия сохранена: " + str(target))
