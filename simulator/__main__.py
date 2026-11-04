import argparse
from datetime import datetime, timezone
import json
import logging
import os
from pathlib import Path
import sqlite3
import time
import httpx
from simulator.generator import SimulatorAdapter

log = logging.getLogger("mekora.simulator")


class Outbox:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY, device_id TEXT, sequence INTEGER, payload TEXT, failed TEXT)")
        self.db.execute("CREATE TABLE IF NOT EXISTS counters (device_id TEXT PRIMARY KEY, next_sequence INTEGER)")
        self.db.commit()

    def next_sequence(self, device):
        row = self.db.execute("SELECT next_sequence FROM counters WHERE device_id=?", (device["id"],)).fetchone()
        return max(device["next_sequence"], row[0] if row else 0)

    def enqueue(self, payload):
        self.db.execute("INSERT INTO outbox VALUES (?, ?, ?, ?, NULL)", (payload["measurement_id"], payload["device_id"], payload["sequence_number"], json.dumps(payload)))
        self.db.execute("INSERT INTO counters VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET next_sequence=excluded.next_sequence",
                        (payload["device_id"], payload["sequence_number"] + 1))
        self.db.commit()

    def flush(self, client):
        for key, payload in self.db.execute("SELECT id, payload FROM outbox WHERE failed IS NULL ORDER BY rowid LIMIT 100").fetchall():
            response = client.post("/api/ingestion", json=json.loads(payload))
            if response.status_code in (200, 201):
                self.db.execute("DELETE FROM outbox WHERE id=?", (key,))
                log.info("Измерение сохранено: %s", key)
            elif 400 <= response.status_code < 500:
                self.db.execute("UPDATE outbox SET failed=? WHERE id=?", (response.text[:1000], key))
                log.error("Измерение помещено в карантин: %s · HTTP %s", key, response.status_code)
            else:
                response.raise_for_status()
            self.db.commit()


def main():
    parser = argparse.ArgumentParser(description="MEKORA · виртуальные датчики; реального BLE нет")
    parser.add_argument("--api", default=os.environ.get("MEKORA_API_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--outbox", default="data/simulator-outbox.db")
    parser.add_argument("--steps", type=int, default=0, help="0 — работать до Ctrl+C")
    args = parser.parse_args()
    key = os.environ.get("MEKORA_SIMULATOR_KEY", "")
    if not key:
        raise SystemExit("Задайте MEKORA_SIMULATOR_KEY из .env; ключ не передаётся в аргументах командной строки")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s · %(message)s")
    outbox = Outbox(args.outbox)
    adapter = SimulatorAdapter()
    due = {}
    count = 0
    with httpx.Client(base_url=args.api, headers={"X-Gateway-Key": key}, timeout=10) as client:
        try:
            while not args.steps or count < args.steps:
                try:
                    outbox.flush(client)
                    response = client.get("/api/simulator/devices")
                    response.raise_for_status()
                    for device in response.json():
                        if not device["simulation_enabled"] or time.monotonic() < due.get(device["id"], 0):
                            continue
                        if outbox.db.execute("SELECT count(*) FROM outbox").fetchone()[0] >= 10000:
                            log.error("Локальная очередь заполнена; новые измерения приостановлены")
                            break
                        elapsed = (datetime.now(timezone.utc) - datetime.fromisoformat(device["scenario_started_at"])).total_seconds()
                        payload = adapter.read(device, outbox.next_sequence(device), max(0, elapsed))
                        if payload:
                            outbox.enqueue(payload)
                        due[device["id"]] = time.monotonic() + device["interval_seconds"]
                    outbox.flush(client)
                except httpx.HTTPError as exc:
                    log.warning("API недоступен (%s); очередь сохранена", type(exc).__name__)
                count += 1
                time.sleep(.5)
        except KeyboardInterrupt:
            log.info("Симулятор остановлен; неотправленные данные сохранены")
        finally:
            outbox.db.close()


if __name__ == "__main__":
    main()
