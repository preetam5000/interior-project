"""Google Drive OAuth, folder selection, and read-only file access."""

import logging
from datetime import datetime, timedelta, timezone
import time
from urllib.parse import urlencode

import httpx
import jwt
from cryptography.fernet import Fernet, InvalidToken

from core.config import (
    GOOGLE_CLOUD_PROJECT_NUMBER,
    GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY,
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_PICKER_API_KEY,
    JWT_SECRET,
)
from core.tenant_context import get_company_id
from core.tenancy import DEFAULT_COMPANY_ID
from services import settings_service as ss

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about"
SCOPES = "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email"
REQUIRED_INSTAGRAM_FOLDERS_ERROR = (
    "The selected folder must contain:\n- dumped images\n- filtered images"
)
_access_token_cache: dict[str, tuple[float, dict]] = {}
log = logging.getLogger("google_drive")


class GoogleDriveAuthError(ValueError):
    """The refresh token has been revoked or can no longer be used."""


def _company_id() -> str:
    return get_company_id() or DEFAULT_COMPANY_ID


def _require_oauth_config() -> None:
    if not all((GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI)):
        raise ValueError("Configure GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI")


def _fernet() -> Fernet:
    if not GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY:
        raise ValueError("Configure GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY to store Google refresh tokens securely")
    try:
        return Fernet(GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise ValueError("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY must be a valid Fernet key") from exc


def _encrypt(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def _decrypt(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Stored Google refresh token cannot be decrypted; check the encryption key") from exc


async def connect() -> str:
    """Build the consent URL; state binds the callback to the requesting company."""
    _require_oauth_config()
    _fernet()
    state = jwt.encode(
        {"company_id": _company_id(), "purpose": "google-drive-oauth", "exp": datetime.now(timezone.utc) + timedelta(minutes=10)},
        JWT_SECRET,
        algorithm="HS256",
    )
    return AUTH_URL + "?" + urlencode({
        "client_id": GOOGLE_OAUTH_CLIENT_ID,
        "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    })


async def finish_oauth(code: str, state: str) -> None:
    _require_oauth_config()
    try:
        claims = jwt.decode(state, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise ValueError("Google OAuth state is invalid or expired") from exc
    if claims.get("purpose") != "google-drive-oauth":
        raise ValueError("Google OAuth state is invalid")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TOKEN_URL, data={
            "code": code,
            "client_id": GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
            "redirect_uri": GOOGLE_OAUTH_REDIRECT_URI,
            "grant_type": "authorization_code",
        })
        response.raise_for_status()
        credentials = response.json()
        refresh_token = credentials.get("refresh_token")
        if not refresh_token:
            raise ValueError("Google did not return a refresh token. Revoke this app in Google Account permissions and connect again.")
        profile_response = await client.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {credentials['access_token']}"},
        )
        profile_response.raise_for_status()
        email = profile_response.json().get("email", "")
    await ss.update_settings({
        "gdrive_refresh_token": _encrypt(refresh_token),
        "gdrive_account": email,
        "gdrive_connection_error": "",
        "gdrive_sync_error": "",
    }, claims["company_id"])
    _access_token_cache.pop(claims["company_id"], None)


async def refresh_access_token(company_id: str | None = None, *, force: bool = False) -> dict:
    _require_oauth_config()
    company_id = company_id or _company_id()
    cached = _access_token_cache.get(company_id)
    if not force and cached and cached[0] > time.time() + 60:
        return dict(cached[1])
    s = await ss.get_company_settings(company_id)
    if not s.get("gdrive_refresh_token"):
        raise ValueError("Google Drive is not connected")
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.post(TOKEN_URL, data={
            "client_id": GOOGLE_OAUTH_CLIENT_ID,
            "client_secret": GOOGLE_OAUTH_CLIENT_SECRET,
            "refresh_token": _decrypt(s["gdrive_refresh_token"]),
            "grant_type": "refresh_token",
        })
        if response.is_error:
            try:
                error = response.json().get("error")
            except ValueError:
                error = None
            if error in {"invalid_grant", "unauthorized_client"}:
                _access_token_cache.pop(company_id, None)
                raise GoogleDriveAuthError("Google authorization expired or was revoked. Reconnect Google Drive and approve read-only file access.")
            response.raise_for_status()
        tokens = response.json()
        _access_token_cache[company_id] = (time.time() + max(30, int(tokens.get("expires_in", 3600))), tokens)
        return dict(tokens)


async def _drive_request(method: str, url: str, company_id: str | None = None, **kwargs) -> httpx.Response:
    tokens = await refresh_access_token(company_id)
    async with httpx.AsyncClient(timeout=20) as client:
        response = await client.request(method, url, headers={"Authorization": f"Bearer {tokens['access_token']}"}, **kwargs)
        if response.status_code == 401:
            tokens = await refresh_access_token(company_id, force=True)
            response = await client.request(method, url, headers={"Authorization": f"Bearer {tokens['access_token']}"}, **kwargs)
        response.raise_for_status()
        return response


async def verify_connection() -> dict:
    company_id = _company_id()
    await _drive_request("GET", DRIVE_ABOUT_URL, company_id, params={"fields": "user(emailAddress)"})
    s = await ss.get_company_settings(company_id)
    if s.get("gdrive_selected_folder_id"):
        folder = await discover_instagram_folders(s["gdrive_selected_folder_id"], company_id)
        return {"ok": True, "message": "Connection Successful", "folder": folder}
    return {"ok": True, "message": "Connection Successful", "folder": None}


async def _get_folder(folder_id: str, company_id: str | None = None) -> dict:
    response = await _drive_request("GET", f"{DRIVE_FILES_URL}/{folder_id}", company_id,
                                    params={"fields": "id,name,mimeType,trashed,parents"})
    folder = response.json()
    if folder.get("mimeType") != "application/vnd.google-apps.folder" or folder.get("trashed"):
        raise ValueError("Selected Google Drive item is no longer an available folder")
    return {"id": folder["id"], "name": folder["name"], "parents": folder.get("parents", [])}


async def get_folder_info(folder_id: str, company_id: str | None = None) -> dict:
    return await _get_folder(folder_id, company_id)


async def get_file_info(file_id: str, company_id: str | None = None) -> dict:
    response = await _drive_request(
        "GET",
        f"{DRIVE_FILES_URL}/{file_id}",
        company_id,
        params={"fields": "id,name,mimeType,webViewLink,size,modifiedTime,trashed,parents"},
    )
    return response.json()


async def list_child_folders(folder_id: str, company_id: str | None = None) -> list[dict]:
    """List only direct child folders. This never enumerates files in a folder."""
    folders: list[dict] = []
    page_token = None
    params = {
        "q": f"'{folder_id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder'",
        "pageSize": 1000,
        "fields": "nextPageToken,files(id,name,mimeType,trashed,parents,webViewLink)",
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
    }
    log.info("Listing Google Drive child folders with query: %s", params["q"])
    while True:
        if page_token:
            params["pageToken"] = page_token
        response = await _drive_request("GET", DRIVE_FILES_URL, company_id, params=params)
        payload = response.json()
        children = payload.get("files", [])
        for child in children:
            log.info(
                "Google Drive child returned: id=%r name=%r mimeType=%r",
                child.get("id"),
                child.get("name"),
                child.get("mimeType"),
            )
        folders.extend(children)
        page_token = payload.get("nextPageToken")
        if not page_token:
            return folders


async def discover_instagram_folders(parent_folder_id: str, company_id: str | None = None) -> dict:
    """Resolve the required direct child folders without listing their contents."""
    parent = await _get_folder(parent_folder_id, company_id)
    children = await list_child_folders(parent["id"], company_id)
    folders_by_name = {
        child["name"].strip().casefold(): child
        for child in children
        if child.get("name")
    }
    dumped = folders_by_name.get("dumped images")
    filtered = folders_by_name.get("filtered images")
    if not dumped or not filtered:
        log.warning(
            "Instagram folder validation failed for parent id=%r: dumped images found=%s, "
            "filtered images found=%s; normalized child names=%r",
            parent["id"],
            dumped is not None,
            filtered is not None,
            sorted(folders_by_name),
        )
        raise ValueError(REQUIRED_INSTAGRAM_FOLDERS_ERROR)
    return {
        "parent_folder_id": parent["id"],
        "parent_folder_name": parent["name"],
        "dumped_folder_id": dumped["id"],
        "filtered_folder_id": filtered["id"],
    }


async def list_folder_files(folder_id: str, company_id: str | None = None) -> list[dict]:
    """List direct image children only; never recurse into subfolders."""
    files: list[dict] = []
    page_token = None
    params = {
        "q": f"'{folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'",
        "pageSize": 1000,
        "fields": "nextPageToken,files(id,name,mimeType,webViewLink,size,modifiedTime)",
        "supportsAllDrives": "true",
        "includeItemsFromAllDrives": "true",
    }
    while True:
        if page_token:
            params["pageToken"] = page_token
        response = await _drive_request("GET", DRIVE_FILES_URL, company_id, params=params)
        payload = response.json()
        files.extend(payload.get("files", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break
    return files


async def download_file(file_id: str, company_id: str | None = None) -> tuple[bytes, str]:
    """Download file bytes through the authenticated Drive API, never via public links."""
    tokens = await refresh_access_token(company_id)
    url = f"{DRIVE_FILES_URL}/{file_id}"
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.get(url, params={"alt": "media", "supportsAllDrives": "true"},
                                    headers={"Authorization": f"Bearer {tokens['access_token']}"})
        if response.status_code == 401:
            tokens = await refresh_access_token(company_id, force=True)
            response = await client.get(url, params={"alt": "media", "supportsAllDrives": "true"},
                                        headers={"Authorization": f"Bearer {tokens['access_token']}"})
        response.raise_for_status()
        return response.content, response.headers.get("content-type", "application/octet-stream")


async def save_selected_folder(folder_id: str, folder_name: str) -> dict:
    log.info("Validating selected Google Drive folder: id=%r name=%r", folder_id, folder_name)
    folders = await discover_instagram_folders(folder_id)
    log.info(
        "Google Drive parent resolved: id=%r name=%r; Picker supplied name=%r",
        folders["parent_folder_id"],
        folders["parent_folder_name"],
        folder_name,
    )
    if folders["parent_folder_name"] != folder_name:
        log.warning(
            "Selected folder name mismatch for id=%r: Drive name=%r, Picker name=%r",
            folders["parent_folder_id"],
            folders["parent_folder_name"],
            folder_name,
        )
        raise ValueError("Folder selection changed; choose the folder again")
    await ss.update_settings({
        "gdrive_selected_folder_id": folders["parent_folder_id"],
        "gdrive_selected_folder_name": folders["parent_folder_name"],
        "gdrive_projects_root_id": "",
        "gdrive_projects_root_name": "",
        "gdrive_images_folder_id": "",
        "gdrive_videos_folder_id": "",
        "gdrive_last_sync": None,
        "gdrive_sync_state": "idle",
        "gdrive_sync_error": "",
    })
    return {"id": folders["parent_folder_id"], "name": folders["parent_folder_name"]}


async def get_selected_folder() -> dict | None:
    s = await ss.get_settings()
    folder_id = s.get("gdrive_selected_folder_id")
    return {"id": folder_id, "name": s.get("gdrive_selected_folder_name", "")} if folder_id else None


async def disconnect() -> None:
    _access_token_cache.pop(_company_id(), None)
    await ss.update_settings({
        "gdrive_refresh_token": "",
        "gdrive_account": "",
        "gdrive_selected_folder_id": "",
        "gdrive_selected_folder_name": "",
        "gdrive_projects_root_id": "",
        "gdrive_projects_root_name": "",
        "gdrive_images_folder_id": "",
        "gdrive_videos_folder_id": "",
        "gdrive_connection_error": "",
        "gdrive_sync_error": "",
        "gdrive_sync_state": "idle",
    })


async def status() -> dict:
    s = await ss.get_settings()
    connected = bool(s.get("gdrive_refresh_token"))
    result = {
        "connected": connected,
        "account": s.get("gdrive_account", ""),
        "folder": await get_selected_folder(),
        "connection_error": s.get("gdrive_connection_error", ""),
    }
    # Picker credentials are returned only to the authenticated admin who opens the picker.
    if connected:
        if result["connection_error"]:
            result["connected"] = False
            return result
        try:
            tokens = await refresh_access_token()
        except GoogleDriveAuthError as exc:
            await ss.update_settings({"gdrive_connection_error": str(exc), "gdrive_sync_state": "disconnected"})
            result.update({"connected": False, "connection_error": str(exc)})
            return result
        result["picker"] = {
            "access_token": tokens["access_token"],
            "api_key": GOOGLE_PICKER_API_KEY,
            "app_id": GOOGLE_CLOUD_PROJECT_NUMBER,
        }
    return result
