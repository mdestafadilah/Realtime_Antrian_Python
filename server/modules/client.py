from typing import List, Optional
from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field
from enum import Enum
from database.dbmysql import get_db_conn

# Enum for is_active field
class IsActiveEnum(str, Enum):
    ya = "ya"
    tidak = "tidak"

# Pydantic schemas for request validation
class ClientCreate(BaseModel):
    nama_client: str = Field(..., min_length=1, max_length=50, description="Nama client, misal: TV Lobby, TV Poli")
    is_active: IsActiveEnum = Field(IsActiveEnum.tidak, description="Status aktif client")
    id_lokets: Optional[List[int]] = Field(default=None, description="Daftar ID loket yang di-assign ke client ini")

class ClientUpdate(BaseModel):
    nama_client: Optional[str] = Field(None, min_length=1, max_length=50)
    is_active: Optional[IsActiveEnum] = None
    id_lokets: Optional[List[int]] = None

class ClientStatusUpdate(BaseModel):
    is_active: IsActiveEnum = Field(..., description="Status aktif client yang baru")

class ClientLoketsUpdate(BaseModel):
    id_lokets: List[int] = Field(..., description="Daftar ID loket untuk sinkronisasi assignment")

# API Router setup
router = APIRouter(prefix="/api/client", tags=["Client"])

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

# Helper functions to query client details
def get_client_by_id_db(conn, id: int):
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM client WHERE id = %s", (id,))
        row = cursor.fetchone()
        if not row:
            return None

        d = format_row(row)

        # Query lokets assigned to this client
        cursor.execute("""
            SELECT l.id, l.id_layanan, l.nama_loket, l.status_buka,
                   la.nama_layanan, la.kode_huruf
            FROM client_loket cl
            INNER JOIN loket l ON l.id = cl.id_loket
            LEFT JOIN layanan la ON la.id = l.id_layanan
            WHERE cl.id_client = %s
            ORDER BY l.id ASC
        """, (id,))
        loket_rows = cursor.fetchall()
        d["lokets"] = [dict(lr) for lr in loket_rows]
        return d

def get_all_clients_db(conn):
    with conn.cursor() as cursor:
        cursor.execute("SELECT * FROM client ORDER BY id ASC")
        rows = cursor.fetchall()
        if not rows:
            return []

        data = [format_row(row) for row in rows]
        client_ids = [d["id"] for d in data]

        if client_ids:
            format_strings = ','.join(['%s'] * len(client_ids))
            query = f"""
                SELECT cl.id_client, l.id, l.id_layanan, l.nama_loket, l.status_buka,
                       la.nama_layanan, la.kode_huruf
                FROM client_loket cl
                INNER JOIN loket l ON l.id = cl.id_loket
                LEFT JOIN layanan la ON la.id = l.id_layanan
                WHERE cl.id_client IN ({format_strings})
                ORDER BY l.id ASC
            """
            cursor.execute(query, tuple(client_ids))
            loket_rows = cursor.fetchall()

            lokets_by_client = {}
            for l_row in loket_rows:
                l_dict = dict(l_row)
                cid = l_dict.pop("id_client")
                if cid not in lokets_by_client:
                    lokets_by_client[cid] = []
                lokets_by_client[cid].append(l_dict)

            for d in data:
                d["lokets"] = lokets_by_client.get(d["id"], [])
        else:
            for d in data:
                d["lokets"] = []

        return data

def validate_loket_ids(cursor, loket_ids: List[int]):
    if not loket_ids:
        return []
    format_strings = ','.join(['%s'] * len(loket_ids))
    cursor.execute(f"SELECT id FROM loket WHERE id IN ({format_strings})", tuple(loket_ids))
    existing = {row["id"] for row in cursor.fetchall()}
    invalid = [lid for lid in loket_ids if lid not in existing]
    return invalid

@router.get("/")
def get_all_client(response: Response):
    """
    GET api/client -> list semua client (termasuk lokets)
    """
    conn = get_db_conn()
    try:
        data = get_all_clients_db(conn)
        return {
            "status": True,
            "data": data
        }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data client: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/active")
def get_client_active(response: Response):
    """
    GET api/client/active -> list client yang sedang aktif (is_active = 'ya')
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM client WHERE is_active = 'ya' ORDER BY id ASC")
            rows = cursor.fetchall()
            data = [format_row(row) for row in rows]
            client_ids = [d["id"] for d in data]

            if client_ids:
                format_strings = ','.join(['%s'] * len(client_ids))
                query = f"""
                    SELECT cl.id_client, l.id, l.id_layanan, l.nama_loket, l.status_buka,
                           la.nama_layanan, la.kode_huruf
                    FROM client_loket cl
                    INNER JOIN loket l ON l.id = cl.id_loket
                    LEFT JOIN layanan la ON la.id = l.id_layanan
                    WHERE cl.id_client IN ({format_strings})
                    ORDER BY l.id ASC
                """
                cursor.execute(query, tuple(client_ids))
                loket_rows = cursor.fetchall()

                lokets_by_client = {}
                for l_row in loket_rows:
                    l_dict = dict(l_row)
                    cid = l_dict.pop("id_client")
                    lokets_by_client.setdefault(cid, []).append(l_dict)

                for d in data:
                    d["lokets"] = lokets_by_client.get(d["id"], [])
            else:
                for d in data:
                    d["lokets"] = []

            return {
                "status": True,
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data client aktif: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/{id}")
def get_client_by_id(id: int, response: Response):
    """
    GET api/client/{id} -> detail satu client (termasuk lokets)
    """
    conn = get_db_conn()
    try:
        data = get_client_by_id_db(conn, id)
        if not data:
            response.status_code = status.HTTP_404_NOT_FOUND
            return {
                "status": False,
                "message": "Client tidak ditemukan"
            }
        return {
            "status": True,
            "data": data
        }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil detail client: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/lokets/{id}")
def get_client_lokets(id: int, response: Response):
    """
    GET api/client/lokets/{id} -> daftar loket yang ter-assign ke client
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM client WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Client tidak ditemukan"
                }

            cursor.execute("""
                SELECT l.id, l.id_layanan, l.nama_loket, l.status_buka,
                       la.nama_layanan, la.kode_huruf
                FROM client_loket cl
                INNER JOIN loket l ON l.id = cl.id_loket
                LEFT JOIN layanan la ON la.id = l.id_layanan
                WHERE cl.id_client = %s
                ORDER BY l.id ASC
            """, (id,))
            loket_rows = cursor.fetchall()
            return {
                "status": True,
                "id_client": id,
                "data": [dict(lr) for lr in loket_rows]
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil loket client: {str(e)}"
        }
    finally:
        conn.close()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_client(client: ClientCreate, response: Response):
    """
    POST api/client -> tambah client baru (opsional: id_lokets[])
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check for duplicate nama_client
            cursor.execute("SELECT id FROM client WHERE nama_client = %s", (client.nama_client,))
            if cursor.fetchone():
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Gagal menambah client (nama_client sudah dipakai)"
                }

            # Validate loket IDs if provided
            loket_ids = list(set(client.id_lokets)) if client.id_lokets else []
            if loket_ids:
                invalid_ids = validate_loket_ids(cursor, loket_ids)
                if invalid_ids:
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "id_lokets mengandung loket yang tidak valid",
                        "invalid": invalid_ids
                    }

            # Insert client
            sql = """
            INSERT INTO client (nama_client, is_active)
            VALUES (%s, %s)
            """
            cursor.execute(sql, (client.nama_client, client.is_active.value))
            new_id = cursor.lastrowid

            # Sync lokets
            if loket_ids:
                for lid in loket_ids:
                    cursor.execute(
                        "INSERT INTO client_loket (id_client, id_loket) VALUES (%s, %s)",
                        (new_id, lid)
                    )

            data = get_client_by_id_db(conn, new_id)
            return {
                "status": True,
                "message": "Client berhasil ditambahkan",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menambahkan client: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/{id}")
def update_client(id: int, client: ClientUpdate, response: Response):
    """
    PUT api/client/{id} -> update sebagian field client (nama_client, is_active, id_lokets)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check if client exists
            cursor.execute("SELECT * FROM client WHERE id = %s", (id,))
            existing = cursor.fetchone()
            if not existing:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Client tidak ditemukan"
                }

            update_data = client.model_dump(exclude_unset=True)
            if not update_data:
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Tidak ada field yang diupdate"
                }

            # Validate nama_client uniqueness if changed
            new_nama = update_data.get("nama_client")
            if new_nama and new_nama != existing["nama_client"]:
                cursor.execute(
                    "SELECT id FROM client WHERE nama_client = %s AND id != %s",
                    (new_nama, id)
                )
                if cursor.fetchone():
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "Gagal mengupdate client (nama_client sudah dipakai)"
                    }

            # Validate loket IDs if provided
            id_lokets = update_data.pop("id_lokets", None)
            if id_lokets is not None:
                loket_ids = list(set(id_lokets))
                if loket_ids:
                    invalid_ids = validate_loket_ids(cursor, loket_ids)
                    if invalid_ids:
                        response.status_code = status.HTTP_400_BAD_REQUEST
                        return {
                            "status": False,
                            "message": "id_lokets mengandung loket yang tidak valid",
                            "invalid": invalid_ids
                        }
            else:
                loket_ids = None

            # Build update SQL for plain fields
            if update_data:
                fields = []
                values = []
                for k, v in update_data.items():
                    fields.append(f"`{k}` = %s")
                    if isinstance(v, IsActiveEnum):
                        values.append(v.value)
                    else:
                        values.append(v)
                values.append(id)
                sql = f"UPDATE client SET {', '.join(fields)} WHERE id = %s"
                cursor.execute(sql, tuple(values))

            # Sync lokets jika dikirim
            if loket_ids is not None:
                cursor.execute("DELETE FROM client_loket WHERE id_client = %s", (id,))
                for lid in loket_ids:
                    cursor.execute(
                        "INSERT INTO client_loket (id_client, id_loket) VALUES (%s, %s)",
                        (id, lid)
                    )

            data = get_client_by_id_db(conn, id)
            return {
                "status": True,
                "message": "Client berhasil diupdate",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengupdate client: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/status/{id}")
def update_client_status(id: int, status_update: ClientStatusUpdate, response: Response):
    """
    PUT api/client/status/{id} -> update status aktif (ya/tidak)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM client WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Client tidak ditemukan"
                }

            cursor.execute(
                "UPDATE client SET is_active = %s WHERE id = %s",
                (status_update.is_active.value, id)
            )
            data = get_client_by_id_db(conn, id)
            return {
                "status": True,
                "message": "Status client berhasil diupdate",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengupdate status client: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/lokets/{id}")
def update_client_lokets(id: int, lokets_update: ClientLoketsUpdate, response: Response):
    """
    PUT api/client/lokets/{id} -> sinkronisasi loket client (replace-all)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM client WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Client tidak ditemukan"
                }

            loket_ids = list(set(lokets_update.id_lokets)) if lokets_update.id_lokets else []
            if loket_ids:
                invalid_ids = validate_loket_ids(cursor, loket_ids)
                if invalid_ids:
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "id_lokets mengandung loket yang tidak valid",
                        "invalid": invalid_ids
                    }

            # Replace all
            cursor.execute("DELETE FROM client_loket WHERE id_client = %s", (id,))
            if loket_ids:
                for lid in loket_ids:
                    cursor.execute(
                        "INSERT INTO client_loket (id_client, id_loket) VALUES (%s, %s)",
                        (id, lid)
                    )

            data = get_client_by_id_db(conn, id)
            return {
                "status": True,
                "message": "Loket client berhasil disinkronkan",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menyinkronkan loket client: {str(e)}"
        }
    finally:
        conn.close()

@router.delete("/{id}")
def delete_client(id: int, response: Response):
    """
    DELETE api/client/{id} -> hapus client (cascade ke client_loket)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM client WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Client tidak ditemukan"
                }

            cursor.execute("DELETE FROM client WHERE id = %s", (id,))
            return {
                "status": True,
                "message": "Client berhasil dihapus"
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menghapus client: {str(e)}"
        }
    finally:
        conn.close()
