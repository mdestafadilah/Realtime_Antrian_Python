from typing import List, Optional
from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field
from enum import Enum
from .db import get_db_conn

# Enum for status_buka field
class StatusBukaEnum(str, Enum):
    buka = "buka"
    tutup = "tutup"

# Pydantic schemas for request validation
class LoketCreate(BaseModel):
    id_layanan: int = Field(..., description="ID layanan yang dilayani oleh loket ini")
    nama_loket: str = Field(..., min_length=1, max_length=50, description="Nama loket, misal: Loket 01, Kasir 01")
    status_buka: StatusBukaEnum = Field(StatusBukaEnum.tutup, description="Status buka/tutup loket")
    id_users: Optional[List[int]] = Field(default=None, description="Daftar ID user yang di-assign ke loket ini")

class LoketStatusUpdate(BaseModel):
    status_buka: StatusBukaEnum = Field(..., description="Status buka/tutup loket yang baru")

class LoketUsersUpdate(BaseModel):
    id_users: List[int] = Field(..., description="Daftar ID user untuk sinkronisasi assignment")

# API Router setup
router = APIRouter(prefix="/api/loket", tags=["Loket"])

# Helper function to format row dictionary
def format_row(row):
    if not row:
        return None
    res = dict(row)
    # Convert datetime objects to string 'YYYY-MM-DD HH:MM:SS'
    for k, v in res.items():
        if hasattr(v, 'strftime'):
            res[k] = v.strftime('%Y-%m-%d %H:%M:%S')
    return res

# Helper functions to query loket details
def get_counter_by_id_db(conn, id: int):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT loket.*, layanan.nama_layanan, layanan.kode_huruf 
            FROM loket 
            LEFT JOIN layanan ON layanan.id = loket.id_layanan 
            WHERE loket.id = %s
        """, (id,))
        row = cursor.fetchone()
        if not row:
            return None
            
        d = format_row(row)
        
        # Query users assigned to this counter
        cursor.execute("""
            SELECT u.id, u.username, u.first_name, u.last_name, u.email 
            FROM loket_user lu 
            INNER JOIN users u ON u.id = lu.id_user 
            WHERE lu.id_loket = %s
            ORDER BY u.username ASC
        """, (id,))
        user_rows = cursor.fetchall()
        d["users"] = [dict(ur) for ur in user_rows]
        return d

def get_all_counters_db(conn):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT loket.*, layanan.nama_layanan, layanan.kode_huruf 
            FROM loket 
            LEFT JOIN layanan ON layanan.id = loket.id_layanan 
            ORDER BY loket.id ASC
        """)
        rows = cursor.fetchall()
        if not rows:
            return []
            
        data = [format_row(row) for row in rows]
        loket_ids = [d["id"] for d in data]
        
        if loket_ids:
            format_strings = ','.join(['%s'] * len(loket_ids))
            query = f"""
                SELECT lu.id_loket, u.id, u.username, u.first_name, u.last_name, u.email 
                FROM loket_user lu 
                INNER JOIN users u ON u.id = lu.id_user 
                WHERE lu.id_loket IN ({format_strings})
                ORDER BY u.username ASC
            """
            cursor.execute(query, tuple(loket_ids))
            user_rows = cursor.fetchall()
            
            users_by_loket = {}
            for u_row in user_rows:
                u_dict = dict(u_row)
                lid = u_dict.pop("id_loket")
                if lid not in users_by_loket:
                    users_by_loket[lid] = []
                users_by_loket[lid].append(u_dict)
                
            for d in data:
                d["users"] = users_by_loket.get(d["id"], [])
        else:
            for d in data:
                d["users"] = []
                
        return data

def validate_user_ids(cursor, user_ids: List[int]):
    if not user_ids:
        return []
    format_strings = ','.join(['%s'] * len(user_ids))
    cursor.execute(f"SELECT id FROM users WHERE id IN ({format_strings})", tuple(user_ids))
    existing = {row["id"] for row in cursor.fetchall()}
    invalid = [uid for uid in user_ids if uid not in existing]
    return invalid

@router.get("/")
def get_all_loket(response: Response):
    """
    GET api/loket -> list semua loket (termasuk users)
    """
    conn = get_db_conn()
    try:
        data = get_all_counters_db(conn)
        return {
            "status": True,
            "data": data
        }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data loket: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/buka")
def get_loket_buka(response: Response, with_last: int = 0, tanggal: Optional[str] = None):
    """
    GET api/loket/buka -> list loket yang sedang buka
    Query: ?with_last=1 untuk menyertakan nomor antrian terakhir hari ini per loket
           ?tanggal=YYYY-MM-DD (format tanggal kustom)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            if with_last == 1:
                if not tanggal:
                    import datetime
                    tanggal = datetime.date.today().strftime('%Y-%m-%d')
                
                query = """
                    SELECT loket.*, layanan.nama_layanan, layanan.kode_huruf,
                    (SELECT a.nomor_antrian FROM antrian a 
                     WHERE a.id_loket = loket.id 
                       AND a.tanggal = %s 
                       AND a.waktu_panggil IS NOT NULL 
                     ORDER BY a.waktu_panggil DESC LIMIT 1) AS nomor_terakhir,
                    (SELECT a.keterangan FROM antrian a 
                     WHERE a.id_loket = loket.id 
                       AND a.tanggal = %s 
                       AND a.waktu_panggil IS NOT NULL 
                     ORDER BY a.waktu_panggil DESC LIMIT 1) AS keterangan_terakhir
                    FROM loket 
                    LEFT JOIN layanan ON layanan.id = loket.id_layanan 
                    WHERE loket.status_buka = 'buka' 
                    ORDER BY loket.id ASC
                """
                cursor.execute(query, (tanggal, tanggal))
            else:
                query = """
                    SELECT loket.*, layanan.nama_layanan, layanan.kode_huruf, layanan.show_welcome 
                    FROM loket 
                    LEFT JOIN layanan ON layanan.id = loket.id_layanan 
                    WHERE loket.status_buka = 'buka'
                    ORDER BY loket.id ASC
                """
                cursor.execute(query)
                
            rows = cursor.fetchall()
            data = [format_row(row) for row in rows]
            return {
                "status": True,
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data loket buka: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/{id}")
def get_loket_by_id(id: int, response: Response):
    """
    GET api/loket/{id} -> detail satu loket (termasuk users)
    """
    conn = get_db_conn()
    try:
        data = get_counter_by_id_db(conn, id)
        if not data:
            response.status_code = status.HTTP_404_NOT_FOUND
            return {
                "status": False,
                "message": "Loket tidak ditemukan"
            }
        return {
            "status": True,
            "data": data
        }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil detail loket: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/users/{id}")
def get_loket_users(id: int, response: Response):
    """
    GET api/loket/users/{id} -> daftar user yang ter-assign ke loket
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM loket WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Loket tidak ditemukan"
                }
            
            cursor.execute("""
                SELECT u.id, u.username, u.first_name, u.last_name, u.email 
                FROM loket_user lu 
                INNER JOIN users u ON u.id = lu.id_user 
                WHERE lu.id_loket = %s
                ORDER BY u.username ASC
            """, (id,))
            user_rows = cursor.fetchall()
            return {
                "status": True,
                "id_loket": id,
                "data": [dict(ur) for ur in user_rows]
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil user loket: {str(e)}"
        }
    finally:
        conn.close()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_loket(loket: LoketCreate, response: Response):
    """
    POST api/loket -> tambah loket baru (opsional: id_users[])
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Validate id_layanan exists
            cursor.execute("SELECT id FROM layanan WHERE id = %s", (loket.id_layanan,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "id_layanan tidak valid / layanan tidak ditemukan"
                }
            
            # Validate user IDs if provided
            user_ids = list(set(loket.id_users)) if loket.id_users else []
            if user_ids:
                invalid_ids = validate_user_ids(cursor, user_ids)
                if invalid_ids:
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "id_users mengandung user yang tidak valid",
                        "invalid": invalid_ids
                    }
            
            # Insert Loket
            sql = """
            INSERT INTO loket (id_layanan, nama_loket, status_buka)
            VALUES (%s, %s, %s)
            """
            cursor.execute(sql, (loket.id_layanan, loket.nama_loket, loket.status_buka.value))
            new_id = cursor.lastrowid
            
            # Sync users
            if user_ids:
                for uid in user_ids:
                    cursor.execute("INSERT INTO loket_user (id_loket, id_user) VALUES (%s, %s)", (new_id, uid))
            
            # Fetch inserted data
            data = get_counter_by_id_db(conn, new_id)
            return {
                "status": True,
                "message": "Loket berhasil ditambahkan",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menambahkan loket: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/status/{id}")
def update_loket_status(id: int, status_update: LoketStatusUpdate, response: Response):
    """
    PUT api/loket/status/{id} -> update status buka/tutup
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM loket WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Loket tidak ditemukan"
                }
            
            cursor.execute("UPDATE loket SET status_buka = %s WHERE id = %s", (status_update.status_buka.value, id))
            data = get_counter_by_id_db(conn, id)
            return {
                "status": True,
                "message": "Status loket berhasil diupdate",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengupdate status loket: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/users/{id}")
def update_loket_users(id: int, users_update: LoketUsersUpdate, response: Response):
    """
    PUT api/loket/users/{id} -> sinkronisasi user loket (replace-all)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM loket WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Loket tidak ditemukan"
                }
            
            user_ids = list(set(users_update.id_users)) if users_update.id_users else []
            if user_ids:
                invalid_ids = validate_user_ids(cursor, user_ids)
                if invalid_ids:
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "id_users mengandung user yang tidak valid",
                        "invalid": invalid_ids
                    }
            
            # Delete existing
            cursor.execute("DELETE FROM loket_user WHERE id_loket = %s", (id,))
            
            # Sync new
            if user_ids:
                for uid in user_ids:
                    cursor.execute("INSERT INTO loket_user (id_loket, id_user) VALUES (%s, %s)", (id, uid))
            
            data = get_counter_by_id_db(conn, id)
            return {
                "status": True,
                "message": "User loket berhasil disinkronkan",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menyinkronkan user loket: {str(e)}"
        }
    finally:
        conn.close()

@router.delete("/{id}")
def delete_loket(id: int, response: Response):
    """
    DELETE api/loket/{id} -> hapus loket
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM loket WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Loket tidak ditemukan"
                }
            
            cursor.execute("DELETE FROM loket WHERE id = %s", (id,))
            return {
                "status": True,
                "message": "Loket berhasil dihapus"
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menghapus loket: {str(e)}"
        }
    finally:
        conn.close()
