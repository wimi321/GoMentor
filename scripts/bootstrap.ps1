$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Set-Location $Root
Write-Host "[1/4] Installing Node dependencies"
pnpm install

Write-Host "[2/4] Installing Python dependencies"
python -m pip install -r scripts/requirements.txt

Write-Host "[3/4] Preparing KataGo"
python scripts/install_katago_latest.py

Write-Host "[4/4] Launching KataSensei"
pnpm dev
