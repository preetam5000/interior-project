import asyncio
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from core.config import FRONTEND_URL, ADMIN_EMAIL, ADMIN_PASSWORD
from core.db import db, client, create_indexes, new_id, now_iso
from core.tenancy import DEFAULT_COMPANY_ID, migrate_legacy_data
from core.tenant_context import get_actor_id, get_company_id, set_actor_id, set_company_id
from core.security import hash_password, verify_password
from routes import auth, users, media, posts, dashboard, settings, n8n, templates, companies, google_drive
from services.publishing_service import scheduler_loop
from services.settings_service import get_settings
from services import pipeline, story_music_service, google_drive_sync_service

app = FastAPI(title="Interior Social AI API", version="1.0.0",
              description="Brain of Interior Social AI. n8n endpoints under /api/n8n use the X-API-Key header.",
              docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url="/api/redoc")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"service": "Interior Social AI", "status": "ok"}


for r in [auth.router, users.router, media.router, posts.router, dashboard.router, settings.router, n8n.router,
          templates.router, companies.router, google_drive.router]:
    api.include_router(r)
app.include_router(api)

origins = [o for o in {FRONTEND_URL, "http://localhost:3000"} if o]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
_bg: set = set()
_drive_sync_task: asyncio.Task | None = None


async def seed_admin():
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({"id": new_id(), "company_id": DEFAULT_COMPANY_ID, "email": ADMIN_EMAIL, "name": "Admin", "role": "admin",
                                   "password_hash": hash_password(ADMIN_PASSWORD), "created_at": now_iso()})
    elif not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}})


@app.on_event("startup")
async def startup():
    global _drive_sync_task
    await create_indexes()
    await migrate_legacy_data()
    await seed_admin()
    await get_settings()
    await story_music_service.ensure_catalog()
    t = asyncio.create_task(scheduler_loop())
    _bg.add(t)
    _drive_sync_task = asyncio.create_task(google_drive_sync_service.run_sync_service())
    _bg.add(_drive_sync_task)
    await db.posts.update_many({"reel_status": "rendering"}, {"$set": {"reel_status": None}})
    await db.posts.update_many({"status": "publishing"}, {"$set": {"status": "approved"}})
    async for m in db.media.find({"status": {"$in": ["queued", "processing"]}}, {"id": 1, "company_id": 1}):
        previous_company, previous_actor = get_company_id(), get_actor_id()
        set_company_id(m.get("company_id"))
        set_actor_id("system")
        pipeline.schedule(m["id"])
        set_company_id(previous_company)
        set_actor_id(previous_actor)


@app.on_event("shutdown")
async def shutdown():
    if _drive_sync_task:
        _drive_sync_task.cancel()
        await asyncio.gather(_drive_sync_task, return_exceptions=True)
    await google_drive_sync_service.shutdown_sync_service()
    client.close()
