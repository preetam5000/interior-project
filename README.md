# Interior Social AI

Automates Instagram for interior design studios: **Google Drive → n8n → FastAPI (AI brain) → approval → Instagram**.

## Folder structure
```
backend/                FastAPI (all business logic)
  core/                 config, db, security (JWT + RBAC)
  services/             ai_analyzer, image_editor, cloudinary_service, carousel_service,
                        reel_service, pipeline, publishing_service, analytics_service,
                        notification_service, settings_service, storage_service
  routes/               auth, users, media, posts (approvals), dashboard/analytics/notifications,
                        settings, n8n (REST for n8n, X-API-Key)
  n8n/                  importable n8n workflow template
frontend/               React + Tailwind + shadcn/ui dashboard
docker-compose.yml      mongo + backend + frontend + n8n
```

## Pipeline
1. **Ingest** – UI upload or n8n `POST /api/n8n/ingest`. Duplicates blocked by Drive file ID + SHA-256 + perceptual hash.
2. **Analyse** (OpenAI vision) – room type, stage, style, aesthetic score, quality (blur, exposure, brightness, noise), content type (feed/story/carousel/reel/skip) + confidence, reason, crop, editing style, priority.
3. **Enhance** – a deterministic OpenCV pipeline measures brightness, exposure, contrast, dynamic range, histogram, estimated color temperature/white balance, saturation, blur/sharpness, noise, edge density, clipping, material-area proxies, construction/completed/luxury scores, vertical lines, camera roll, and perspective cues. It derives a per-image enhancement profile, then applies perspective, lens-distortion (only when a calibrated estimate is available), highlights, shadows, exposure, white balance, color temperature, wall neutralization, wood, floor texture, local clarity, micro-contrast, texture, sharpening, noise reduction, window glow, vignette, and full-frame Instagram layout optimization. Each stage logs its input/output measurements and selected profile strengths. The profile and scene labels are saved with each media record. Vision analysis supplies room and project-stage labels; OpenCV visual cues estimate environment and lighting when vision labels are unavailable. In Settings → Brand, choose AUTO, Architectural, Luxury, Construction Progress, Completed Interior, Minimal, Scandinavian, or Modern. Presets modify the adaptive profile modestly; they do not apply static image-specific tuning. `USE_AI_EDITOR=true` and `OPENAI_API_KEY` in `backend/.env` additionally send the classically enhanced image to OpenAI GPT Image (`gpt-image-2.5-sunburst`) for final photographic refinement. Optionally set `EDITOR_STYLE_REFERENCE` to a supported absolute image path. OpenAI image editing is generative and cannot guarantee preservation of construction details despite the prompt, so review AI-polished results before publishing. Disable it to use only deterministic pixel operations. Cloudinary stores the processed enhanced asset; Instagram variants fit the full source photo on their canvases without cropping.
4. **Write** – caption (Architectural Digest tone), editorial + SEO description, story text, alt text, hashtags, music suggestion.
5. **Group** – `Villa_A_01`, `Villa_A_02`… (same folder/filename stem) automatically become one carousel.
6. **Reels** – videos transcoded to 9:16; image posts can be rendered as Ken Burns + fade slideshow reels (ffmpeg).
7. **Approve** – approval queue; one-click *Approve & Publish*, schedule, reject, edit caption/image, replace media, change type. Admins and managers can permanently delete library media and its stored variants.
8. **Publish** – Instagram Graph API (feed, story, carousel, reel). Built-in scheduler + n8n endpoints.

The local OpenCV path is non-generative and does not add or remove scene content. Wall/floor/ceiling/window and style scores use visual heuristics, not a semantic segmentation model. Scene and room labels use the existing vision analyzer; CV-only labels such as indoor/outdoor and daytime/evening are estimates rather than guaranteed semantic recognition. Radial lens distortion is not safely inferable from one photo without camera calibration, so its stage is intentionally a no-op unless a calibrated estimate is supplied. Instagram optimization preserves and pads the full frame rather than cropping construction details. OpenAI image editing is generative and can change construction details despite preservation instructions; it is explicitly opt-in, and outputs should be checked by a person before publishing. The deterministic perspective stage only applies very mild corrections when the full source frame can be kept; it skips transforms that would crop source pixels and uses edge replication if a correction exposes a narrow border. A style-reference image can steer photographic treatment but cannot make the output pixel-identical or guarantee that construction details are unchanged.

Each processed image also receives a versioned `scene_analysis` JSON document on its media record. Its `predictions` map contains a value and confidence for room, stage, style, environment, lighting, camera/perspective, material-area estimates, and photographic quality measurements. Pixel-based area and lighting estimates are heuristics rather than semantic segmentation. Add new detector functions with `scene_analyzer.register_detector`; detectors must emit unique field names and predictions containing `value` and `confidence`.

The OpenCV quality report is read-only and includes a 0–100 `quality_score`, an A–D `quality_grade`, a score and explanation for each photography category, and recommended actions. Composition, subject visibility, lighting, color accuracy, and material texture use image-measurement proxies; they are not semantic segmentation or reference-chart measurements.

The adaptive profile consumes that quality report and the structured `scene_analysis.predictions` values/confidences. It exposes bounded strengths for perspective, exposure, highlights, shadows, contrast, white balance, warmth, texture, clarity, wood, walls, windows, noise, sharpening, and Instagram fit, alongside compatible stage-specific keys. Instagram fit preserves the whole source frame.

The classical image stages are orchestrated by `backend/services/photo_pipeline.py`. Each run can disable named stages with the `enabled_stages` mapping or provide a custom ordered `PhotoStage` sequence. Successful and skipped stages log input/output measurements, execution time, and the profile strength applied; failures are logged with input measurements and re-raised.

`backend/services/segmentation.py` provides local text-prompted CLIPSeg masks for walls, wood, windows, glass, floor, ceiling, furniture, and construction materials. Install the optional runtime with `pip install -r backend/requirements-segmentation.txt`, then enable it with `SCENE_SEGMENTATION_ENABLED=true`. The model weights are downloaded from Hugging Face on first use and inference runs locally; uploaded images are not sent to a segmentation API. Set `SCENE_SEGMENTATION_MODEL` or `SCENE_SEGMENTATION_THRESHOLD` to configure the model or mask threshold. Masked enhancement stages blend their output only into detected regions. Without masks, they are skipped rather than applied globally; perspective and lens correction remain explicitly full-frame geometric transforms when segmentation is available. GPT Image polish is skipped when segmentation is active because its generative edits cannot be limited to those masks. When enabled and segmentation is off, GPT Image runs after the OpenCV pipeline and receives a saved copy of that enhanced output—not the original upload. Its prompt limits intended changes to photographic lighting, dynamic range, color, texture, realism, depth, and sharpness while prohibiting scene changes, but generative output cannot guarantee pixel-exact preservation and must be reviewed. Segmentation masks are transient and are not persisted with media records.

GPT Image prompts are built by `backend/services/prompt_builder.py` from the available room, project stage, lighting, style, material-area estimates, and quality report. Only applicable prompt templates are included, and the complete generated prompt is logged for debugging. `backend/services/decision_engine.py` records why each optional GPT polish is used or skipped: skip at quality 95+, skip construction progress above 90, polish completed interiors below 90, luxury scenes, or dark images. `USE_AI_EDITOR=true` is still required, and active segmentation masks always disable GPT polish because edits cannot be restricted to those masks. AI-polished results remain generative and should be reviewed before publishing.

`backend/services/learning_engine.py` stores one learning snapshot per processed still image. It keeps scene analysis, the quality report, adaptive profile, the actual GPT prompt when used, processing duration, and references to the original and enhanced assets. Instagram likes, reach, saves, and shares remain unset until measured; analytics sync updates the learning record with post-level engagement and its post ID.

The AI Dashboard at `/ai-dashboard` summarizes learning records and lets authenticated users inspect each image's before/after quality, adaptive profile, GPT prompt, engagement, and individual enhancement-stage inputs, outputs, strengths, mask coverage, and runtime. Quality gain is calculated from the before/after photography-quality reports. Set `OPENAI_IMAGE_COST_USD` in `backend/.env` to record a per-GPT-image-edit cost estimate; when it is blank, cost remains explicitly unpriced instead of using an assumed rate. The API-cost dashboard total represents configured GPT Image estimates only, not other AI or infrastructure provider charges.

## Keys (add any time in Settings — no redeploy)
| Service | Needed for | Where |
|---|---|---|
| OpenAI | AI analysis, captions, and optional AI image editing | Paste your API key into app Settings for text AI; set `OPENAI_API_KEY` in `backend/.env` and `USE_AI_EDITOR=true` to enable image editing |
| Cloudinary | Optional storage of processed enhanced images | cloudinary.com → Settings → API Keys; save all three credentials in Settings to enable |
| Instagram | Publishing + insights | Meta for Developers → long-lived token + IG Business Account ID |
| Google Drive | Select one Instagram parent folder; automatically import only from its `filtered images` child | Configure Google OAuth, Drive API, and Picker credentials in `backend/.env` |

### Google Drive setup and sync

1. In Google Cloud Console, create an OAuth client ID for a Web application, enable the Google Drive API, and add the callback URI `https://YOUR_BACKEND_HOST/api/settings/google-drive/oauth-callback` (use `http://localhost:8001/api/settings/google-drive/oauth-callback` locally).
2. Enable the Google Picker API in the same Cloud project. Create a browser API key and restrict it to your frontend origins and the Picker API. The OAuth consent screen must allow the read-only Drive scope used for listing and downloading files from `filtered images`.
3. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REDIRECT_URI` in `backend/.env`. The redirect URI must exactly match the URI registered with Google. Set `GOOGLE_PICKER_API_KEY` and `GOOGLE_CLOUD_PROJECT_NUMBER` (the numeric project number, used as Picker app ID).
4. Generate `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY` with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`, then keep that key stable and private. Refresh tokens are encrypted before they are stored in the existing per-company Settings document.
5. Restart the backend, open Settings â†’ Drive & n8n, connect Google Drive, then select the parent Instagram folder once. It must contain direct child folders named `dumped images` and `filtered images`; the app discovers and saves their IDs automatically. Only `filtered images` is monitored. Use Test Connection to verify access. If Google Drive was connected before Phase 2, reconnect it once to grant the new read-only file access scope.

The backend polls the selected parent folder every 30 seconds by default; set `GOOGLE_DRIVE_SYNC_INTERVAL_SECONDS` in `backend/.env` to change the interval (minimum 5 seconds). It lists direct child folders to find `dumped images` and `filtered images`, then scans only direct JPG, JPEG, PNG, WEBP, and HEIC files in `filtered images`. It never lists files in `dumped images`, skips subfolders and other file types, and avoids previously imported Drive file IDs. New images are passed through the existing media pipeline. Use **Import Now** in Settings to request an immediate check. Sync status is also shown on the Dashboard and is available at `GET /api/google-drive/status`; `POST /api/google-drive/sync` starts a manual sync.

## Run locally
```
cp backend/.env.example backend/.env   # fill values
docker compose up --build
```
API docs: `http://localhost:8001/api/docs`

## n8n setup
1. Settings → Drive & n8n → copy API key, set as env `INTERIOR_SOCIAL_API_KEY` in n8n.
2. Download the workflow template and import into n8n. Attach your Google Drive credential.
3. n8n only orchestrates: list the automatically discovered `filtered images` folder → `check-duplicates` → download new files → `ingest`; every minute → `posts/due` → `publish`. The `ingest` endpoints reject Drive file IDs that are outside the selected `filtered images` folder.

## Database
Runs on MongoDB (motor). Collections: users, projects, media (incl. analysis), posts (feed/story/carousel/reel with
captions, approval state, schedule), analytics, follower_snapshots, activity_logs, notifications, usage, settings, files.
