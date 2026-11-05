"""Template Library + Template Editor API.

Custom templates live in the `templates` collection. Rendering always goes through
the existing TemplateRenderer (see services.template_editor_service); the AI
recommendation pipeline is not involved.
"""
import asyncio
import base64
import logging
from collections import defaultdict

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from core.db import NO_ID, clean, db, new_id, now_iso
from core.security import CAN_APPROVE, CAN_UPLOAD, get_current_user
from services import storage_service as st
from services import template_config as tc
from services import template_editor_service as tes
from services.notification_service import log_activity
from services.settings_service import get_settings

log = logging.getLogger("templates")
router = APIRouter(prefix="/templates", tags=["templates"])

MAX_TEMPLATES = 200
VARIANTS = ("portrait", "story")
BUSY_MEDIA = ("queued", "processing")
LOCKED_POSTS = ("publishing", "published")
_render_slots = asyncio.Semaphore(2)
_export_locks: dict = defaultdict(asyncio.Lock)


class TemplateCreate(BaseModel):
    name: str
    config: dict


class TemplateUpdate(BaseModel):
    name: str | None = None
    config: dict | None = None


class PreviewIn(BaseModel):
    config: dict
    media_id: str | None = None
    variant: str = "portrait"


class ExportIn(BaseModel):
    media_id: str
    template_id: str | None = None
    config: dict | None = None


class RevertIn(BaseModel):
    media_id: str


def _bad(exc: Exception) -> HTTPException:
    return HTTPException(400, str(exc))


async def _get_template(template_id: str) -> dict:
    doc = await db.templates.find_one({"id": template_id}, NO_ID)
    if not doc:
        raise HTTPException(404, "Template not found")
    return doc


async def _image_media(media_id: str) -> dict:
    media = await db.media.find_one({"id": media_id}, NO_ID)
    if not media or media.get("kind") != "image":
        raise HTTPException(404, "Image not found")
    return media


def _is_export(name: str | None) -> bool:
    """True for files written by the template export (they carry the `_tpl_` marker)."""
    return bool(name) and "_tpl_" in name


def _clean_state(media: dict) -> dict:
    """Template-free `files` / `urls` per variant.

    The current portrait/story is used unless it is itself a template export (or
    is missing), in which case the originals saved in `template_base` are used.
    A manual re-edit regenerates fresh, clean variants, which are then preferred.
    """
    base = media.get("template_base") or {}
    files, urls = media.get("files") or {}, media.get("urls") or {}
    out = {"files": {}, "urls": {}}
    for v in VARIANTS:
        if files.get(v) and not _is_export(files[v]):
            out["files"][v], out["urls"][v] = files[v], urls.get(v)
        elif (base.get("files") or {}).get(v):
            out["files"][v], out["urls"][v] = base["files"][v], (base.get("urls") or {}).get(v)
    return out


def _clean_sources(media: dict) -> dict:
    """Template-free source file name per variant."""
    return _clean_state(media)["files"]


async def _render(source_name: str | None, config: dict, brand: dict, variant: str):
    """Render in a worker thread: Pillow is CPU bound and must not block the event loop."""
    if source_name:
        source = await st.fetch_local(source_name)
    else:
        source = await asyncio.to_thread(tes.sample_image_path, variant)
    async with _render_slots:
        return await asyncio.to_thread(tes.render_config, source, config, brand, variant)


# ------------------------------------------------------------------- library --
@router.get("")
async def library(_: dict = Depends(get_current_user)):
    items = await db.templates.find({}, NO_ID).sort("updated_at", -1).to_list(MAX_TEMPLATES)
    return {"presets": tc.preset_list(), "templates": clean(items), "options": tc.OPTIONS, "limits": tc.LIMITS}


@router.get("/{template_id}")
async def read_template(template_id: str, _: dict = Depends(get_current_user)):
    return clean(await _get_template(template_id))


async def _insert(name: str, config: dict, user: dict, message: str) -> dict:
    if await db.templates.count_documents({}) >= MAX_TEMPLATES:
        raise HTTPException(400, f"Template limit reached ({MAX_TEMPLATES}). Delete unused templates first.")
    now = now_iso()
    doc = {"id": new_id(), "name": name, "template_type": config["template_type"], "config": config,
           "created_by": user["name"], "created_by_id": user["id"], "created_at": now, "updated_at": now}
    await db.templates.insert_one(dict(doc))
    await log_activity("template_created", message.format(user=user["name"], name=name), user, doc["id"], "template")
    return clean(doc)


@router.post("")
async def create_template(body: TemplateCreate, user: dict = Depends(CAN_UPLOAD)):
    try:
        name = tc.clean_name(body.name)
        config = tc.sanitize_config(body.config)
    except tc.TemplateConfigError as exc:
        raise _bad(exc)
    return await _insert(name, config, user, '{user} created template "{name}"')


@router.patch("/{template_id}")
async def update_template(template_id: str, body: TemplateUpdate, user: dict = Depends(CAN_UPLOAD)):
    doc = await _get_template(template_id)
    changes: dict = {}
    try:
        if body.name is not None:
            changes["name"] = tc.clean_name(body.name)
        if body.config is not None:
            config = tc.sanitize_config(body.config, base=doc["config"])
            changes["config"], changes["template_type"] = config, config["template_type"]
    except tc.TemplateConfigError as exc:
        raise _bad(exc)
    changes["updated_at"] = now_iso()
    await db.templates.update_one({"id": template_id}, {"$set": changes})
    await log_activity("template_updated", f"{user['name']} edited template \"{changes.get('name', doc['name'])}\"",
                       user, template_id, "template")
    return clean(await _get_template(template_id))


@router.post("/{template_id}/duplicate")
async def duplicate_template(template_id: str, user: dict = Depends(CAN_UPLOAD)):
    doc = await _get_template(template_id)
    name = f"{doc['name']} (copy)"[:tc.LIMITS["name"]]
    return await _insert(name, dict(doc["config"]), user, '{user} created template "{name}" (duplicate)')


@router.delete("/{template_id}")
async def delete_template(template_id: str, user: dict = Depends(CAN_UPLOAD)):
    doc = await _get_template(template_id)
    await db.templates.delete_one({"id": template_id})
    await log_activity("template_deleted", f"{user['name']} deleted template \"{doc['name']}\"", user,
                       template_id, "template")
    return {"ok": True}


# ------------------------------------------------------------ preview / logo --
async def _resolve_config(template_id: str | None, raw: dict | None) -> tuple[dict | None, dict]:
    """The saved template (if any) and the validated config to render."""
    try:
        if template_id:
            doc = await _get_template(template_id)
            return doc, tc.sanitize_config(raw or {}, base=doc["config"])
        if not raw:
            raise tc.TemplateConfigError("Provide a template_id or a config")
        return None, tc.sanitize_config(raw)
    except tc.TemplateConfigError as exc:
        raise _bad(exc)


async def _safe_render(source_name: str | None, config: dict, brand: dict, variant: str):
    try:
        return await _render(source_name, config, brand, variant)
    except FileNotFoundError:
        raise HTTPException(404, "The source image is no longer available")
    except st.StorageError as exc:
        raise HTTPException(502, str(exc))
    except tes.TemplateRenderError as exc:
        raise HTTPException(500, str(exc))


@router.post("/preview")
async def preview(body: PreviewIn, _: dict = Depends(CAN_UPLOAD)):
    """Live preview: the real TemplateRenderer on a media image (or a sample room), scaled down."""
    if body.variant not in VARIANTS:
        raise HTTPException(400, "variant must be portrait or story")
    _doc, config = await _resolve_config(None, body.config)
    source_name = None
    if body.media_id:
        media = await _image_media(body.media_id)
        source_name = _clean_sources(media).get(body.variant)
        if not source_name:
            raise HTTPException(400, "This image has not been processed yet")
    brand = await get_settings()
    data, warning = await _safe_render(source_name, config, brand, body.variant)
    small = await asyncio.to_thread(tes.shrink_preview, data)
    return {"image": "data:image/jpeg;base64," + base64.b64encode(small).decode("ascii"),
            "warning": warning, "variant": body.variant}


@router.post("/logo")
async def upload_logo(file: UploadFile = File(...), user: dict = Depends(CAN_UPLOAD)):
    """Store an uploaded logo (re-encoded as a bounded PNG) and return its public URL."""
    data = await file.read(tes.MAX_LOGO_BYTES + 1)
    try:
        png = await asyncio.to_thread(tes.normalize_logo_image, data)
    except tes.TemplateRenderError as exc:
        raise _bad(exc)
    try:
        url = await st.put_bytes(f"template_logo_{new_id()[:12]}.png", png, "image/png")
    except st.StorageNotConfiguredError as exc:
        raise HTTPException(503, str(exc))
    except st.StorageError as exc:
        raise HTTPException(502, str(exc))
    await log_activity("template_logo_uploaded", f"{user['name']} uploaded a template logo", user)
    return {"url": url}


# ---------------------------------------------------------------- export / revert --
async def _guard_media(media: dict) -> None:
    """Refuse to touch media that is being processed or already published."""
    if media.get("status") in BUSY_MEDIA:
        raise HTTPException(409, "This image is still being processed. Try again in a moment.")
    live = await db.posts.find_one({"media_ids": media["id"], "status": {"$in": list(LOCKED_POSTS)}}, {"id": 1})
    if live:
        raise HTTPException(409, "A post using this image is being published or is already published.")


async def _note_posts(media_id: str, user: dict, action: str) -> None:
    """Record the change in the history of the posts that use this image."""
    await db.posts.update_many(
        {"media_ids": media_id, "status": {"$nin": list(LOCKED_POSTS)}},
        {"$set": {"updated_at": now_iso()},
         "$push": {"history": {"at": now_iso(), "by": user["name"], "action": action}}})


async def _render_and_store(media: dict, clean_files: dict, config: dict, brand: dict) -> tuple[dict, dict]:
    """Render both variants with the TemplateRenderer and upload them; returns (names, urls)."""
    names, urls = {}, {}
    for variant in VARIANTS:
        data, warning = await _safe_render(clean_files[variant], config, brand, variant)
        if warning:
            raise HTTPException(400, f"{warning}. Fix or remove the logo, then export again.")
        name = f"{media['id']}_tpl_{variant}_{new_id()[:8]}.jpg"
        await asyncio.to_thread(st.work_path(name).write_bytes, data)
        try:
            urls[variant] = await st.put_file(name, st.work_path(name), "image/jpeg")
        except st.StorageNotConfiguredError as exc:
            raise HTTPException(503, str(exc))
        except st.StorageError as exc:
            raise HTTPException(502, str(exc))
        names[variant] = name
    return names, urls


@router.post("/export")
async def export_template(body: ExportIn, user: dict = Depends(CAN_APPROVE)):
    """Render the template onto the image's portrait + story variants and make them the final images.

    `urls.portrait` / `urls.story` are what the approval screens and the Instagram
    publisher read, so the edited template becomes the image that gets approved.
    """
    template, config = await _resolve_config(body.template_id, body.config)
    async with _export_locks[body.media_id]:
        media = await _image_media(body.media_id)
        await _guard_media(media)
        clean_state = _clean_state(media)
        if len(clean_state["files"]) != len(VARIANTS):
            raise HTTPException(400, "This image has not been processed yet")

        names, urls = await _render_and_store(media, clean_state["files"], config, await get_settings())

        previous = media.get("template_base") or {}
        base = {"files": clean_state["files"], "urls": clean_state["urls"],
                "template_file": previous.get("template_file", (media.get("files") or {}).get("template")),
                "template_url": previous.get("template_url", (media.get("urls") or {}).get("template"))}
        update = {"template_base": base, "edited_at": now_iso(), "template_export": {
            "template_id": template["id"] if template else None,
            "template_name": template["name"] if template else "Unsaved template",
            "template_type": config["template_type"], "config": config, "files": names,
            "exported_by": user["name"], "exported_at": now_iso()}}
        for variant in VARIANTS:
            update[f"files.{variant}"] = names[variant]
            update[f"urls.{variant}"] = update[f"local_urls.{variant}"] = urls[variant]
        update["files.template"] = names["portrait"]
        update["urls.template"] = update["local_urls.template"] = urls["portrait"]

        # Never overwrite a media item that started processing while we were rendering.
        result = await db.media.update_one({"id": media["id"], "status": {"$nin": list(BUSY_MEDIA)}}, {"$set": update})
        if not result.matched_count:
            raise HTTPException(409, "This image started processing again. Try the export again.")

    label = template["name"] if template else config["template_type"].replace("_", " ").title()
    await _note_posts(media["id"], user, f"Applied template \"{label}\"")
    await log_activity("template_exported", f"{user['name']} applied template \"{label}\" to {media['filename']}",
                       user, media["id"], "media")
    return clean(await db.media.find_one({"id": media["id"]}, NO_ID))


@router.post("/revert")
async def revert_template(body: RevertIn, user: dict = Depends(CAN_APPROVE)):
    """Undo the last template export and restore the original portrait / story images."""
    async with _export_locks[body.media_id]:
        media = await _image_media(body.media_id)
        await _guard_media(media)
        base = media.get("template_base")
        if not base or not media.get("template_export"):
            raise HTTPException(400, "No template has been applied to this image")

        files = media.get("files") or {}
        base_files, base_urls = base.get("files") or {}, base.get("urls") or {}
        sets: dict = {"edited_at": now_iso()}
        unsets: dict = {"template_export": "", "template_base": ""}
        for variant in VARIANTS:
            if base_files.get(variant) and _is_export(files.get(variant)):
                sets[f"files.{variant}"] = base_files[variant]
                if base_urls.get(variant):
                    sets[f"urls.{variant}"] = sets[f"local_urls.{variant}"] = base_urls[variant]
        if _is_export(files.get("template")):
            if base.get("template_file") and base.get("template_url"):
                sets["files.template"] = base["template_file"]
                sets["urls.template"] = sets["local_urls.template"] = base["template_url"]
            else:
                unsets.update({"files.template": "", "urls.template": "", "local_urls.template": ""})
        await db.media.update_one({"id": media["id"]}, {"$set": sets, "$unset": unsets})

    await _note_posts(media["id"], user, "Removed applied template")
    await log_activity("template_reverted", f"{user['name']} removed the template from {media['filename']}",
                       user, media["id"], "media")
    return clean(await db.media.find_one({"id": media["id"]}, NO_ID))
