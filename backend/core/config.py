import os
import logging
from pathlib import Path
from dotenv import load_dotenv

log = logging.getLogger("config")
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
USE_AI_EDITOR = os.environ.get("USE_AI_EDITOR", "false").strip().lower() in {"1", "true", "yes", "on"}
SCENE_SEGMENTATION_ENABLED = os.environ.get(
    "SCENE_SEGMENTATION_ENABLED",
    "false",
).strip().lower() in {"1", "true", "yes", "on"}
EDITOR_MODES = {"architectural", "luxury", "scandinavian", "modern", "cinematic"}
EDITOR_MODE = os.environ.get("EDITOR_MODE", "architectural").strip().lower()
if EDITOR_MODE not in EDITOR_MODES:
    log.warning("Unknown EDITOR_MODE %r; using architectural mode", EDITOR_MODE)
    EDITOR_MODE = "architectural"
EDITOR_STYLE_REFERENCE = os.environ.get("EDITOR_STYLE_REFERENCE", "").strip()
_OPENAI_IMAGE_COST_RAW = os.environ.get("OPENAI_IMAGE_COST_USD", "").strip()
OPENAI_IMAGE_COST_USD = (
    float(_OPENAI_IMAGE_COST_RAW)
    if _OPENAI_IMAGE_COST_RAW
    else None
)
if OPENAI_IMAGE_COST_USD is not None and (
    not 0 <= OPENAI_IMAGE_COST_USD < float("inf")
):
    raise ValueError("OPENAI_IMAGE_COST_USD must be a finite non-negative number")
_OPENAI_TEXT_REQUEST_COST_RAW = os.environ.get("OPENAI_TEXT_REQUEST_COST_USD", "").strip()
OPENAI_TEXT_REQUEST_COST_USD = (
    float(_OPENAI_TEXT_REQUEST_COST_RAW)
    if _OPENAI_TEXT_REQUEST_COST_RAW
    else None
)
if OPENAI_TEXT_REQUEST_COST_USD is not None and (
    not 0 <= OPENAI_TEXT_REQUEST_COST_USD < float("inf")
):
    raise ValueError("OPENAI_TEXT_REQUEST_COST_USD must be a finite non-negative number")
PUBLIC_BASE_URL = os.environ["PUBLIC_BASE_URL"].rstrip("/")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "")
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
GOOGLE_OAUTH_REDIRECT_URI = os.environ.get("GOOGLE_OAUTH_REDIRECT_URI", "").strip()
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = os.environ.get("GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY", "").strip()
GOOGLE_PICKER_API_KEY = os.environ.get("GOOGLE_PICKER_API_KEY", "").strip()
GOOGLE_CLOUD_PROJECT_NUMBER = os.environ.get("GOOGLE_CLOUD_PROJECT_NUMBER", "").strip()
GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS = max(5, int(os.environ.get("GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS", "30")))
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"]
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]

STORAGE_DIR = ROOT_DIR / "storage"
STORAGE_DIR.mkdir(exist_ok=True)

ROLES = ["admin", "manager", "designer", "viewer"]
