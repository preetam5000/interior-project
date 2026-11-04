import uuid
import copy
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from core.config import MONGO_URL, DB_NAME
from core.tenant_context import get_actor_id, get_company_id

client = AsyncIOMotorClient(MONGO_URL)
_motor_db = client[DB_NAME]

TENANT_COLLECTIONS = {
    "activity_logs",
    "analytics",
    "audit_logs",
    "files",
    "follower_snapshots",
    "learning_records",
    "media",
    "notifications",
    "posts",
    "projects",
    "settings",
    "templates",
    "usage",
    "users",
    "music_favorites",
    "drive_sync_records",
    "drive_sync_history",
    "drive_projects",
}


def _scoped_query(query: dict | None, company_id: str) -> dict:
    return {"$and": [query or {}, {"company_id": company_id}]}


def _scoped_update(update: dict, company_id: str) -> dict:
    result = copy.deepcopy(update)
    if any(key.startswith("$") for key in result):
        for operator in ("$unset", "$rename"):
            fields = dict(result.get(operator, {}))
            fields.pop("company_id", None)
            if fields:
                result[operator] = fields
            else:
                result.pop(operator, None)
        result.setdefault("$set", {})["company_id"] = company_id
        result.setdefault("$setOnInsert", {}).pop("company_id", None)
    else:
        result["company_id"] = company_id
    return result


async def write_audit(
    company_id: str,
    action: str,
    collection: str,
    target_id: str | None,
    fields: list[str] | None = None,
) -> None:
    await _motor_db.audit_logs.insert_one(
        {
            "id": new_id(),
            "company_id": company_id,
            "actor_id": get_actor_id() or "system",
            "action": action,
            "collection": collection,
            "target_id": target_id,
            "fields": fields or [],
            "created_at": now_iso(),
        }
    )


class _TenantCollection:
    def __init__(self, collection):
        self._collection = collection
        self._name = collection.name

    def __getattr__(self, name):
        return getattr(self._collection, name)

    def _company_id(self):
        return get_company_id()

    def find(self, query=None, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
        return self._collection.find(query, *args, **kwargs)

    async def find_one(self, query=None, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
        return await self._collection.find_one(query, *args, **kwargs)

    async def insert_one(self, document, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            document = {**document, "company_id": company_id}
        result = await self._collection.insert_one(document, *args, **kwargs)
        if company_id and self._name not in {"activity_logs", "audit_logs"}:
            await write_audit(company_id, "insert", self._name, document.get("id"))
        return result

    async def insert_many(self, documents, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            documents = [{**document, "company_id": company_id} for document in documents]
        result = await self._collection.insert_many(documents, *args, **kwargs)
        if company_id and self._name not in {"activity_logs", "audit_logs"}:
            for document in documents:
                await write_audit(company_id, "insert", self._name, document.get("id"))
        return result

    async def update_one(self, query, update, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
            update = _scoped_update(update, company_id)
        result = await self._collection.update_one(query, update, *args, **kwargs)
        if company_id and result.modified_count and self._name not in {"activity_logs", "audit_logs"}:
            await write_audit(company_id, "update", self._name, None, _updated_fields(update))
        return result

    async def update_many(self, query, update, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
            update = _scoped_update(update, company_id)
        result = await self._collection.update_many(query, update, *args, **kwargs)
        if company_id and result.modified_count and self._name not in {"activity_logs", "audit_logs"}:
            await write_audit(company_id, "update_many", self._name, None, _updated_fields(update))
        return result

    async def replace_one(self, query, replacement, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
            replacement = {**replacement, "company_id": company_id}
        result = await self._collection.replace_one(query, replacement, *args, **kwargs)
        if company_id and result.modified_count and self._name not in {"activity_logs", "audit_logs"}:
            await write_audit(company_id, "replace", self._name, replacement.get("id"))
        return result

    async def delete_one(self, query, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
        result = await self._collection.delete_one(query, *args, **kwargs)
        if company_id and result.deleted_count and self._name not in {"activity_logs", "audit_logs"}:
            await write_audit(company_id, "delete", self._name, None)
        return result

    async def delete_many(self, query, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
        result = await self._collection.delete_many(query, *args, **kwargs)
        if company_id and result.deleted_count and self._name not in {"activity_logs", "audit_logs"}:
            await write_audit(company_id, "delete_many", self._name, None)
        return result

    async def count_documents(self, query, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
        return await self._collection.count_documents(query, *args, **kwargs)

    async def find_one_and_update(self, query, update, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
            update = _scoped_update(update, company_id)
        return await self._collection.find_one_and_update(query, update, *args, **kwargs)

    async def find_one_and_delete(self, query, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            query = _scoped_query(query, company_id)
        return await self._collection.find_one_and_delete(query, *args, **kwargs)

    async def aggregate(self, pipeline, *args, **kwargs):
        company_id = self._company_id()
        if company_id:
            pipeline = [{"$match": {"company_id": company_id}}, *pipeline]
        return self._collection.aggregate(pipeline, *args, **kwargs)


class _TenantDatabase:
    def __getattr__(self, name):
        collection = getattr(_motor_db, name)
        if name in TENANT_COLLECTIONS:
            return _TenantCollection(collection)
        return collection


db = _TenantDatabase()


def _updated_fields(update: dict) -> list[str]:
    if not any(key.startswith("$") for key in update):
        return sorted(key for key in update if key != "company_id")
    return sorted(
        key
        for operator, values in update.items()
        if operator in {"$set", "$unset", "$inc", "$push", "$pull", "$addToSet"}
        and isinstance(values, dict)
        for key in values
        if key != "company_id"
    )

NO_ID = {"_id": 0}


def new_id() -> str:
    return str(uuid.uuid4())


def now() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now().isoformat()


async def create_indexes():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.companies.create_index("id", unique=True)
    await db.api_keys.create_index("key_hash", unique=True)
    await db.api_keys.create_index([("company_id", 1), ("revoked_at", 1)])
    await db.audit_logs.create_index([("company_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.media.create_index("id", unique=True)
    await db.media.create_index("drive_file_id", sparse=True)
    await db.media.create_index("google_drive_file_id", sparse=True)
    await db.media.create_index("drive_project_id", sparse=True)
    await db.media.create_index("checksum")
    await db.media.create_index("group_key")
    await db.posts.create_index("id", unique=True)
    await db.posts.create_index([("status", 1), ("scheduled_at", 1)])
    await db.projects.create_index([("company_id", 1), ("key", 1)], unique=True)
    await db.activity_logs.create_index([("created_at", -1)])
    await db.notifications.create_index([("created_at", -1)])
    await db.usage.create_index([("kind", 1), ("at", -1)])
    await db.analytics.create_index("post_id")
    await db.learning_records.create_index("media_id", unique=True)
    await db.templates.create_index("id", unique=True)
    await db.templates.create_index([("updated_at", -1)])
    await db.music_tracks.create_index("id", unique=True)
    await db.music_tracks.create_index([("genre", 1), ("is_featured", -1)])
    await db.music_favorites.create_index([("user_id", 1), ("track_id", 1)], unique=True)
    await db.drive_sync_records.create_index([("company_id", 1), ("drive_file_id", 1)], unique=True)
    await db.drive_sync_records.create_index([("company_id", 1), ("status", 1), ("updated_at", -1)])
    await db.drive_sync_history.create_index([("company_id", 1), ("started_at", -1)])
    await db.drive_projects.create_index([("company_id", 1), ("project_id", 1)], unique=True)
    await db.drive_projects.create_index([("company_id", 1), ("approved_folder_id", 1)], sparse=True)


def clean(x):
    if isinstance(x, list):
        return [clean(i) for i in x]
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items() if k != "_id"}
    return x
