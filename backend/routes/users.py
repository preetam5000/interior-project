from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, EmailStr, Field
from core.config import ROLES
from core.db import db, new_id, now_iso, NO_ID
from core.security import ADMIN_ONLY, hash_password
from core.tenancy import tenant_query
from routes.auth import public_user
from services.notification_service import log_activity

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    name: str = Field(min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)
    role: str = "designer"


class UserUpdate(BaseModel):
    role: str | None = None
    name: str | None = None


@router.get("")
async def list_users(admin: dict = Depends(ADMIN_ONLY)):
    users = await db.users.find(
        tenant_query(admin["company_id"]),
        {**NO_ID, "password_hash": 0},
    ).sort("created_at", 1).to_list(500)
    return [public_user(u) for u in users]


@router.post("")
async def create_user(body: UserCreate, admin: dict = Depends(ADMIN_ONLY)):
    if body.role not in ROLES:
        raise HTTPException(400, "Invalid role")
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already in use")
    user = {"id": new_id(), "company_id": admin["company_id"], "email": email, "name": body.name, "role": body.role,
            "password_hash": hash_password(body.password), "created_at": now_iso()}
    await db.users.insert_one(dict(user))
    await log_activity("user_created", f"{admin['name']} added {body.name} as {body.role}", admin)
    return public_user(user)


@router.patch("/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(ADMIN_ONLY)):
    data = body.model_dump(exclude_none=True)
    if "role" in data and data["role"] not in ROLES:
        raise HTTPException(400, "Invalid role")
    if user_id == admin["id"] and data.get("role") and data["role"] != "admin":
        raise HTTPException(400, "You cannot remove your own admin role")
    await db.users.update_one(
        tenant_query(admin["company_id"], {"id": user_id}),
        {"$set": data},
    )
    u = await db.users.find_one(
        tenant_query(admin["company_id"], {"id": user_id}),
        NO_ID,
    )
    if not u:
        raise HTTPException(404, "User not found")
    return public_user(u)


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(ADMIN_ONLY)):
    if user_id == admin["id"]:
        raise HTTPException(400, "You cannot delete yourself")
    result = await db.users.delete_one(
        tenant_query(admin["company_id"], {"id": user_id})
    )
    if not result.deleted_count:
        raise HTTPException(404, "User not found")
    return {"ok": True}
