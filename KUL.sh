#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR_DEFAULT="$HOME/OneDrive/Documents/KrUltra/KUL - KrUltra Løypemakker/data"

cd "$ROOT_DIR"
export KUL_DATA_DIR="${KUL_DATA_DIR:-$DATA_DIR_DEFAULT}"

if [[ ! -x "$ROOT_DIR/.venv/bin/python" ]]; then
  echo "Mangler prosjektmiljøet $ROOT_DIR/.venv/bin/python" >&2
  echo "Opprett det med: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

exec "$ROOT_DIR/.venv/bin/python" -m uvicorn backend.main:app \
  --host 127.0.0.1 --port 8000 --reload --reload-dir backend
