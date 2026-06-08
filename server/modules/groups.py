from typing import Optional
from fastapi import APIRouter, Response, status
from pydantic import BaseModel, Field
from .db import get_db_conn

# Pydantic schemas for request validation
class GroupCreate(BaseModel):
    name: str = Field(..., max_length=20, pattern=r"^[A-Za-z0-9_-]+$", description="Nama group alfanumerik, dash, dan underscore (wajib)")
    description: str = Field("", max_length=100, description="Keterangan group")
    bgcolor: str = Field("#607D8B", max_length=7, description="Warna label background")

class GroupUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=20, pattern=r"^[A-Za-z0-9_-]+$")
    description: Optional[str] = Field(None, max_length=100)
    bgcolor: Optional[str] = Field(None, max_length=7)

# API Router setup
router = APIRouter(prefix="/api/groups", tags=["Groups"])

ADMIN_GROUP_NAME = "admin"

@router.get("/")
def get_all_groups(response: Response):
    """
    GET api/groups -> list semua group
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM groups ORDER BY id ASC")
            rows = cursor.fetchall()
            return {
                "status": True,
                "data": [dict(row) for row in rows]
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data group: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/{id}")
def get_group_by_id(id: int, response: Response):
    """
    GET api/groups/{id} -> detail satu group
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT * FROM groups WHERE id = %s", (id,))
            row = cursor.fetchone()
            if not row:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Group tidak ditemukan"
                }
            return {
                "status": True,
                "data": dict(row)
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil detail group: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/users/{id}")
def get_group_users(id: int, response: Response):
    """
    GET api/groups/users/{id} -> list user yang tergabung dalam group {id}
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check if group exists
            cursor.execute("SELECT * FROM groups WHERE id = %s", (id,))
            group_row = cursor.fetchone()
            if not group_row:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Group tidak ditemukan"
                }
            
            # Fetch users assigned to this group (excluding sensitive password/salt fields)
            cursor.execute("""
                SELECT u.id, u.ip_address, u.username, u.email, u.active, 
                       u.first_name, u.last_name, u.company, u.phone, u.created_on, u.last_login 
                FROM users_groups ug 
                INNER JOIN users u ON u.id = ug.user_id 
                WHERE ug.group_id = %s
                ORDER BY u.username ASC
            """, (id,))
            user_rows = cursor.fetchall()
            
            return {
                "status": True,
                "group": dict(group_row),
                "data": [dict(ur) for ur in user_rows]
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil user group: {str(e)}"
        }
    finally:
        conn.close()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_group(group_data: GroupCreate, response: Response):
    """
    POST api/groups -> tambah group baru
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check duplicate name
            cursor.execute("SELECT id FROM groups WHERE name = %s", (group_data.name,))
            if cursor.fetchone():
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Nama group sudah terdaftar"
                }
            
            # Insert group
            sql = """
            INSERT INTO groups (name, description, bgcolor)
            VALUES (%s, %s, %s)
            """
            cursor.execute(sql, (group_data.name, group_data.description, group_data.bgcolor))
            new_id = cursor.lastrowid
            
            # Fetch inserted data
            cursor.execute("SELECT * FROM groups WHERE id = %s", (new_id,))
            row = cursor.fetchone()
            
            return {
                "status": True,
                "message": "Group berhasil ditambahkan",
                "data": dict(row)
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menambahkan group: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/{id}")
def update_group(id: int, group_data: GroupUpdate, response: Response):
    """
    PUT api/groups/{id} -> update group (partial)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check if group exists
            cursor.execute("SELECT * FROM groups WHERE id = %s", (id,))
            existing = cursor.fetchone()
            if not existing:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Group tidak ditemukan"
                }
            
            existing = dict(existing)
            
            # Filter fields to update
            update_fields = group_data.model_dump(exclude_unset=True)
            if not update_fields:
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Tidak ada field yang diupdate"
                }
            
            # Check admin protection rules
            if "name" in update_fields:
                new_name = update_fields["name"]
                if existing["name"] == ADMIN_GROUP_NAME and new_name != ADMIN_GROUP_NAME:
                    response.status_code = status.HTTP_403_FORBIDDEN
                    return {
                        "status": False,
                        "message": f"Nama group '{ADMIN_GROUP_NAME}' tidak boleh diubah"
                    }
                
                # Check uniqueness of new name
                if new_name != existing["name"]:
                    cursor.execute("SELECT id FROM groups WHERE name = %s AND id != %s", (new_name, id))
                    if cursor.fetchone():
                        response.status_code = status.HTTP_400_BAD_REQUEST
                        return {
                            "status": False,
                            "message": "Nama group sudah terdaftar"
                        }
            
            # Perform update
            fields = []
            values = []
            for k, v in update_fields.items():
                fields.append(f"`{k}` = %s")
                values.append(v)
            values.append(id)
            
            sql = f"UPDATE groups SET {', '.join(fields)} WHERE id = %s"
            cursor.execute(sql, tuple(values))
            
            # Fetch updated row
            cursor.execute("SELECT * FROM groups WHERE id = %s", (id,))
            updated_row = cursor.fetchone()
            
            return {
                "status": True,
                "message": "Group berhasil diupdate",
                "data": dict(updated_row)
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengupdate group: {str(e)}"
        }
    finally:
        conn.close()

@router.delete("/{id}")
def delete_group(id: int, response: Response):
    """
    DELETE api/groups/{id} -> hapus group
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check if group exists
            cursor.execute("SELECT * FROM groups WHERE id = %s", (id,))
            existing = cursor.fetchone()
            if not existing:
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "Group tidak ditemukan"
                }
            
            existing = dict(existing)
            
            # Check admin protection rules
            if existing["name"] == ADMIN_GROUP_NAME:
                response.status_code = status.HTTP_403_FORBIDDEN
                return {
                    "status": False,
                    "message": f"Group '{ADMIN_GROUP_NAME}' tidak boleh dihapus"
                }
            
            # Delete row
            cursor.execute("DELETE FROM groups WHERE id = %s", (id,))
            return {
                "status": True,
                "message": "Group berhasil dihapus"
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menghapus group: {str(e)}"
        }
    finally:
        conn.close()
