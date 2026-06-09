import re
import time
from typing import List, Optional
import bcrypt
from fastapi import APIRouter, Response, Request, status
from pydantic import BaseModel, Field
from database.dbmysql import get_db_conn

# Pydantic schemas for request validation
class UserCreate(BaseModel):
    email: str = Field(..., description="Email user (wajib)")
    password: str = Field(..., min_length=6, description="Password user (wajib, min 6 karakter)")
    first_name: Optional[str] = Field(None, max_length=50)
    last_name: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    company: Optional[str] = Field(None, max_length=100)
    username: Optional[str] = Field(None, max_length=100)
    groups: Optional[List[int]] = Field(default=None, description="Array ID group")

class UserUpdate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=50)
    last_name: Optional[str] = Field(None, max_length=50)
    phone: Optional[str] = Field(None, max_length=20)
    company: Optional[str] = Field(None, max_length=100)
    password: Optional[str] = Field(None, min_length=6)
    groups: Optional[List[int]] = None

# API Router setup
router = APIRouter(prefix="/api/users", tags=["Users"])

# Helper function to validate email format
def is_valid_email(email: str) -> bool:
    return bool(re.match(r"[^@]+@[^@]+\.[^@]+", email))

# Hashing utilities
def hash_password(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

# Helper function to query user details (excluding sensitive columns)
def get_user_by_id_db(conn, id: int):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT id, ip_address, username, email, active, 
                   first_name, last_name, company, phone, created_on, last_login 
            FROM users 
            WHERE id = %s
        """, (id,))
        row = cursor.fetchone()
        if not row:
            return None
            
        d = dict(row)
        
        # Query groups assigned to this user
        cursor.execute("""
            SELECT g.id, g.name, g.description, g.bgcolor 
            FROM users_groups ug 
            INNER JOIN groups g ON g.id = ug.group_id 
            WHERE ug.user_id = %s
            ORDER BY g.name ASC
        """, (id,))
        group_rows = cursor.fetchall()
        d["groups"] = [dict(g) for g in group_rows]
        return d

def get_all_users_db(conn):
    with conn.cursor() as cursor:
        cursor.execute("""
            SELECT id, ip_address, username, email, active, 
                   first_name, last_name, company, phone, created_on, last_login 
            FROM users 
            ORDER BY id ASC
        """)
        rows = cursor.fetchall()
        if not rows:
            return []
            
        data = [dict(row) for row in rows]
        user_ids = [d["id"] for d in data]
        
        if user_ids:
            format_strings = ','.join(['%s'] * len(user_ids))
            query = f"""
                SELECT ug.user_id, g.id, g.name, g.description, g.bgcolor 
                FROM users_groups ug 
                INNER JOIN groups g ON g.id = ug.group_id 
                WHERE ug.user_id IN ({format_strings})
                ORDER BY g.name ASC
            """
            cursor.execute(query, tuple(user_ids))
            group_rows = cursor.fetchall()
            
            groups_by_user = {}
            for g_row in group_rows:
                g_dict = dict(g_row)
                uid = g_dict.pop("user_id")
                if uid not in groups_by_user:
                    groups_by_user[uid] = []
                groups_by_user[uid].append(g_dict)
                
            for d in data:
                d["groups"] = groups_by_user.get(d["id"], [])
        else:
            for d in data:
                d["groups"] = []
                
        return data

def validate_group_ids(cursor, group_ids: List[int]):
    if not group_ids:
        return []
    format_strings = ','.join(['%s'] * len(group_ids))
    cursor.execute(f"SELECT id FROM groups WHERE id IN ({format_strings})", tuple(group_ids))
    existing = {row["id"] for row in cursor.fetchall()}
    invalid = [gid for gid in group_ids if gid not in existing]
    return invalid

@router.get("/")
def get_all_users(response: Response):
    """
    GET api/users -> list semua user + groups
    """
    conn = get_db_conn()
    try:
        data = get_all_users_db(conn)
        return {
            "status": True,
            "data": data
        }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil data user: {str(e)}"
        }
    finally:
        conn.close()

@router.get("/{id}")
def get_user_by_id(id: int, response: Response):
    """
    GET api/users/{id} -> detail user + groups
    """
    conn = get_db_conn()
    try:
        data = get_user_by_id_db(conn, id)
        if not data:
            response.status_code = status.HTTP_404_NOT_FOUND
            return {
                "status": False,
                "message": "User tidak ditemukan"
            }
        return {
            "status": True,
            "data": data
        }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengambil detail user: {str(e)}"
        }
    finally:
        conn.close()

@router.post("/", status_code=status.HTTP_201_CREATED)
def create_user(request: Request, user_data: UserCreate, response: Response):
    """
    POST api/users -> tambah user baru
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # 1. Validate email format
            email = user_data.email.strip()
            if not is_valid_email(email):
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Format email tidak valid"
                }
            
            # 2. Check if email already exists
            cursor.execute("SELECT id FROM users WHERE email = %s", (email,))
            if cursor.fetchone():
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Email sudah terdaftar"
                }
            
            # 3. Validate groups if provided
            group_ids = list(set(user_data.groups)) if user_data.groups else []
            if group_ids:
                invalid_ids = validate_group_ids(cursor, group_ids)
                if invalid_ids:
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "groups mengandung ID group yang tidak valid",
                        "invalid": invalid_ids
                    }
            
            # 4. Generate default username if not provided
            username = user_data.username.strip() if user_data.username else ""
            if not username:
                username = f"{user_data.first_name or ''} {user_data.last_name or ''}".strip().lower()
                if not username:
                    username = email.split('@')[0].lower()
            
            # Check if username exists
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            if cursor.fetchone():
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Username sudah terdaftar"
                }

            # 5. Insert user record
            ip_address = request.client.host if request.client else "127.0.0.1"
            hashed_pwd = hash_password(user_data.password)
            created_on = int(time.time())
            
            sql = """
            INSERT INTO users (ip_address, username, password, email, created_on, active, first_name, last_name, company, phone)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                ip_address,
                username,
                hashed_pwd,
                email,
                created_on,
                1, # default active = 1
                user_data.first_name,
                user_data.last_name,
                user_data.company,
                user_data.phone
            ))
            new_id = cursor.lastrowid
            
            # 6. Assign groups
            if group_ids:
                for gid in group_ids:
                    cursor.execute("INSERT INTO users_groups (user_id, group_id) VALUES (%s, %s)", (new_id, gid))
            
            # 7. Fetch inserted data
            data = get_user_by_id_db(conn, new_id)
            return {
                "status": True,
                "message": "User berhasil ditambahkan",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menambahkan user: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/{id}")
def update_user(id: int, user_data: UserUpdate, response: Response):
    """
    PUT api/users/{id} -> update user (partial)
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            # Check if user exists
            cursor.execute("SELECT id FROM users WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "User tidak ditemukan"
                }
            
            # Filter fields to update
            update_fields = user_data.model_dump(exclude_unset=True)
            groups = update_fields.pop("groups", None)
            update_groups = groups is not None
            
            if not update_fields and not update_groups:
                response.status_code = status.HTTP_400_BAD_REQUEST
                return {
                    "status": False,
                    "message": "Tidak ada field yang diupdate"
                }
            
            # Validate groups if provided
            group_ids = list(set(groups)) if groups else []
            if update_groups and group_ids:
                invalid_ids = validate_group_ids(cursor, group_ids)
                if invalid_ids:
                    response.status_code = status.HTTP_400_BAD_REQUEST
                    return {
                        "status": False,
                        "message": "groups mengandung ID group yang tidak valid",
                        "invalid": invalid_ids
                    }
            
            # Hash password if updated
            if "password" in update_fields:
                pwd = update_fields.pop("password")
                if pwd:
                    update_fields["password"] = hash_password(pwd)
            
            # Perform fields update
            if update_fields:
                fields = []
                values = []
                for k, v in update_fields.items():
                    fields.append(f"`{k}` = %s")
                    values.append(v)
                values.append(id)
                
                sql = f"UPDATE users SET {', '.join(fields)} WHERE id = %s"
                cursor.execute(sql, tuple(values))
            
            # Perform groups sync (replace all)
            if update_groups:
                cursor.execute("DELETE FROM users_groups WHERE user_id = %s", (id,))
                if group_ids:
                    for gid in group_ids:
                        cursor.execute("INSERT INTO users_groups (user_id, group_id) VALUES (%s, %s)", (id, gid))
            
            data = get_user_by_id_db(conn, id)
            return {
                "status": True,
                "message": "User berhasil diupdate",
                "data": data
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengupdate user: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/activate/{id}")
def activate_user(id: int, response: Response):
    """
    PUT api/users/activate/{id} -> aktifkan user
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "User tidak ditemukan"
                }
            
            cursor.execute("UPDATE users SET active = 1 WHERE id = %s", (id,))
            return {
                "status": True,
                "message": "User berhasil diaktifkan"
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal mengaktifkan user: {str(e)}"
        }
    finally:
        conn.close()

@router.put("/deactivate/{id}")
def deactivate_user(id: int, response: Response):
    """
    PUT api/users/deactivate/{id} -> nonaktifkan user
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "User tidak ditemukan"
                }
            
            cursor.execute("UPDATE users SET active = 0 WHERE id = %s", (id,))
            return {
                "status": True,
                "message": "User berhasil dinonaktifkan"
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menonaktifkan user: {str(e)}"
        }
    finally:
        conn.close()

@router.delete("/{id}")
def delete_user(id: int, response: Response):
    """
    DELETE api/users/{id} -> hapus user
    """
    conn = get_db_conn()
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE id = %s", (id,))
            if not cursor.fetchone():
                response.status_code = status.HTTP_404_NOT_FOUND
                return {
                    "status": False,
                    "message": "User tidak ditemukan"
                }
            
            cursor.execute("DELETE FROM users WHERE id = %s", (id,))
            return {
                "status": True,
                "message": "User berhasil dihapus"
            }
    except Exception as e:
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {
            "status": False,
            "message": f"Gagal menghapus user: {str(e)}"
        }
    finally:
        conn.close()
