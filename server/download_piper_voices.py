#!/usr/bin/env python3
"""Download Piper TTS voice models ke folder voices lokal.

Piper voices ada di Hugging Face (rhasspy/piper-voices). Tiap voice terdiri
dari dua file: model ONNX (`<name>.onnx`) dan config-nya (`<name>.onnx.json`).
Nama voice meng-encode path repo-nya, mis. ``id_ID-news_tts-medium`` ->
``id/id_ID/news_tts/medium/id_ID-news_tts-medium.onnx[.json]``.

Penggunaan:
    # download voice default (yang dipetakan PIPER_VOICES di modules/tts.py)
    python download_piper_voices.py

    # download voice spesifik
    python download_piper_voices.py id_ID-news_tts-medium en_US-ryan-medium

    # daftar voice yang tersedia di repo
    python download_piper_voices.py --list

Env:
    PIPER_VOICES_DIR   target directory (default: ./app/piper_voices)
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
VOICES_INDEX = f"{HF_BASE}/voices.json"

# Voice default — sinkron dengan PIPER_VOICES di modules/tts.py.
# Voice Bahasa Indonesia di Piper terbatas; override lewat CLI jika perlu.
DEFAULT_VOICES = [
    "id_ID-news_tts-medium",
    "en_US-ryan-medium",
]

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VOICES_DIR = os.environ.get(
    "PIPER_VOICES_DIR", os.path.join(_SCRIPT_DIR, "app", "piper_voices")
)


def voice_to_repo_path(name: str) -> str:
    """``id_ID-news_tts-medium`` -> ``id/id_ID/news_tts/medium``."""
    parts = name.split("-")
    if len(parts) < 3:
        raise ValueError(
            f"Nama voice '{name}' tidak sesuai format '<lang_REGION>-<name>-<quality>'."
        )
    lang_region = parts[0]
    quality = parts[-1]
    voice_id = "-".join(parts[1:-1])
    lang = lang_region.split("_")[0]
    return f"{lang}/{lang_region}/{voice_id}/{quality}"


def download(url: str, dest: str) -> None:
    """Stream URL ke file lokal dengan indikator progress."""
    tmp = dest + ".part"
    req = urllib.request.Request(url, headers={"User-Agent": "piper-voice-downloader"})
    with urllib.request.urlopen(req) as resp, open(tmp, "wb") as out:
        total = int(resp.headers.get("Content-Length", 0))
        read = 0
        while True:
            chunk = resp.read(1 << 16)
            if not chunk:
                break
            out.write(chunk)
            read += len(chunk)
            if total:
                pct = read * 100 // total
                print(
                    f"\r    {os.path.basename(dest)}: {pct:3d}% "
                    f"({read // 1024} / {total // 1024} KiB)",
                    end="",
                    flush=True,
                )
    os.replace(tmp, dest)
    print()


def fetch_voice(name: str) -> bool:
    """Download .onnx + .onnx.json untuk satu voice. Return success."""
    repo_path = voice_to_repo_path(name)
    os.makedirs(VOICES_DIR, exist_ok=True)
    ok = True
    for suffix in (".onnx", ".onnx.json"):
        filename = f"{name}{suffix}"
        dest = os.path.join(VOICES_DIR, filename)
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            print(f"  v {filename} sudah ada, dilewati")
            continue
        url = f"{HF_BASE}/{repo_path}/{filename}"
        print(f"  > {url}")
        try:
            download(url, dest)
        except urllib.error.HTTPError as e:
            print(f"  x gagal ({e.code} {e.reason}) - cek nama voice", file=sys.stderr)
            ok = False
            break
        except urllib.error.URLError as e:
            print(f"  x network error: {e.reason}", file=sys.stderr)
            ok = False
            break
    return ok


def list_voices() -> None:
    """Print nama voice yang tersedia dari index repo."""
    req = urllib.request.Request(VOICES_INDEX, headers={"User-Agent": "piper-voice-downloader"})
    with urllib.request.urlopen(req) as resp:
        data = json.load(resp)
    for key in sorted(data.keys()):
        info = data[key]
        lang = info.get("language", {}).get("name_native", "")
        print(f"  {key:40s} {lang}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Download Piper TTS voice models.")
    parser.add_argument("voices", nargs="*", help="nama voice (mis. id_ID-news_tts-medium)")
    parser.add_argument("--list", action="store_true", help="list voice yang tersedia")
    args = parser.parse_args()

    if args.list:
        list_voices()
        return 0

    voices = args.voices or DEFAULT_VOICES
    print(f"Target directory: {os.path.abspath(VOICES_DIR)}")
    print(f"Mengunduh {len(voices)} voice: {', '.join(voices)}\n")

    failures = []
    for name in voices:
        print(f"- {name}")
        try:
            if not fetch_voice(name):
                failures.append(name)
        except ValueError as e:
            print(f"  x {e}", file=sys.stderr)
            failures.append(name)
        print()

    if failures:
        print(f"Selesai dengan {len(failures)} gagal: {', '.join(failures)}")
        print("Tip: jalankan 'python download_piper_voices.py --list' untuk nama valid.")
        return 1
    print("Semua voice berhasil diunduh.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
