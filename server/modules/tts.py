"""
TTS (Text-to-Speech) module.

Mengintegrasikan Edge-TTS (online) dan Piper-TTS (offline/local) ke dalam
server Realtime Antrian. Dipakai untuk memanggil suara antrian, sapaan,
pengumuman loket, dsb.

Endpoint utama (semua di-prefix `/api/tts`):
    GET    /api/tts/voices            -> list voice yang tersedia
    GET    /api/tts/health            -> status engine + folder output
    GET    /api/tts/stats             -> statistik file & konfigurasi
    POST   /api/tts/                  -> generate satu audio (json body)
    POST   /api/tts/batch             -> generate banyak audio sekaligus
    GET    /api/tts/audio/{audio_id}  -> download / stream audio hasil generate

Konfigurasi (env vars, semua opsional):
    OUTPUT_DIR                Folder file audio hasil generate (default: ./app/output)
    TTS_MAX_TEXT_LENGTH       Max karakter per request (default: 5000)
    TTS_CLEANUP_INTERVAL      Detik file disimpan sebelum auto-hapus (default: 3600)
    TTS_DEFAULT_ENGINE        edge | piper (default: edge)

    PIPER_VOICES_DIR          Folder model Piper (default: ./app/piper_voices)
    PIPER_VOICES              Mapping "id=model,id2=model2"
    PIPER_DEFAULT_VOICE       Voice id default Piper (default: en_female)

    API_KEY / API_KEYS        Aktifkan auth jika diisi (kosong = mode dev)
    API_KEY_HEADER            Header HTTP untuk API key (default: X-API-Key)

    RATE_LIMIT_DEFAULT        Limit default semua route TTS (default: 60/minute)
    RATE_LIMIT_TTS            Limit POST /api/tts (default: 30/minute)
    RATE_LIMIT_TTS_BATCH      Limit POST /api/tts/batch (default: 5/minute)
    RATE_LIMIT_AUDIO          Limit GET /api/tts/audio/{id} (default: 120/minute)
    RATE_LIMIT_STATS          Limit GET /api/tts/stats (default: 30/minute)
    RATE_LIMIT_STORAGE_URI    Storage backend slowapi (default: memory://)
"""

import asyncio
import logging
import os
import secrets
import sys
import uuid
import wave
from datetime import datetime
from typing import List, Optional

import edge_tts
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Request,
    Response,
    Security,
    status,
)
from fastapi.responses import FileResponse
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field
from slowapi import Limiter
from slowapi.util import get_remote_address

# ---------------------------------------------------------------------------
# Optional Piper TTS (engine lokal/offline). Diguarded supaya server tetap
# jalan dengan engine Edge saja kalau piper-tts belum terpasang.
# ---------------------------------------------------------------------------
try:
    from piper import PiperVoice  # type: ignore
    PIPER_AVAILABLE = True
except ImportError:
    try:
        from piper.voice import PiperVoice  # type: ignore
        PIPER_AVAILABLE = True
    except ImportError:
        PiperVoice = None  # type: ignore
        PIPER_AVAILABLE = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Path konfigurasi
# ---------------------------------------------------------------------------
_SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OUTPUT_DIR = os.environ.get("OUTPUT_DIR", os.path.join(_SERVER_DIR, "app", "output"))
MAX_TEXT_LENGTH = int(os.environ.get("TTS_MAX_TEXT_LENGTH", "5000"))
CLEANUP_INTERVAL = int(os.environ.get("TTS_CLEANUP_INTERVAL", "3600"))

os.makedirs(OUTPUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Authentication (opt-in via env var)
# ---------------------------------------------------------------------------
API_KEYS = {
    k.strip()
    for k in os.environ.get("API_KEYS", os.environ.get("API_KEY", "")).split(",")
    if k.strip()
}
API_KEY_HEADER_NAME = os.environ.get("API_KEY_HEADER", "X-API-Key")
AUTH_ENABLED = len(API_KEYS) > 0

if AUTH_ENABLED:
    logger.info(
        f"[TTS] API key authentication ENABLED ({len(API_KEYS)} key(s) loaded, header: {API_KEY_HEADER_NAME})"
    )
else:
    logger.info("[TTS] API key authentication DISABLED (mode dev)")

api_key_header = APIKeyHeader(name=API_KEY_HEADER_NAME, auto_error=False)


async def require_api_key(
    api_key: Optional[str] = Security(api_key_header),
) -> Optional[str]:
    """Validasi API key. No-op kalau AUTH_ENABLED False."""
    if not AUTH_ENABLED:
        return None
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Missing API key. Kirim via header '{API_KEY_HEADER_NAME}'.",
        )
    if not any(secrets.compare_digest(api_key, valid) for valid in API_KEYS):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API key tidak valid.",
        )
    return api_key


# ---------------------------------------------------------------------------
# Rate limiting (slowapi). Limiter di-share dengan app via setup_tts(app).
# ---------------------------------------------------------------------------
RATE_LIMIT_DEFAULT = os.environ.get("RATE_LIMIT_DEFAULT", "60/minute")
RATE_LIMIT_TTS = os.environ.get("RATE_LIMIT_TTS", "30/minute")
RATE_LIMIT_TTS_BATCH = os.environ.get("RATE_LIMIT_TTS_BATCH", "5/minute")
RATE_LIMIT_AUDIO = os.environ.get("RATE_LIMIT_AUDIO", "120/minute")
RATE_LIMIT_STATS = os.environ.get("RATE_LIMIT_STATS", "30/minute")
RATE_LIMIT_STORAGE_URI = os.environ.get("RATE_LIMIT_STORAGE_URI", "memory://")


def _rate_limit_key(request: Request) -> str:
    """Bucket per API key kalau ada, kalau tidak jatuh ke IP client."""
    key = request.headers.get(API_KEY_HEADER_NAME)
    if key:
        return f"key:{key}"
    return f"ip:{get_remote_address(request)}"


limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=[RATE_LIMIT_DEFAULT],
    storage_uri=RATE_LIMIT_STORAGE_URI,
    headers_enabled=True,
)

# ---------------------------------------------------------------------------
# Voice configurations
# ---------------------------------------------------------------------------
INDONESIAN_VOICES = {
    "female": {
        "name": "id-ID-GadisNeural",
        "gender": "Female",
        "description": "Natural Indonesian female voice - Professional",
    },
    "male": {
        "name": "id-ID-ArdiNeural",
        "gender": "Male",
        "description": "Natural Indonesian male voice - Authoritative",
    },
}

ENGLISH_VOICES = {
    "female_us": {
        "name": "en-US-AriaNeural",
        "gender": "Female",
        "description": "Natural US English female voice",
    },
    "male_us": {
        "name": "en-US-GuyNeural",
        "gender": "Male",
        "description": "Natural US English male voice",
    },
}

ALL_VOICES = {**INDONESIAN_VOICES, **ENGLISH_VOICES}

# ---------------------------------------------------------------------------
# Piper voices configuration
# ---------------------------------------------------------------------------
PIPER_VOICES_DIR = os.environ.get(
    "PIPER_VOICES_DIR", os.path.join(_SERVER_DIR, "app", "piper_voices")
)

PIPER_VOICES = {
    "id_female": "id_ID-female-medium",
    "en_female": "en_US-lessac-medium",
    "en_male": "en_US-ryan-medium",
}
_piper_env = os.environ.get("PIPER_VOICES", "").strip()
if _piper_env:
    for pair in _piper_env.split(","):
        if "=" in pair:
            vid, model = pair.split("=", 1)
            PIPER_VOICES[vid.strip()] = model.strip()

PIPER_DEFAULT_VOICE = os.environ.get("PIPER_DEFAULT_VOICE", "en_female")

SUPPORTED_ENGINES = {"edge", "piper"}
DEFAULT_ENGINE = os.environ.get("TTS_DEFAULT_ENGINE", "edge").strip().lower()
if DEFAULT_ENGINE not in SUPPORTED_ENGINES:
    logger.warning(
        f"[TTS] TTS_DEFAULT_ENGINE='{DEFAULT_ENGINE}' bukan salah satu dari "
        f"{sorted(SUPPORTED_ENGINES)}; fallback ke 'edge'"
    )
    DEFAULT_ENGINE = "edge"

if PIPER_AVAILABLE:
    logger.info(
        f"[TTS] Piper engine AVAILABLE (voices dir: {PIPER_VOICES_DIR}, "
        f"{len(PIPER_VOICES)} voice mapping)"
    )
else:
    logger.info("[TTS] Piper engine NOT installed — hanya Edge yang aktif")

_piper_voice_cache: dict = {}


def get_piper_voice(voice: str):
    if not PIPER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Piper TTS belum terpasang. Install: pip install piper-tts",
        )

    model_name = PIPER_VOICES.get(voice, PIPER_VOICES.get(PIPER_DEFAULT_VOICE))
    if model_name is None:
        raise HTTPException(status_code=400, detail=f"Voice Piper '{voice}' tidak dikenal.")

    if model_name in _piper_voice_cache:
        return _piper_voice_cache[model_name]

    model_path = os.path.join(PIPER_VOICES_DIR, f"{model_name}.onnx")
    config_path = f"{model_path}.json"
    if not os.path.exists(model_path):
        raise HTTPException(
            status_code=503,
            detail=(
                f"Piper voice model '{model_name}.onnx' tidak ditemukan di {PIPER_VOICES_DIR}. "
                "Unduh dari https://huggingface.co/rhasspy/piper-voices"
            ),
        )

    config_arg = config_path if os.path.exists(config_path) else None
    loaded = PiperVoice.load(model_path, config_path=config_arg)
    _piper_voice_cache[model_name] = loaded
    logger.info(f"[TTS] Piper voice model dimuat: {model_name}")
    return loaded


def synthesize_piper(text: str, voice: str, output_file: str) -> None:
    """Sintesis text -> WAV file pakai Piper (blocking)."""
    piper_voice = get_piper_voice(voice)
    with wave.open(output_file, "wb") as wav_file:
        piper_voice.synthesize(text, wav_file)


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class TTSRequest(BaseModel):
    text: str = Field(..., description="Text yang mau dikonversi ke audio")
    voice: str = Field("female", description="Voice id (lihat /api/tts/voices)")
    rate: str = Field("+0%", description="Kecepatan: -50% s/d +100%")
    pitch: str = Field("+0Hz", description="Pitch: -50Hz s/d +50Hz")
    volume: str = Field("+0%", description="Volume: -50% s/d +50%")
    language: str = Field("indonesian", description="indonesian | english")
    output_format: str = Field("wav", description="wav | mp3")
    engine: str = Field(DEFAULT_ENGINE, description="edge | piper")

    class Config:
        json_schema_extra = {
            "example": {
                "text": "Nomor antrian A satu, silakan menuju loket satu",
                "voice": "female",
                "language": "indonesian",
                "engine": "edge",
            }
        }


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------
def estimate_duration(text: str, language: str = "indonesian") -> float:
    """Estimasi durasi audio dari jumlah kata."""
    word_count = len(text.split())
    words_per_minute = 120 if language.lower() == "indonesian" else 150
    duration_minutes = word_count / words_per_minute if word_count else 0
    return round(duration_minutes * 60, 2)


def get_voice_name(voice: str, language: str) -> str:
    """Ambil nama voice Edge TTS yang sesungguhnya."""
    if language.lower() == "english":
        return ENGLISH_VOICES.get(voice, ENGLISH_VOICES["female_us"])["name"]
    return INDONESIAN_VOICES.get(voice, INDONESIAN_VOICES["female"])["name"]


async def cleanup_old_files() -> None:
    """Hapus file audio yang lebih tua dari CLEANUP_INTERVAL."""
    try:
        current_time = datetime.now().timestamp()
        for filename in os.listdir(OUTPUT_DIR):
            file_path = os.path.join(OUTPUT_DIR, filename)
            if os.path.isfile(file_path) and filename.lower().endswith((".wav", ".mp3")):
                file_age = current_time - os.path.getctime(file_path)
                if file_age > CLEANUP_INTERVAL:
                    os.remove(file_path)
                    logger.info(f"[TTS] File dibersihkan: {filename}")
    except Exception as e:
        logger.error(f"[TTS] Cleanup error: {e}")


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/tts", tags=["TTS"])


@router.get("/health")
def health_check():
    """GET api/tts/health -> status engine + folder output."""
    return {
        "status": True,
        "data": {
            "service": "tts",
            "timestamp": datetime.now().isoformat(),
            "output_dir": OUTPUT_DIR,
            "output_dir_writable": os.access(OUTPUT_DIR, os.W_OK),
            "auth_enabled": AUTH_ENABLED,
            "default_engine": DEFAULT_ENGINE,
            "engines": {
                "edge": True,
                "piper": PIPER_AVAILABLE,
            },
        },
    }


@router.get("/voices")
def list_voices():
    """GET api/tts/voices -> list semua voice yang tersedia."""
    voices: List[dict] = []

    for voice_id, voice_data in INDONESIAN_VOICES.items():
        voices.append(
            {
                "voice_id": voice_id,
                "name": voice_data["name"],
                "gender": voice_data["gender"],
                "description": voice_data["description"],
                "language": "Indonesian",
                "engine": "edge",
            }
        )

    for voice_id, voice_data in ENGLISH_VOICES.items():
        voices.append(
            {
                "voice_id": voice_id,
                "name": voice_data["name"],
                "gender": voice_data["gender"],
                "description": voice_data["description"],
                "language": "English",
                "engine": "edge",
            }
        )

    for voice_id, model_name in PIPER_VOICES.items():
        voices.append(
            {
                "voice_id": voice_id,
                "name": model_name,
                "gender": "Unknown",
                "description": f"Local Piper neural voice ({model_name})",
                "language": "Indonesian" if voice_id.startswith("id") else "English",
                "engine": "piper",
            }
        )

    return {"status": True, "data": voices}


@router.post("/", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT_TTS)
async def generate_speech(
    request: Request,
    tts_request: TTSRequest,
    background_tasks: BackgroundTasks,
    response: Response,
):
    """POST api/tts -> generate satu audio dari text."""
    try:
        if not tts_request.text.strip():
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"status": False, "message": "Text tidak boleh kosong"}

        if len(tts_request.text) > MAX_TEXT_LENGTH:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {
                "status": False,
                "message": f"Text terlalu panjang (maks {MAX_TEXT_LENGTH} karakter)",
            }

        engine = tts_request.engine.lower()
        audio_id = str(uuid.uuid4())

        if engine == "piper":
            voice_name = PIPER_VOICES.get(
                tts_request.voice, PIPER_VOICES.get(PIPER_DEFAULT_VOICE, tts_request.voice)
            )
            filename = f"{audio_id}.wav"
            output_file = os.path.join(OUTPUT_DIR, filename)
            await asyncio.to_thread(
                synthesize_piper, tts_request.text, tts_request.voice, output_file
            )
        else:
            voice_name = get_voice_name(tts_request.voice, tts_request.language)
            file_extension = "wav" if tts_request.output_format.lower() == "wav" else "mp3"
            filename = f"{audio_id}.{file_extension}"
            output_file = os.path.join(OUTPUT_DIR, filename)

            communicate = edge_tts.Communicate(
                text=tts_request.text,
                voice=voice_name,
                rate=tts_request.rate,
                pitch=tts_request.pitch,
                volume=tts_request.volume,
            )
            await communicate.save(output_file)

        if not os.path.exists(output_file):
            response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
            return {"status": False, "message": "Gagal menyimpan file audio"}

        file_size = os.path.getsize(output_file)
        duration = estimate_duration(tts_request.text, tts_request.language)

        background_tasks.add_task(cleanup_old_files)

        logger.info(
            f"[TTS] Audio dibuat: id={audio_id} voice={voice_name} size={file_size}B engine={engine}"
        )

        return {
            "status": True,
            "message": "Audio berhasil dibuat",
            "data": {
                "audio_id": audio_id,
                "audio_url": f"/api/tts/audio/{audio_id}",
                "duration_estimate": duration,
                "voice_used": voice_name,
                "engine_used": engine,
                "file_size": file_size,
            },
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TTS] generate_speech error: {e}", exc_info=True)
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": False, "message": f"Gagal generate speech: {str(e)}"}


@router.post("/batch", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT_TTS_BATCH)
async def generate_batch_speech(
    request: Request,
    requests_payload: List[TTSRequest],
    background_tasks: BackgroundTasks,
    response: Response,
):
    """POST api/tts/batch -> generate banyak audio sekaligus (maks 10)."""
    try:
        if len(requests_payload) > 10:
            response.status_code = status.HTTP_400_BAD_REQUEST
            return {"status": False, "message": "Maksimum 10 request per batch"}

        results = []
        for req in requests_payload:
            try:
                audio_id = str(uuid.uuid4())
                engine = req.engine.lower()

                if engine == "piper":
                    voice_name = PIPER_VOICES.get(
                        req.voice, PIPER_VOICES.get(PIPER_DEFAULT_VOICE, req.voice)
                    )
                    filename = f"{audio_id}.wav"
                    output_file = os.path.join(OUTPUT_DIR, filename)
                    await asyncio.to_thread(synthesize_piper, req.text, req.voice, output_file)
                else:
                    voice_name = get_voice_name(req.voice, req.language)
                    file_extension = "wav" if req.output_format.lower() == "wav" else "mp3"
                    filename = f"{audio_id}.{file_extension}"
                    output_file = os.path.join(OUTPUT_DIR, filename)
                    communicate = edge_tts.Communicate(
                        text=req.text,
                        voice=voice_name,
                        rate=req.rate,
                        pitch=req.pitch,
                        volume=req.volume,
                    )
                    await communicate.save(output_file)

                file_size = os.path.getsize(output_file) if os.path.exists(output_file) else 0
                duration = estimate_duration(req.text, req.language)

                results.append(
                    {
                        "success": True,
                        "audio_id": audio_id,
                        "audio_url": f"/api/tts/audio/{audio_id}",
                        "duration_estimate": duration,
                        "voice_used": voice_name,
                        "engine_used": engine,
                        "file_size": file_size,
                        "text_preview": req.text[:50] + "..." if len(req.text) > 50 else req.text,
                    }
                )
            except Exception as e:
                results.append(
                    {
                        "success": False,
                        "error": str(e),
                        "text_preview": req.text[:50] + "..." if len(req.text) > 50 else req.text,
                    }
                )

        background_tasks.add_task(cleanup_old_files)

        return {
            "status": True,
            "message": "Batch selesai diproses",
            "data": {
                "total_requests": len(requests_payload),
                "successful": len([r for r in results if r.get("success")]),
                "failed": len([r for r in results if not r.get("success")]),
                "results": results,
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TTS] batch error: {e}", exc_info=True)
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": False, "message": f"Gagal proses batch: {str(e)}"}


@router.get("/audio/{audio_id}", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT_AUDIO)
async def download_audio(request: Request, audio_id: str):
    """GET api/tts/audio/{audio_id} -> download file audio."""
    for ext, media_type in (("wav", "audio/wav"), ("mp3", "audio/mpeg")):
        file_path = os.path.join(OUTPUT_DIR, f"{audio_id}.{ext}")
        if os.path.exists(file_path):
            return FileResponse(
                file_path,
                media_type=media_type,
                filename=f"antrian_tts_{audio_id}.{ext}",
            )

    raise HTTPException(status_code=404, detail="File audio tidak ditemukan")


@router.get("/stats", dependencies=[Depends(require_api_key)])
@limiter.limit(RATE_LIMIT_STATS)
async def get_stats(request: Request, response: Response):
    """GET api/tts/stats -> statistik file & konfigurasi."""
    try:
        files = os.listdir(OUTPUT_DIR) if os.path.exists(OUTPUT_DIR) else []
        audio_files = [f for f in files if f.lower().endswith((".wav", ".mp3"))]

        total_size = 0
        for f in audio_files:
            file_path = os.path.join(OUTPUT_DIR, f)
            if os.path.exists(file_path):
                total_size += os.path.getsize(file_path)

        return {
            "status": True,
            "data": {
                "total_audio_files": len(audio_files),
                "total_size_bytes": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "available_voices": len(ALL_VOICES) + len(PIPER_VOICES),
                "supported_languages": ["Indonesian", "English"],
                "max_text_length": MAX_TEXT_LENGTH,
                "cleanup_interval_hours": CLEANUP_INTERVAL / 3600,
                "output_directory": OUTPUT_DIR,
                "default_engine": DEFAULT_ENGINE,
                "engines": {"edge": True, "piper": PIPER_AVAILABLE},
            },
        }
    except Exception as e:
        logger.error(f"[TTS] stats error: {e}", exc_info=True)
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"status": False, "message": "Gagal ambil statistik"}


# ---------------------------------------------------------------------------
# Setup helper untuk app.py
# ---------------------------------------------------------------------------
def setup_tts(app) -> None:
    """Pasang slowapi (rate limiter) ke FastAPI app & log konfigurasi TTS.

    Dipanggil dari app.py SEBELUM include_router(tts.router), supaya
    Limiter dan exception handler terpasang dengan benar.
    """
    from slowapi import _rate_limit_exceeded_handler
    from slowapi.errors import RateLimitExceeded
    from slowapi.middleware import SlowAPIMiddleware

    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
    app.add_middleware(SlowAPIMiddleware)

    logger.info(
        f"[TTS] Rate limiting aktif (default={RATE_LIMIT_DEFAULT}, tts={RATE_LIMIT_TTS}, "
        f"batch={RATE_LIMIT_TTS_BATCH}, audio={RATE_LIMIT_AUDIO}, stats={RATE_LIMIT_STATS}, "
        f"storage={RATE_LIMIT_STORAGE_URI})"
    )
    logger.info(f"[TTS] Default engine: {DEFAULT_ENGINE} | Output dir: {OUTPUT_DIR}")
