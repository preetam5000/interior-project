from datetime import timedelta
import hashlib
import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from core.config import JWT_SECRET
from core.db import db, now, NO_ID
from core.tenant_context import set_actor_id, set_company_id

ALG = "HS256"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": now() + timedelta(minutes=15), "type": "access"}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALG)


def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": now() + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALG)


def decode_token(token: str, expected: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != expected:
        raise HTTPException(401, "Invalid token type")
    return payload


def set_auth_cookies(response, user: dict):
    response.set_cookie("access_token", create_access_token(user["id"], user["email"]), httponly=True,
                        secure=True, samesite="none", max_age=900, path="/")
    response.set_cookie("refresh_token", create_refresh_token(user["id"]), httponly=True,
                        secure=True, samesite="none", max_age=604800, path="/")


async def get_current_user(request: Request) -> dict:
    api_key = request.headers.get("X-API-Key", "").strip()
    if api_key:
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        record = await db.api_keys.find_one(
            {"key_hash": key_hash, "revoked_at": None},
            NO_ID,
        )
        if not record:
            raise HTTPException(401, "Invalid API key")
        set_company_id(record["company_id"])
        set_actor_id(f"api:{record['id']}")
        await db.api_keys.update_one(
            {"id": record["id"], "revoked_at": None},
            {"$set": {"last_used_at": now().isoformat()}},
        )
        return {
            "id": f"api:{record['id']}",
            "name": record["name"],
            "email": None,
            "role": "integration",
            "company_id": record["company_id"],
            "api_key_id": record["id"],
            "scopes": record.get("scopes", []),
        }
    token = request.cookies.get("access_token")
    auth = request.headers.get("Authorization", "")
    if not token and auth.startswith("Bearer "):
        token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    payload = decode_token(token, "access")
    user = await db.users.find_one({"id": payload["sub"]}, {**NO_ID, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    set_company_id(user.get("company_id"))
    set_actor_id(user.get("id"))
    return user


def require_roles(*roles):
    async def checker(user: dict = Depends(get_current_user)):
        if user.get("role") == "integration":
            needed = set(roles)
            scopes = set(user.get("scopes", []))
            if needed.intersection(scopes):
                return user
            raise HTTPException(403, "API key does not have the required scope")
        if user["role"] not in roles:
            raise HTTPException(403, "You don't have permission for this action")
        return user
    return checker


CAN_UPLOAD = require_roles("admin", "manager", "designer")
CAN_APPROVE = require_roles("admin", "manager")
CAN_DELETE_MEDIA = require_roles("admin", "manager")
ADMIN_ONLY = require_roles("admin")
