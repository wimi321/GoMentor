#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT"
echo "[1/4] Installing Node dependencies"
pnpm install

echo "[2/4] Installing Python dependencies"
python3 -m pip install -r scripts/requirements.txt

echo "[3/4] Preparing KataGo"
python3 scripts/install_katago_latest.py || true

echo "[4/4] Launching KataSensei"
pnpm dev
