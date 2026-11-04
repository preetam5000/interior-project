"""Google Drive sync status and on-demand sync controls."""

from fastapi import APIRouter, Depends, HTTPException, Query

from core.security import ADMIN_ONLY, get_current_user
from services import google_drive_sync_service as sync_service

router = APIRouter(prefix="/google-drive", tags=["google-drive"])


@router.get("/status")
async def status(user: dict = Depends(get_current_user)):
    return await sync_service.get_status(user["company_id"])


@router.get("/imports")
async def imports(
    status: str = "",
    limit: int = Query(default=50, ge=1, le=200),
    skip: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
):
    return await sync_service.list_imports(user["company_id"], status=status, limit=limit, skip=skip)


@router.get("/imports/{record_id}")
async def import_detail(record_id: str, user: dict = Depends(get_current_user)):
    record = await sync_service.get_import(user["company_id"], record_id)
    if not record:
        raise HTTPException(404, "Import record not found")
    return record


@router.post("/sync")
async def sync_now(user: dict = Depends(ADMIN_ONLY)):
    result = await sync_service.request_sync(user["company_id"])
    if not result.get("ok"):
        raise HTTPException(400, result.get("message", "Google Drive sync failed"))
    return result


@router.post("/import-now")
async def import_now(retry_failed: bool = False, user: dict = Depends(ADMIN_ONLY)):
    result = await sync_service.request_import_now(user["company_id"], retry_failed=retry_failed)
    if not result.get("ok"):
        raise HTTPException(400, result.get("message", "Could not start Google Drive import"))
    return result


@router.post("/import/{record_id}/retry")
async def retry_import(record_id: str, user: dict = Depends(ADMIN_ONLY)):
    return await sync_service.request_retry_import(user["company_id"], record_id)


@router.post("/import/{record_id}/cancel")
async def cancel_import(record_id: str, user: dict = Depends(ADMIN_ONLY)):
    try:
        return await sync_service.cancel_import(user["company_id"], record_id)
    except ValueError as exc:
        message = str(exc)
        raise HTTPException(404 if "not found" in message.lower() else 409, message) from exc


@router.delete("/imports/completed")
async def remove_completed(user: dict = Depends(ADMIN_ONLY)):
    return await sync_service.remove_completed(user["company_id"])


@router.post("/pause")
async def pause(user: dict = Depends(ADMIN_ONLY)):
    return await sync_service.set_sync_paused(user["company_id"], True)


@router.post("/resume")
async def resume(user: dict = Depends(ADMIN_ONLY)):
    return await sync_service.set_sync_paused(user["company_id"], False)
