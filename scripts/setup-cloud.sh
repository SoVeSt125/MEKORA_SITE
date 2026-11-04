#!/usr/bin/env bash
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"
if [ ! -x .venv/bin/python ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install --cache-dir /workspace/.cache/mekora-pip -r backend/requirements.lock
(cd frontend && npm ci --cache /workspace/.cache/mekora-npm)
.venv/bin/python -m pytest backend/tests simulator/tests -q
(cd frontend && npm run build)
