import re
import datetime
from typing import Optional
from fastapi import APIRouter, Response, Request, status
from pydantic import BaseModel, Field
from database.dbmysql import get_db_conn


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class PanggilanCall(BaseModel):
    id_loket: int = Field(..., gt=0, description="ID loket pemanggil (wajib)")


class PanggilanRecall(BaseModel):
    id_loket: int = Field(..., gt=0, description="ID loket pemanggil (wajib)")
    nomor: str = Field(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9]+$",
                       description="Nomor antrian yang ingin diulang (wajib)")


class PanggilanSimpan(BaseModel):
    id_antrian: int = Field(..., gt=0, description="ID antrian (wajib)")
    id_loket: int = Field(..., gt=0, description="ID loket pemanggil (wajib)")


# ---------------------------------------------------------------------------
# API Router
# ---------------------------------------------------------------------------
router = APIRouter(prefix="/api/panggilan", tags=["Panggilan"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def format_row(row):
    if not row:
        return None
    res = dict(row)
    for k, v in res.items():
        if hasattr(v, "strftime"):
            if isinstance(v, datetime.date) and not isinstance(v, datetime.datetime):
                res[k] = v.strftime("%Y-%m-%d")
            else:
                res[k] = v.strftime("%Y-%m-%d %H:%M:%S")
    return res


def _channel(id_loket: int) -> str:
    """Channel realtime: loket01, loket02, ..."""
    return f"loket{int(id_loket):02d}"


def _sanitize_keterangan(keterangan: Optional[str]) -> str:
    if not keterangan:
        return ""
    ket = re.sub(r"[\r\n|]+", " ", str(keterangan))
    ket = re.sub(r"\s+", " ", ket).strip()
    return ket


async def _publish(request: Request, channel: str, nomor: str, keterangan: str = ""):
    """
    Broadcast ke Socket.IO dengan format payload:
        loketXX-NOMOR              (tanpa keterangan)
        loketXX-NOMOR|KETERANGAN   (dengan keterangan)
    """
    payload = f"{channel}-{nomor}"
    ket = _sanitize_keterangan(keterangan)
    if ket:
        payload += f"|{ket}"
    try:
        sio = getattr(request.app.state, "sio", None)
        if sio:
            await sio.emit("message", payload)
    except Exception as e:
        import sys
        print(f"Warning: Failed to broadcast Socket.IO message: {e}", file=sys.stderr)


# ---------------------------------------------------------------------------
# GET /api/panggilan/loket -> daftar loket buka
# ---------------------------------------------------------------------------
@router.get("/loket")
def get_loket_buka(response: Response):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT loket.*, layanan.nama_layanan, layanan.kode_huruf
                FROM loket
                LEFT JOIN layanan ON layanan.id = loket.id_layanan
                WHERE loket.status_buka = 'buka'
                ORDER BY loket.id ASC
            """)
            rows = cursor.fetchall()
            return {
                "status": True,
                "data": [format_row(r) for r in rows],
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data loket buka: {str(e)}",
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /api/panggilan/call -> panggil antrian berikutnya + broadcast
# ---------------------------------------------------------------------------
@router.post("/call")
async def call_next(request: Request, payload: PanggilanCall, response: Response):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # 1. Cek loket
            cursor.execute("""
                SELECT id, id_layanan, nama_loket, status_buka
                FROM loket WHERE id = %s
            """, (payload.id_loket,))
            loket = cursor.fetchone()
            if not loket:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {"status": False, "message": "Loket tidak ditemukan"}

            if loket["status_buka"] != "buka":
                response.status_code = status.HTTP_409_CONFLICT
                return {"status": False, "message": "Loket sedang tidak buka"}

            # 2. Ambil tiket menunggu paling lama untuk layanan loket
            tanggal = datetime.date.today().strftime("%Y-%m-%d")
            cursor.execute("""
                SELECT * FROM antrian
                WHERE id_layanan = %s AND tanggal = %s AND status = 'menunggu'
                ORDER BY nomor_urut ASC LIMIT 1
            """, (loket["id_layanan"], tanggal))
            tiket = cursor.fetchone()

            if not tiket:
                return {
                    "status": False,
                    "message": "Tidak ada antrian menunggu untuk layanan ini.",
                }

            # 3. Update status -> dipanggil
            waktu_panggil = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                UPDATE antrian
                SET status = 'dipanggil', id_loket = %s, waktu_panggil = %s
                WHERE id = %s
            """, (payload.id_loket, waktu_panggil, tiket["id"]))

            # 4. Broadcast
            nomor = tiket["nomor_antrian"]
            keterangan = tiket.get("keterangan") or ""
            channel = _channel(payload.id_loket)
            await _publish(request, channel, nomor, keterangan)

            return {
                "status": True,
                "message": "Antrian berhasil dipanggil",
                "data": {
                    "id_loket": payload.id_loket,
                    "nama_loket": loket["nama_loket"],
                    "nomor_antrian": nomor,
                    "keterangan": keterangan,
                    "channel": channel,
                    "waktu_panggil": waktu_panggil,
                },
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal memproses panggilan: {str(e)}",
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /api/panggilan/recall -> broadcast ulang (tidak mengubah data)
# ---------------------------------------------------------------------------
@router.post("/recall")
async def recall(request: Request, payload: PanggilanRecall, response: Response):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, nama_loket FROM loket WHERE id = %s", (payload.id_loket,))
            loket = cursor.fetchone()
            if not loket:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {"status": False, "message": "Loket tidak ditemukan"}

            # Ambil keterangan terakhir untuk nomor tsb di loket ini (hari ini), kalau ada
            tanggal = datetime.date.today().strftime("%Y-%m-%d")
            cursor.execute("""
                SELECT keterangan FROM antrian
                WHERE nomor_antrian = %s AND id_loket = %s AND tanggal = %s
                ORDER BY waktu_panggil DESC LIMIT 1
            """, (payload.nomor, payload.id_loket, tanggal))
            tiket = cursor.fetchone()
            keterangan = (tiket and tiket.get("keterangan")) or ""

            channel = _channel(payload.id_loket)
            await _publish(request, channel, payload.nomor, keterangan)

            return {
                "status": True,
                "message": "Panggilan ulang berhasil disiarkan",
                "data": {
                    "id_loket": payload.id_loket,
                    "nama_loket": loket["nama_loket"],
                    "nomor_antrian": payload.nomor,
                    "keterangan": keterangan,
                    "channel": channel,
                    "waktu_panggil": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                },
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mem-broadcast panggilan ulang: {str(e)}",
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /api/panggilan/simpan -> panggil nomor tertentu (manual) + broadcast
# ---------------------------------------------------------------------------
@router.post("/simpan")
async def simpan(request: Request, payload: PanggilanSimpan, response: Response):
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # 1. Ambil antrian
            cursor.execute("SELECT * FROM antrian WHERE id = %s", (payload.id_antrian,))
            antrian_row = cursor.fetchone()
            if not antrian_row:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {"status": False, "message": "Antrian tidak ditemukan"}

            # 2. Ambil loket
            cursor.execute("""
                SELECT id, nama_loket, id_layanan FROM loket WHERE id = %s
            """, (payload.id_loket,))
            loket_row = cursor.fetchone()
            if not loket_row:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {"status": False, "message": "Loket tidak ditemukan"}

            # 3. Cocokkan layanan
            if int(antrian_row["id_layanan"]) != int(loket_row["id_layanan"]):
                response.status_code = status.HTTP_409_CONFLICT
                return {
                    "status": False,
                    "message": "Loket ini tidak melayani layanan antrian tersebut",
                }

            # 4. Tolak jika status final
            if antrian_row["status"] in ("selesai", "batal"):
                response.status_code = status.HTTP_409_CONFLICT
                return {
                    "status": False,
                    "message": "Antrian sudah selesai/batal dan tidak dapat dipanggil",
                    "data": format_row(antrian_row),
                }

            # 5. Cek apakah panggilan ulang
            is_ulang = antrian_row["status"] == "dipanggil"

            # 6. Update status -> dipanggil
            waktu_panggil = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                UPDATE antrian
                SET status = 'dipanggil', id_loket = %s, waktu_panggil = %s
                WHERE id = %s
            """, (payload.id_loket, waktu_panggil, payload.id_antrian))

            # 7. Broadcast
            nomor = antrian_row["nomor_antrian"]
            keterangan = antrian_row.get("keterangan") or ""
            channel = _channel(payload.id_loket)
            await _publish(request, channel, nomor, keterangan)

            msg = ("Panggilan ulang berhasil disimpan & disiarkan"
                   if is_ulang else "Panggilan berhasil disimpan & disiarkan")
            return {
                "status": True,
                "message": msg,
                "data": {
                    "id_antrian": payload.id_antrian,
                    "nomor_antrian": nomor,
                    "keterangan": keterangan,
                    "id_loket": payload.id_loket,
                    "nama_loket": loket_row["nama_loket"],
                    "waktu_panggil": waktu_panggil,
                    "is_ulang": is_ulang,
                    "channel": channel,
                },
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menyimpan panggilan: {str(e)}",
        }
    finally:
        conn.close()
