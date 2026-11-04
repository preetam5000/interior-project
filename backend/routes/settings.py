from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from html import escape
from core.security import get_current_user, ADMIN_ONLY
from services import settings_service as ss, ai_analyzer, cloudinary_service, publishing_service, google_drive_service as gdrive
from services.notification_service import log_activity

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post("/google-drive/connect")
async def google_drive_connect(_: dict = Depends(ADMIN_ONLY)):
    try:
        return {"auth_url": await gdrive.connect()}
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/google-drive/oauth-callback", response_class=HTMLResponse)
async def google_drive_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return HTMLResponse("Google Drive authorization was not completed. You can close this tab.", status_code=400)
    if not code or not state:
        raise HTTPException(400, "Missing Google OAuth response")
    try:
        await gdrive.finish_oauth(code, state)
    except Exception as exc:
        return HTMLResponse(f"Google Drive connection failed: {escape(str(exc))}. You can close this tab.", status_code=400)
    return HTMLResponse("Google Drive connected. You can close this tab and return to Settings.")


@router.post("/google-drive/disconnect")
async def google_drive_disconnect(_: dict = Depends(ADMIN_ONLY)):
    await gdrive.disconnect()
    return {"ok": True, "connected": False}


@router.get("/google-drive/status")
async def google_drive_status(_: dict = Depends(ADMIN_ONLY)):
    try:
        return await gdrive.status()
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


@router.post("/google-drive/folder")
async def google_drive_save_folder(body: dict, _: dict = Depends(ADMIN_ONLY)):
    folder_id, folder_name = body.get("id"), body.get("name")
    if not isinstance(folder_id, str) or not folder_id.strip() or not isinstance(folder_name, str) or not folder_name.strip():
        raise HTTPException(422, "Folder id and name are required")
    try:
        return {"folder": await gdrive.save_selected_folder(folder_id.strip(), folder_name.strip())}
    except Exception as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/google-drive/folder")
async def google_drive_get_folder(_: dict = Depends(ADMIN_ONLY)):
    return {"folder": await gdrive.get_selected_folder()}


@router.post("/google-drive/test")
async def google_drive_test(_: dict = Depends(ADMIN_ONLY)):
    try:
        return await gdrive.verify_connection()
    except Exception as exc:
        raise HTTPException(400, f"Google Drive test failed: {exc}") from exc


@router.get("")
async def read(_: dict = Depends(get_current_user)):
    return ss.public_settings(await ss.get_settings())


@router.patch("")
async def write(body: dict, user: dict = Depends(ADMIN_ONLY)):
    try:
        s = await ss.update_settings(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    await log_activity("settings_updated", f"{user['name']} updated settings ({', '.join(body.keys())})", user)
    return ss.public_settings(s)


@router.post("/rotate-n8n-key")
async def rotate(user: dict = Depends(ADMIN_ONLY)):
    return {"n8n_api_key": await ss.rotate_n8n_key()}


@router.get("/n8n-key")
async def reveal(_: dict = Depends(ADMIN_ONLY)):
    return {"n8n_api_key": (await ss.get_settings())["n8n_api_key"]}


@router.post("/test/{service}")
async def test(service: str, _: dict = Depends(ADMIN_ONLY)):
    s = await ss.get_settings()
    try:
        if service == "openai":
            await ai_analyzer.ping(s)
            return {"ok": True, "message": f"OpenAI ({s['openai_model']}) responded"}
        if service == "cloudinary":
            if not ss.cloudinary_ready(s):
                raise ValueError("Add cloud name, API key and secret first")
            await cloudinary_service.ping(s)
            return {"ok": True, "message": "Cloudinary connected"}
        if service == "instagram":
            if not ss.instagram_ready(s):
                raise ValueError("Add access token and account ID first")
            info = await publishing_service.account_info(s)
            return {"ok": True, "message": f"Connected to @{info.get('username')} ({info.get('followers_count')} followers)"}
    except Exception as e:
        raise HTTPException(400, f"{service} test failed: {e}")
    raise HTTPException(404, "Unknown service")
