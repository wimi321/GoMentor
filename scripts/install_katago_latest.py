#!/usr/bin/env python3
import argparse
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path


NETWORKS_URL = "https://katagotraining.org/networks/"
LATEST_LINK_RE = re.compile(r'Latest network:</span>\s*<a href="([^"]+)">([^<]+)</a>', re.I)


def fetch_text(url):
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


def ensure_katago():
    path = shutil.which("katago")
    if path:
        return path
    if shutil.which("brew"):
        subprocess.check_call(["brew", "install", "katago"])
        path = shutil.which("katago")
        if path:
            return path
    raise RuntimeError("KataGo 未安装，请先安装 KataGo 或手动指定 binary 路径。")


def latest_model():
    html = fetch_text(NETWORKS_URL)
    match = LATEST_LINK_RE.search(html)
    if not match:
        raise RuntimeError("无法从 katagotraining.org 解析最新模型链接。")
    url, name = match.group(1), match.group(2)
    if url.startswith("/"):
        url = "https://katagotraining.org" + url
    return url, name


def download(url, destination):
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=120) as response, open(destination, "wb") as fp:
        shutil.copyfileobj(response, fp)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--home", default=str(Path.home() / ".katago"))
    args = parser.parse_args()

    home = Path(args.home).expanduser()
    model_dir = home / "models"
    config_dir = home / "configs"
    model_dir.mkdir(parents=True, exist_ok=True)
    config_dir.mkdir(parents=True, exist_ok=True)

    katago_bin = ensure_katago()
    model_url, model_name = latest_model()
    model_path = model_dir / (model_name if model_name.endswith(".bin.gz") else f"{model_name}.bin.gz")
    if not model_path.exists():
        download(model_url, model_path)

    latest_symlink = model_dir / "latest-kata1.bin.gz"
    if latest_symlink.exists() or latest_symlink.is_symlink():
        latest_symlink.unlink()
    latest_symlink.symlink_to(model_path)

    config_path = config_dir / "analysis_example.cfg"
    if not config_path.exists():
        config_path.write_text(
            "\n".join(
                [
                    "analysisPVLen = 12",
                    "numSearchThreads = 1",
                    "nnCacheSizePowerOfTwo = 18",
                    "reportAnalysisWinratesAs = SIDETOMOVE",
                ]
            ),
            encoding="utf-8",
        )

    print(
        json.dumps(
            {
                "katago_bin": katago_bin,
                "config_path": str(config_path),
                "model_path": str(latest_symlink),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
