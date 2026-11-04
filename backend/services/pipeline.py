"""Media pipeline: ingest -> analyze -> enhance -> store -> plan post (approval queue)."""
import asyncio
import concurrent.futures
import hashlib
import io
import logging
import re
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from pillow_heif import register_heif_opener

from core.db import db, new_id, now_iso, NO_ID
from core.config import (
    EDITOR_MODE,
    EDITOR_STYLE_REFERENCE,
    SCENE_SEGMENTATION_ENABLED,
    USE_AI_EDITOR,
)
from services import (
    ai_analyzer,
    ai_image_editor as aiie,
    cloudinary_service as cld,
    decision_engine,
    image_editor as ie,
    photo_pipeline,
    reel_service,
    scene_analyzer,
    segmentation,
    storage_service as st,
)
from services.runtime_profiling import attach_stage_timings, finish_stage, start_stage
from services import (
    adaptive_profile,
    learning_engine,
    quality_analyzer,
    super_resolution,
)
from services.settings_service import get_settings, cloudinary_ready
from services.notification_service import notify, log_activity, track_usage
from services.carousel_service import plan_post
from services.template_service import TemplateService

log = logging.getLogger("pipeline")
register_heif_opener(thumbnails=False)
SEM = asyncio.Semaphore(2)
_tasks: set = set()
VIDEO_EXT = {"mp4", "mov", "m4v", "webm", "avi", "mkv"}
IMAGE_EXT = {"jpg", "jpeg", "png", "webp", "heic"}
STAGE_WORKERS = 4
GPT_PREPROCESS_STAGES = frozenset({
    "adaptive_exposure",
    "white_balance",
    "noise_reduction",
})
MAX_GPT_IMAGE_EDGE = 4096
DEBUG_STAGE_LABELS = {
    "perspective": "Perspective",
    "super_resolution": "AI Super Resolution",
    "lens_distortion": "Lens Distortion",
    "highlight_recovery": "Highlight Recovery",
    "shadow_recovery": "Shadow Recovery",
    "adaptive_exposure": "Exposure",
    "white_balance": "White Balance",
    "color_temperature": "Color Temperature",
    "wall_neutralization": "Wall Neutralization",
    "wood_tone": "Wood Tone",
    "floor_texture": "Floor Texture",
    "texture": "Texture",
    "detail_enhancement": "Detail Enhancement",
    "local_contrast": "Contrast",
    "micro_contrast": "Micro Contrast",
    "selective_sharpening": "Sharpening",
    "noise_reduction": "Noise Reduction",
    "window_glow": "Window Glow",
    "vignette": "Vignette",
    "instagram_crop": "Instagram Crop",
    "manual_adjustments": "Manual Adjustments",
    "gpt_image_polish": "GPT Image",
    "final": "Final",
}


def _debug_capture(
    stage: str,
    image_bgr: np.ndarray,
    diagnostic: dict | None = None,
    *,
    quality: dict | None = None,
    collect_quality: bool = False,
) -> dict:
    """Compress a stage checkpoint; expensive quality analysis is opt-in."""
    diagnostic = diagnostic or {}
    measured = quality or (quality_analyzer.analyze(image_bgr).as_dict() if collect_quality else {})
    height, width = image_bgr.shape[:2]
    scale = min(1.0, 1280 / max(height, width))
    sample = (
        cv2.resize(image_bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        if scale < 1
        else image_bgr
    )
    ok, encoded = cv2.imencode(".jpg", sample, [cv2.IMWRITE_JPEG_QUALITY, 84])
    if not ok:
        raise ValueError(f"Could not encode visual debug checkpoint {stage}")
    return {
        "stage": stage,
        "label": DEBUG_STAGE_LABELS.get(stage, stage.replace("_", " ").title()),
        "_jpeg_bytes": encoded.tobytes(),
        "status": diagnostic.get("status", "success"),
        "skipped": bool(diagnostic.get("skipped", not diagnostic.get("enabled", True))),
        "skip_reason": diagnostic.get("skip_reason"),
        "runtime_ms": diagnostic.get("execution_time_ms", (diagnostic.get("timing") or {}).get("duration_ms")),
        "quality_score": measured.get("quality_score"),
        "quality_grade": measured.get("quality_grade"),
        "quality_gain": None,
        "improvement_from_previous": None,
        "strength_applied": diagnostic.get("strength_applied") or {},
        "mask_classes": diagnostic.get("mask_classes") or [],
        "mask_coverage_pct": diagnostic.get("mask_coverage_pct"),
        "mean_pixel_difference": diagnostic.get("mean_pixel_difference"),
        "changed_pixel_pct": diagnostic.get("changed_pixel_pct"),
        "executed": diagnostic.get("executed", diagnostic.get("enabled", True)),
        "input_source": diagnostic.get("input_source"),
        "no_change_reason": diagnostic.get("no_change_reason"),
    }


def _processing_report(stage_timings: list[dict]) -> dict:
    opencv_ms = sum(
        timing["duration_ms"]
        for timing in stage_timings
        if timing.get("engine") == "opencv"
    )
    gpt_ms = sum(
        timing["duration_ms"]
        for timing in stage_timings
        if timing.get("engine") == "gpt_image" and not timing.get("skipped")
    )
    return {
        "stage_timings": stage_timings,
        "opencv_processing_time_ms": opencv_ms,
        "gpt_image_processing_time_ms": gpt_ms,
        "total_enhancement_time_ms": opencv_ms + gpt_ms,
    }


def _execution_report(stage_timings: list[dict], diagnostics: list[dict]) -> list[dict]:
    """Combine measured timings with stage execution and pixel-change diagnostics."""
    by_name = {item.get("stage"): item for item in diagnostics}
    report = []
    for timing in stage_timings:
        name = timing.get("stage")
        diagnostic = by_name.get(name, {})
        executed = bool(diagnostic.get("executed", not timing.get("skipped", False)))
        changed_pct = diagnostic.get("changed_pixel_pct")
        meaningful = changed_pct is None or float(changed_pct) >= 0.5
        reason = diagnostic.get("skip_reason")
        if timing.get("status") == "failed":
            reason = reason or "Stage failed; see server log for the processing error"
        elif not executed:
            reason = reason or diagnostic.get("no_change_reason") or "Stage was skipped"
        elif not meaningful:
            reason = diagnostic.get("no_change_reason") or (
                f"No meaningful visual effect: {float(changed_pct):.3f}% of pixels changed"
            )
        report.append({
            "stage": name,
            "stage_name": DEBUG_STAGE_LABELS.get(name, str(name or "Stage").replace("_", " ").title()),
            "executed": executed,
            "duration_ms": round(float(timing.get("duration_ms", 0)), 3),
            "skip_reason": reason,
            "mean_pixel_difference": diagnostic.get("mean_pixel_difference"),
            "changed_pixel_pct": changed_pct,
            "meaningful_visual_effect": meaningful,
            "status": timing.get("status", diagnostic.get("status", "success")),
        })
    return report


def schedule(media_id: str):
    t = asyncio.create_task(process_media(media_id))
    _tasks.add(t)
    t.add_done_callback(_tasks.discard)


def group_key(filename: str, folder: str | None) -> str:
    stem = Path(filename).stem.lower()
    for _ in range(2):
        stem = re.sub(r"[\s_\-()]*(\d+|copy|final|edit)$", "", stem)
    stem = re.sub(r"[^a-z0-9]+", "_", stem).strip("_") or "untitled"
    return f"{folder.strip().lower()}::{stem}" if folder else stem


def project_label(key: str, explicit: str | None) -> str:
    if explicit:
        return explicit.strip()
    return key.split("::")[0].replace("_", " ").title()


def _stage_signature(image: np.ndarray) -> dict[str, float]:
    height, width = image.shape[:2]
    scale = min(1.0, 320 / max(height, width))
    sample = (
        cv2.resize(
            image,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA,
        )
        if scale < 1
        else image
    )
    gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY)
    return {
        "brightness": round(float(np.mean(gray)), 2),
        "contrast": round(float(np.std(gray)), 2),
        "clipped_highlights_pct": round(float(np.mean(gray >= 250) * 100), 3),
        "clipped_shadows_pct": round(float(np.mean(gray <= 5) * 100), 3),
    }


def _source_image_metadata(path: Path) -> dict:
    """Keep camera metadata while neutralizing EXIF orientation after transpose."""
    metadata = {}
    try:
        with Image.open(path) as source:
            exif = source.getexif()
            if exif:
                exif[274] = 1
                metadata["exif"] = exif.tobytes()
            if source.info.get("icc_profile"):
                metadata["icc_profile"] = source.info["icc_profile"]
            if source.info.get("dpi"):
                metadata["dpi"] = source.info["dpi"]
    except Exception:
        log.warning("Could not read source image metadata from %s", path, exc_info=True)
    return metadata


def enhance_photo(
    img: Image.Image,
    preset: str = "AUTO",
    vision: dict | None = None,
    scene_analysis: dict | None = None,
    enabled_stages: dict[str, bool] | None = None,
    stage_observer=None,
    learned_adjustments: dict | None = None,
    lightweight_preprocessing: bool = False,
) -> tuple[Image.Image, dict, dict]:
    """Analyze, profile, and run the adaptive deterministic photo stages."""
    bgr = cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2BGR)
    source_dimensions = [int(bgr.shape[1]), int(bgr.shape[0])]
    source_quality = quality_analyzer.analyze(bgr)
    metrics = source_quality.as_dict()
    resize_started = start_stage()
    resized = False
    if lightweight_preprocessing and max(bgr.shape[:2]) > MAX_GPT_IMAGE_EDGE:
        scale = MAX_GPT_IMAGE_EDGE / max(bgr.shape[:2])
        bgr = cv2.resize(
            bgr, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA
        )
        resized = True
    resize_timing = finish_stage(
        "opencv_resize", resize_started, status="success", engine="opencv",
        skipped=not resized,
    )
    resize_diagnostic = {
        "stage": "opencv_resize", "enabled": resized, "requested": True,
        "executed": resized, "status": "success", "timing": resize_timing,
        "execution_time_ms": resize_timing["duration_ms"],
        "strength_applied": {"max_edge": MAX_GPT_IMAGE_EDGE},
        "input_pixel_dimensions": source_dimensions,
        "output_pixel_dimensions": [int(bgr.shape[1]), int(bgr.shape[0])],
        "skip_reason": None if resized else "Image is already within the GPT input edge limit",
        "no_change_reason": None if resized else "No resize was needed",
    }
    if stage_observer is not None:
        stage_observer("opencv_resize", bgr, resize_diagnostic)
    superres_started = start_stage()
    if lightweight_preprocessing:
        enhanced_bgr = bgr
        superres_result = {
            "executed": False,
            "algorithm": None,
            "scale": 1,
            "input_dimensions": [int(bgr.shape[1]), int(bgr.shape[0])],
            "output_dimensions": [int(bgr.shape[1]), int(bgr.shape[0])],
            "skip_reason": "Super-resolution is disabled for lightweight GPT-first preprocessing",
        }
    else:
        enhanced_bgr, superres_result = super_resolution.upscale(bgr)
    superres_timing = finish_stage(
        "super_resolution", superres_started,
        status="success" if superres_result.get("executed") else "skipped",
        engine="opencv", skipped=not superres_result.get("executed"),
    )
    superres_comparison = cv2.resize(
        enhanced_bgr, (bgr.shape[1], bgr.shape[0]), interpolation=cv2.INTER_AREA
    ) if enhanced_bgr.shape[:2] != bgr.shape[:2] else enhanced_bgr
    superres_diagnostic = {
        "stage": "super_resolution",
        "enabled": bool(superres_result.get("executed")),
        "requested": True,
        "executed": bool(superres_result.get("executed")),
        "status": "success" if superres_result.get("executed") else "skipped",
        "input": {"dimensions": superres_result["input_dimensions"]},
        "output": {"dimensions": superres_result.get("output_dimensions", superres_result["input_dimensions"])},
        "execution_time_ms": superres_timing["duration_ms"],
        "timing": superres_timing,
        "strength_applied": {"algorithm": superres_result.get("algorithm"), "scale": superres_result.get("scale")},
        "mean_pixel_difference": round(float(np.mean(cv2.absdiff(bgr, superres_comparison))), 6),
        "changed_pixel_pct": round(float(np.mean(np.any(bgr != superres_comparison, axis=2)) * 100), 4),
        "input_source": "original_input",
        "input_pixel_dimensions": superres_result["input_dimensions"],
        "output_pixel_dimensions": superres_result.get("output_dimensions", superres_result["input_dimensions"]),
        "skip_reason": superres_result.get("skip_reason"),
        "no_change_reason": superres_result.get("skip_reason"),
    }
    if stage_observer is not None:
        stage_observer("super_resolution", enhanced_bgr, superres_diagnostic)
    segmentation_result = None
    if SCENE_SEGMENTATION_ENABLED and not lightweight_preprocessing:
        segmentation_result = segmentation.segment(enhanced_bgr)
    measured = quality_analyzer.analyze(enhanced_bgr)
    stage_metrics = measured.as_dict()
    profile = adaptive_profile.build_profile(
        stage_metrics,
        preset,
        vision,
        scene_analysis=scene_analysis,
        quality_report=stage_metrics,
    )
    learned_adjustments = learned_adjustments or {}
    adaptive_profile.apply_learning_weights(
        profile, learned_adjustments.get("weights", {}), learned_adjustments.get("version", 0)
    )
    profile["scene"]["room_type"] = (vision or {}).get(
        "room_type",
        stage_metrics.get("room_type", "Unknown"),
    )
    log.info(
        "image_enhancement_analysis",
        extra={
            "image_dimensions": [img.width, img.height],
            "quality_metrics": metrics,
            "stage_quality_metrics": stage_metrics,
            "enhancement_profile": profile,
            "segmentation_enabled": segmentation_result is not None,
            "nonzero_adaptive_strengths": {
                name: value for name, value in (profile.get("strengths") or {}).items()
                if isinstance(value, (int, float)) and abs(float(value)) > 1e-9
            },
        },
    )

    stage_plan = None
    stage_switches = enabled_stages
    if lightweight_preprocessing:
        stage_plan = tuple(
            stage for stage in photo_pipeline._build_stages(measured)
            if stage.name in GPT_PREPROCESS_STAGES
        )
        stage_switches = {
            stage.name: bool((enabled_stages or {}).get(stage.name, True))
            for stage in stage_plan
        }
    enhanced_bgr, stage_diagnostics = photo_pipeline.run_pipeline(
        enhanced_bgr,
        profile,
        measured,
        enabled_stages=stage_switches,
        stages=stage_plan,
        masks=(
            segmentation_result.masks
            if segmentation_result is not None
            else None
        ),
        stage_observer=stage_observer,
    )
    profile["stages"] = list(stage_diagnostics)
    profile["super_resolution"] = superres_result
    profile["source_quality_score"] = metrics.get("quality_score")
    profile["source_dimensions"] = source_dimensions
    profile["preprocessed_dimensions"] = [int(enhanced_bgr.shape[1]), int(enhanced_bgr.shape[0])]
    profile["segmentation"] = (
        segmentation_result.summary()
        if segmentation_result is not None
        else {"enabled": False, "reason": "AI segmentation is disabled"}
    )
    log.info(
        "image_enhancement_output_returned",
        extra={
            "width": int(enhanced_bgr.shape[1]),
            "height": int(enhanced_bgr.shape[0]),
            "output_is_processed_pipeline_result": True,
            "executed_stages": [stage["stage"] for stage in profile["stages"] if stage.get("executed")],
            "skipped_stages": [
                {"stage": stage["stage"], "reason": stage.get("skip_reason")}
                for stage in profile["stages"] if not stage.get("executed")
            ],
        },
    )
    rgb = cv2.cvtColor(enhanced_bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb), metrics, profile


def enhance_batch(
    images: list[Image.Image],
    preset: str = "AUTO",
    vision: list[dict | None] | None = None,
    max_workers: int = STAGE_WORKERS,
) -> list[tuple[Image.Image, dict, dict]]:
    """Enhance independent images concurrently, retaining input result order."""
    if max_workers < 1:
        raise ValueError("max_workers must be at least 1")
    classifications = vision or [None] * len(images)
    if len(classifications) != len(images):
        raise ValueError("vision must contain one classification per image")
    with concurrent.futures.ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix="photo-enhance",
    ) as executor:
        futures = [
            executor.submit(enhance_photo, image, preset, classification)
            for image, classification in zip(images, classifications)
        ]
        return [future.result() for future in futures]


async def ingest(data: bytes, filename: str, mime: str, source: str, user: dict | None = None,
                 drive_file_id: str | None = None, folder: str | None = None, project_name: str | None = None,
                 integration_metadata: dict | None = None):
    if drive_file_id:
        existing = await db.media.find_one({"$or": [{"drive_file_id": drive_file_id}, {"google_drive_file_id": drive_file_id}]}, NO_ID)
        if existing:
            return existing, True
    checksum = hashlib.sha256(data).hexdigest()
    existing = await db.media.find_one({"checksum": checksum}, NO_ID)
    if existing:
        return existing, True
    ext = (filename.rsplit(".", 1)[-1] if "." in filename else "").lower()
    kind = "video" if (mime or "").startswith("video") or ext in VIDEO_EXT else "image"
    if kind == "image" and ext not in IMAGE_EXT:
        raise ValueError(f"Unsupported file type: {filename}. Use JPG, PNG, WEBP, MP4 or MOV.")
    media_id = new_id()
    original = f"{media_id}_original.{ext or ('mp4' if kind == 'video' else 'jpg')}"
    st.work_path(original).write_bytes(data)
    url = await st.put_bytes(original, data, mime or ("video/mp4" if kind == "video" else "image/jpeg"))
    key = group_key(filename, folder or project_name)
    pname = project_label(key, project_name or folder)
    await db.projects.update_one({"key": key}, {"$setOnInsert": {"id": new_id(), "key": key, "name": pname, "created_at": now_iso()}},
                                 upsert=True)
    project = await db.projects.find_one({"key": key}, NO_ID)
    drive_metadata = integration_metadata or {}
    doc = {
        "id": media_id, "filename": filename, "mime": mime, "kind": kind, "source": source,
        "drive_file_id": drive_file_id, "folder": folder, "project_id": project["id"], "project_name": pname,
        "group_key": key, "checksum": checksum, "size_bytes": len(data), "files": {"original": original},
        "urls": {"original": url}, "status": "queued", "analysis": None, "scene_analysis": None,
        "quality": None, "is_duplicate": False,
        "uploaded_by": (user or {}).get("name", "n8n" if source == "drive" else "System"), "created_at": now_iso(),
    }
    if source == "google_drive":
        doc.update({
            "google_drive_file_id": drive_file_id,
            "google_drive_folder_id": drive_metadata.get("folder_id"),
            "google_drive_parent_folder_id": drive_metadata.get("parent_folder_id"),
            "google_drive_url": drive_metadata.get("web_view_link"),
            "drive_folder_id": drive_metadata.get("folder_id"),
            "drive_file_name": filename,
            "drive_web_view_link": drive_metadata.get("web_view_link"),
            "sync_status": "processing",
            "sync_time": now_iso(),
        })
    await db.media.insert_one(dict(doc))
    await log_activity("media_uploaded", f"{filename} received from {source}", user, media_id, "media")
    schedule(media_id)
    doc.pop("_id", None)
    return doc, False


async def process_media(media_id: str):
    async with SEM:
        m = await db.media.find_one({"id": media_id}, NO_ID)
        if not m:
            return
        await db.media.update_one({"id": media_id}, {"$set": {"status": "processing", "error": None}})
        s = await get_settings()
        try:
            if m["kind"] == "image":
                await _process_image(m, s)
            else:
                await _process_video(m, s)
            m = await db.media.find_one({"id": media_id}, NO_ID)
            post = await plan_post(m, s)
            await notify("processing_completed", "Media processed", f"{m['filename']} analysed as "
                         f"{m['analysis'].get('room_type')} · {m['analysis'].get('content_type')}", f"/library?media={media_id}")
            if post:
                await notify("approval_required", "Approval required", f"New {post['type']} ready: {post['title']}",
                             f"/approvals/{post['id']}")
        except Exception as e:
            log.exception("Processing failed for %s", media_id)
            processing_report = getattr(e, "processing_report", None)
            if processing_report is None and hasattr(e, "stage_timings"):
                processing_report = _processing_report(e.stage_timings)
            updates = {"status": "failed", "error": str(e)[:500]}
            if processing_report is not None:
                updates["processing_report"] = processing_report
            await db.media.update_one({"id": media_id}, {"$set": updates})
            await notify("processing_failed", "Processing failed", f"{m['filename']}: {str(e)[:160]}", "/library")


async def _find_duplicate(media_id: str, h: str) -> str | None:
    async for other in db.media.find({"ahash": {"$ne": None}, "id": {"$ne": media_id}, "kind": "image"}, {"id": 1, "ahash": 1}):
        if other.get("ahash") and ie.hamming(h, other["ahash"]) <= 4:
            return other["id"]
    return None


async def render_image_outputs(
    m: dict,
    s: dict,
    adj: dict | None = None,
    classification: dict | None = None,
    scene_analysis: dict | None = None,
    enabled_stages: dict[str, bool] | None = None,
) -> dict:
    """Run OpenCV preprocessing + generate social variants. GPT is only user-triggered."""
    src = await st.fetch_local(m["files"]["original"])
    source_metadata = _source_image_metadata(src)
    img = ie.load(src)
    preset = s.get("enhancement_preset", "AUTO")
    room_type = (classification or {}).get("room_type", "unknown")
    if isinstance(room_type, dict):
        room_type = room_type.get("value", "unknown")
    learned_adjustments = await learning_engine.adaptive_adjustments(room_type, preset)
    debug_enabled = bool(s.get("visual_debug_enabled", False))
    debug_captures = []
    def capture_stage(stage_name, image_bgr, diagnostic, *, quality=None):
        try:
            debug_captures.append(_debug_capture(
                stage_name, image_bgr, diagnostic, quality=quality,
                collect_quality=debug_enabled,
            ))
        except Exception:
            log.warning("Could not capture pipeline stage %s for %s", stage_name, m["id"], exc_info=True)

    def observe_debug_stage(stage_name, image_bgr, diagnostic):
        capture_stage(stage_name, image_bgr, diagnostic)
    enhanced, metrics, profile = await asyncio.to_thread(
        enhance_photo, img, preset, classification, scene_analysis, enabled_stages,
        observe_debug_stage, learned_adjustments, True,
    )
    opencv_pixels = np.asarray(enhanced.convert("RGB"))
    original_pixels = np.asarray(img.convert("RGB"))
    opencv_comparison = (
        cv2.resize(opencv_pixels, (original_pixels.shape[1], original_pixels.shape[0]), interpolation=cv2.INTER_AREA)
        if opencv_pixels.shape[:2] != original_pixels.shape[:2]
        else opencv_pixels
    )
    opencv_mean_difference = float(np.mean(cv2.absdiff(original_pixels, opencv_comparison)))
    log.info(
        "opencv_output_pixel_difference",
        extra={
            "media_id": m["id"],
            "mean_pixel_difference": round(opencv_mean_difference, 6),
            "threshold": photo_pipeline.PIXEL_CHANGE_THRESHOLD,
            "processed_image_returned": enhanced is not img,
        },
    )
    original_score = metrics.get("quality_score")
    try:
        debug_captures.insert(0, _debug_capture(
            "original", cv2.cvtColor(np.asarray(img.convert("RGB")), cv2.COLOR_RGB2BGR),
            quality=metrics if debug_enabled else None, collect_quality=debug_enabled,
        ))
    except Exception:
        log.warning("Could not capture original pipeline checkpoint for %s", m["id"], exc_info=True)
    stage_timings = [
        stage["timing"]
        for stage in profile.get("stages", [])
        if stage.get("timing")
    ]
    legacy_metrics = ie.quality_metrics(img)
    metrics.update({
        "overall": legacy_metrics["overall"],
        "width": img.width,
        "height": img.height,
        "room_type": (classification or {}).get("room_type", "Unknown"),
    })
    if adj:
        adjustment_started = start_stage()
        manual_input = enhanced.copy()
        try:
            enhanced = await asyncio.to_thread(
                ie.enhance,
                enhanced,
                ie.quality_metrics(enhanced),
                adj,
            )
            stage_timings.append(finish_stage(
                "manual_adjustments", adjustment_started, status="success", engine="opencv"
            ))
            manual_pixels = np.asarray(enhanced.convert("RGB"))
            before_manual_pixels = np.asarray(manual_input.convert("RGB"))
            manual_difference = float(np.mean(cv2.absdiff(before_manual_pixels, manual_pixels)))
            manual_diagnostic = {
                "stage": "manual_adjustments", "enabled": True, "requested": True,
                "executed": True, "status": "success", "execution_time_ms": stage_timings[-1]["duration_ms"],
                "timing": stage_timings[-1], "strength_applied": dict(adj),
                "mean_pixel_difference": round(manual_difference, 6),
                "changed_pixel_pct": round(float(np.mean(np.any(before_manual_pixels != manual_pixels, axis=2)) * 100), 4),
                "input_source": "previous_stage_output",
            }
            if manual_difference <= photo_pipeline.PIXEL_CHANGE_THRESHOLD:
                manual_diagnostic["no_change_reason"] = "Manual adjustment strengths produced no measurable pixel change"
            profile.setdefault("stages", []).append(manual_diagnostic)
            log.info("image_enhancement_stage", extra=manual_diagnostic)
            capture_stage("manual_adjustments", cv2.cvtColor(manual_pixels, cv2.COLOR_RGB2BGR), manual_diagnostic)
        except Exception as exc:
            stage_timings.append(finish_stage(
                "manual_adjustments", adjustment_started, status="failed", engine="opencv"
            ))
            attach_stage_timings(exc, stage_timings)
            setattr(exc, "processing_report", _processing_report(stage_timings))
            raise
    opencv_preprocessed = enhanced.copy()
    quality_before_gpt = quality_analyzer.analyze(
        cv2.cvtColor(
            np.asarray(enhanced.convert("RGB")),
            cv2.COLOR_RGB2BGR,
        )
    ).as_dict()
    profile["quality_before_gpt"] = quality_before_gpt
    gpt_decision = decision_engine.decide(
        quality_before_gpt,
        classification=classification,
        scene_analysis=scene_analysis,
        enabled=bool(USE_AI_EDITOR),
        segmentation_enabled=bool((scene_analysis or {}).get("segmentation_enabled") or (classification or {}).get("segmentation_enabled")),
        selected_preset=preset,
    )
    log.info(
        "gpt_image_decision",
        extra={"media_id": m["id"], "decision": gpt_decision},
    )
    profile["gpt_image_decision"] = gpt_decision
    stage_diagnostics = profile.setdefault("stages", [])
    editor_mode = (
        profile["preset"].lower()
        if profile["preset"] != "AUTO"
        else EDITOR_MODE
    )
    gpt_prompt = aiie.prompt_for_mode(
        editor_mode,
        has_style_reference=bool(EDITOR_STYLE_REFERENCE),
        classification=classification,
        scene_analysis=scene_analysis,
        quality_report=quality_before_gpt,
        brand_style=s.get("custom_editing_style", ""),
        brand_prompt_template=s.get("brand_prompt_template", ""),
    )
    profile["gpt_prompt"] = gpt_prompt if gpt_decision["run_gpt"] else None
    profile["gpt_prompt_used"] = bool(gpt_decision["run_gpt"])
    profile["gpt_image_status"] = "completed" if gpt_decision["run_gpt"] else "not_run"
    profile["gpt_image_request_id"] = None
    profile["gpt_image_attempt_count"] = 0
    profile["gpt_image_billable_attempt_count"] = 0
    gpt_prompt = gpt_prompt if gpt_decision["run_gpt"] else None
    gpt_request_id = None
    gpt_attempt_count = 0
    gpt_billable_attempts = 0
    enhanced_by = "opencv"
    profile["gpt_prompt_preview"] = aiie.prompt_for_mode(
        editor_mode, has_style_reference=bool(EDITOR_STYLE_REFERENCE),
        classification=classification, scene_analysis=scene_analysis,
        quality_report=quality_before_gpt,
        brand_style=s.get("custom_editing_style", ""),
        brand_prompt_template=s.get("brand_prompt_template", ""),
    )
    profile.setdefault("stages", []).append({
        "stage": "gpt_image_polish", "enabled": False, "executed": False,
        "status": "not_run", "skip_reason": "Waiting for explicit user request",
    })
    suffix = new_id()[:6] if adj else "v1"
    after_quality = quality_analyzer.analyze(
        cv2.cvtColor(
            np.asarray(enhanced.convert("RGB")),
            cv2.COLOR_RGB2BGR,
        )
    ).as_dict()
    final_pixels = np.asarray(enhanced.convert("RGB"))
    final_comparison = (
        cv2.resize(final_pixels, (original_pixels.shape[1], original_pixels.shape[0]), interpolation=cv2.INTER_AREA)
        if final_pixels.shape[:2] != original_pixels.shape[:2]
        else final_pixels
    )
    final_mean_difference = float(np.mean(cv2.absdiff(original_pixels, final_comparison)))
    if final_mean_difference <= photo_pipeline.PIXEL_CHANGE_THRESHOLD:
        unchanged_stages = [
            {
                "stage": stage.get("stage"),
                "executed": stage.get("executed", stage.get("enabled", False)),
                "mean_pixel_difference": stage.get("mean_pixel_difference"),
                "reason": stage.get("no_change_reason") or stage.get("skip_reason"),
            }
            for stage in profile.get("stages", [])
            if (stage.get("mean_pixel_difference") or 0) <= photo_pipeline.PIXEL_CHANGE_THRESHOLD
        ]
        log.warning(
            "final_image_matches_original",
            extra={
                "media_id": m["id"],
                "mean_pixel_difference": round(final_mean_difference, 6),
                "threshold": photo_pipeline.PIXEL_CHANGE_THRESHOLD,
                "gpt_used": False,
                "unchanged_stages": unchanged_stages,
            },
        )
    log.info(
        "final_quality_recalculated",
        extra={
            "media_id": m["id"],
            "source": "final_opencv_image",
            "quality_before": metrics.get("quality_score"),
            "quality_after": after_quality.get("quality_score"),
            "quality_gain": (
                after_quality.get("quality_score", 0) - metrics.get("quality_score", 0)
            ),
        },
    )
    capture_stage(
        "final", cv2.cvtColor(np.asarray(enhanced.convert("RGB")), cv2.COLOR_RGB2BGR),
        {"status": "success", "executed": True}, quality=after_quality if debug_enabled else None,
    )
    if debug_enabled:
        previous_score = original_score
        for checkpoint in debug_captures:
            score = checkpoint.get("quality_score")
            checkpoint["quality_gain"] = round(score - original_score, 3) if score is not None and original_score is not None else None
            checkpoint["improvement_from_previous"] = round(score - previous_score, 3) if score is not None and previous_score is not None else None
            if score is not None:
                previous_score = score
    profile["final_mean_pixel_difference"] = round(final_mean_difference, 6)
    profile["final_quality_source"] = "final_opencv_image"
    quality_gain = (
        after_quality["quality_score"] - metrics["quality_score"]
        if "quality_score" in after_quality and "quality_score" in metrics
        else None
    )
    image_request_price = s.get("gpt_image_cost_per_request_usd")
    api_cost_usd = 0.0
    files, urls = dict(m["files"]), dict(m["urls"])
    stale_gpt_file = files.pop("gpt", None)
    urls.pop("gpt", None)
    stale_debug_files = [value for key, value in files.items() if key.startswith("debug_stage_")]
    for key in list(files):
        if key.startswith("debug_stage_"):
            files.pop(key, None)
            urls.pop(key, None)
    wm = (s.get("watermark_text") or s.get("brand_name")) if s.get("watermark_enabled") else ""
    outputs = {"opencv": opencv_preprocessed, "enhanced": enhanced}
    for name, size in ie.VARIANTS.items():
        outputs[name] = ie.make_variant(enhanced, size, wm)
    for name, im in outputs.items():
        fname = f"{m['id']}_{name}_{suffix}.jpg"
        output_path = st.work_path(fname)
        ie.save_jpeg(im, output_path, metadata=source_metadata)
        if name == "enhanced":
            saved_pixels = np.asarray(ie.load(output_path).convert("RGB"))
            expected_pixels = np.asarray(enhanced.convert("RGB"))
            saved_mean_difference = float(np.mean(cv2.absdiff(expected_pixels, saved_pixels)))
            log.info(
                "processed_image_saved",
                extra={
                    "media_id": m["id"], "file": fname,
                    "source": "enhanced_pipeline_result",
                    "saved_image_mean_difference_from_processed": round(saved_mean_difference, 6),
                    "saved_dimensions": [int(saved_pixels.shape[1]), int(saved_pixels.shape[0])],
                },
            )
        files[name] = fname
        urls[name] = await st.put_file(fname, output_path, "image/jpeg")
    processing_report = _processing_report(stage_timings)
    stage_images = []
    if debug_captures:
        stage_file_number = 0
        for index, checkpoint in enumerate(debug_captures):
            key = f"debug_stage_{index:02d}"
            checkpoint_stage = checkpoint.get("stage")
            if checkpoint_stage == "original":
                fname = f"{m['id']}_original.jpg"
            elif checkpoint_stage == "final":
                fname = f"{m['id']}_final.jpg"
            else:
                stage_file_number += 1
                fname = f"{m['id']}_stage{stage_file_number:02d}_{checkpoint_stage}.jpg"
            try:
                url = await st.put_bytes(fname, checkpoint.pop("_jpeg_bytes"), "image/jpeg")
                files[key] = fname
                urls[key] = url
                stage_images.append({**checkpoint, "file": fname, "url": url})
            except Exception:
                log.warning("Could not store visual debug checkpoint %s for %s", key, m["id"], exc_info=True)
    processing_report["debug_mode"] = debug_enabled
    processing_report["stage_images"] = stage_images
    processing_report["execution_report"] = _execution_report(
        stage_timings, profile.get("stages", [])
    )
    processing_report.update({
        "gpt_image_status": profile.get("gpt_image_status"),
        "gpt_image_request_id": gpt_request_id,
        "gpt_image_attempt_count": gpt_attempt_count,
        "gpt_image_billable_attempt_count": gpt_billable_attempts,
        "gpt_image_error": profile.get("gpt_image_error"),
        "enhancement_prompt": None,
        "estimated_gpt_cost_usd": float(image_request_price or 0),
        "estimated_gpt_time_seconds": 15,
        "opencv_processing_time_ms": sum(float(t.get("duration_ms", 0) or 0) for t in stage_timings),
        "gpt_image_processing_time_ms": 0,
        "actual_gpt_cost_usd": None,
        "opencv_intermediate_image": {"file": files.get("opencv"), "url": urls.get("opencv")},
    })
    if stale_debug_files:
        try:
            await st.delete_media_assets(stale_debug_files)
        except Exception:
            log.warning("Could not remove previous visual debug checkpoints for %s", m["id"], exc_info=True)
    if stale_gpt_file:
        try:
            await st.delete_media_assets([stale_gpt_file])
        except Exception:
            log.warning("Could not remove previous GPT output for %s", m["id"], exc_info=True)
    profile["stage_timings"] = stage_timings
    quality_record = {
        **metrics,
        "before": metrics,
        "after": after_quality,
        "after_opencv": after_quality,
        "after_gpt": None,
        "quality_gain": quality_gain,
    }
    updates = {"files": files, "urls": urls, "local_urls": dict(urls), "quality": quality_record,
               "enhanced_quality": ie.quality_metrics(enhanced), "edit_adjustments": adj or {},
               "quality_after": after_quality,
               "quality_gain": quality_gain,
               "api_cost_usd": api_cost_usd,
               "gpt_request_id": gpt_request_id,
               "gpt_image_status": profile.get("gpt_image_status"),
               "gpt_image_attempt_count": gpt_attempt_count,
               "gpt_image_error": None,
               "enhancement_prompt": None,
               "estimated_gpt_cost_usd": float(image_request_price or 0),
               "estimated_gpt_time_seconds": 15,
               "opencv_processing_time_ms": processing_report["opencv_processing_time_ms"],
               "gpt_image_processing_time_ms": 0,
               "actual_gpt_cost_usd": None,
               "enhancement_profile": profile,
               "gpt_image_decision": gpt_decision,
               "gpt_prompt": gpt_prompt,
               "processing_report": processing_report}
    if gpt_decision.get("run_gpt") and bool(USE_AI_EDITOR):
        gpt_updates = await enhance_media_with_gpt(
            {
                "id": m["id"],
                "files": dict(files),
                "urls": dict(urls),
                "analysis": classification,
                "scene_analysis": scene_analysis,
                "enhancement_profile": profile,
                "quality": quality_record,
                "processing_report": processing_report,
                "processing_time_seconds": float(m.get("processing_time_seconds") or 0),
            },
            s,
        )
        updates["files"] = gpt_updates.get("files", updates["files"])
        updates["urls"] = gpt_updates.get("urls", updates["urls"])
        updates["local_urls"] = gpt_updates.get("local_urls", updates["local_urls"])
        updates["quality"] = gpt_updates.get("quality", updates["quality"])
        updates["quality_after"] = gpt_updates.get("quality_after", updates["quality_after"])
        updates["quality_gain"] = gpt_updates.get("quality_gain", updates["quality_gain"])
        updates["enhanced_quality"] = gpt_updates.get("enhanced_quality", updates["enhanced_quality"])
        updates["gpt_request_id"] = gpt_updates.get("gpt_request_id", updates["gpt_request_id"])
        updates["gpt_image_status"] = gpt_updates.get("gpt_image_status", updates["gpt_image_status"])
        updates["gpt_image_processing_time_ms"] = gpt_updates.get("gpt_image_processing_time_ms", updates["gpt_image_processing_time_ms"])
        updates["gpt_image_attempt_count"] = gpt_updates.get("gpt_image_attempt_count", updates["gpt_image_attempt_count"])
        updates["gpt_image_error"] = gpt_updates.get("gpt_image_error", updates["gpt_image_error"])
        updates["enhancement_prompt"] = gpt_updates.get("enhancement_prompt", updates["enhancement_prompt"])
        updates["actual_gpt_cost_usd"] = gpt_updates.get("actual_gpt_cost_usd", updates["actual_gpt_cost_usd"])
        updates["api_cost_usd"] = gpt_updates.get("api_cost_usd", updates["api_cost_usd"])
        updates["enhancement_profile"] = gpt_updates.get("enhancement_profile", updates["enhancement_profile"])
        updates["gpt_image_decision"] = gpt_updates.get("gpt_image_decision", gpt_decision)
        updates["gpt_prompt"] = gpt_updates.get("gpt_prompt", updates["gpt_prompt"])
        updates["processing_report"] = gpt_updates.get("processing_report", updates["processing_report"])
        updates["enhanced_by"] = "openai"
        gpt_decision = updates["gpt_image_decision"]
        profile["gpt_image_decision"] = gpt_decision
        profile["gpt_prompt"] = updates.get("gpt_prompt")
        profile["gpt_image_status"] = gpt_updates.get("gpt_image_status")
    if cloudinary_ready(s):
        try:
            up = await cld.upload(s, st.work_path(files["enhanced"]), f"{m['id']}_enhanced")
            await track_usage("cloudinary", "upload")
            updates["cloudinary_enhanced_public_id"] = up["public_id"]
            urls["cloudinary_enhanced"] = up["url"]
        except Exception as e:
            log.warning("Cloudinary upload failed, keeping local image outputs: %s", e)
    updates["enhanced_by"] = "openai" if gpt_decision.get("run_gpt") else enhanced_by
    log.info(
        "Adaptive enhancement profile for %s: %s",
        m["id"],
        profile,
    )
    return updates


async def enhance_media_with_gpt(
    m: dict,
    s: dict,
    editor_mode: str | None = None,
    custom_prompt: str | None = None,
    source_file_name: str | None = None,
) -> dict:
    """Run GPT Image for an explicit request, optionally using an approval-selected source and mode."""
    started = start_stage()
    files, urls = dict(m.get("files") or {}), dict(m.get("urls") or {})
    source_file = source_file_name or files.get("opencv") or files.get("enhanced")
    if not source_file:
        raise ValueError("OpenCV preview is not available")
    source_path = st.work_path(f"{m['id']}_gpt_input_{new_id()[:6]}.jpg")
    output_path = st.work_path(f"{m['id']}_gpt_output_{new_id()[:6]}.png")
    opencv_path = Path(st.work_path(source_file))
    if opencv_path.is_file():
        source = Image.open(opencv_path).convert("RGB")
        source_metadata = _source_image_metadata(opencv_path)
    else:
        source_bytes = await st.fetch_local(source_file)
        source = Image.open(io.BytesIO(source_bytes)).convert("RGB")
        source_metadata = {}
    ie.save_jpeg(source, source_path, quality=95, metadata=source_metadata)
    quality_before_gpt = quality_analyzer.analyze(
        cv2.cvtColor(np.asarray(source.convert("RGB")), cv2.COLOR_RGB2BGR)
    ).as_dict()
    profile = m.get("enhancement_profile") or {}
    preset = profile.get("preset", s.get("enhancement_preset", "AUTO"))
    editor_mode = editor_mode or (preset.lower() if preset != "AUTO" else EDITOR_MODE)
    prompt = aiie.prompt_for_mode(
        editor_mode, has_style_reference=bool(EDITOR_STYLE_REFERENCE),
        classification=m.get("analysis"), scene_analysis=m.get("scene_analysis"),
        quality_report=quality_before_gpt,
        brand_style=s.get("custom_editing_style", ""),
        brand_prompt_template=s.get("brand_prompt_template", ""),
    )
    if custom_prompt:
        prompt = (
            f"{prompt}\n\nAdditional photographic guidance requested by the user: "
            f"{custom_prompt.strip()[:1000]}\n"
            "Apply this guidance only to photographic tone, lighting balance, color, "
            "and detail. The target's scene, architecture, materials, objects, and framing "
            "must remain unchanged."
        )
    request_id = None
    attempts = 0
    billable = 0
    try:
        for attempts in range(1, 3):
            output_path.unlink(missing_ok=True)
            returned = False
            try:
                result = await asyncio.to_thread(
                    aiie.edit_image, str(source_path), str(output_path), editor_mode,
                    style_reference_path=EDITOR_STYLE_REFERENCE or None,
                    classification=m.get("analysis"), scene_analysis=m.get("scene_analysis"),
                    quality_report=quality_before_gpt, generated_prompt=prompt,
                    api_key=s.get("openai_api_key") or None,
                )
                returned = True
                request_id = (result or {}).get("request_id") if isinstance(result, dict) else None
                billable += 1
                try:
                    await track_usage("openai", "edit_image", cost_usd=s.get("gpt_image_cost_per_request_usd"))
                except Exception:
                    log.warning("Could not record GPT Image usage for %s", m["id"], exc_info=True)
                edited = Image.open(output_path).convert("RGB")
                source_ratio = source.width / source.height
                if abs((edited.width / edited.height) - source_ratio) / source_ratio > 0.005:
                    raise aiie.AIImageEditError("GPT Image returned a changed aspect ratio")
                if edited.size != source.size:
                    edited = edited.resize(source.size, Image.Resampling.LANCZOS)
                break
            except Exception as exc:
                request_id = getattr(exc, "request_id", None) or getattr(exc, "_request_id", None) or request_id
                log.exception("User-requested GPT Image edit failed", extra={"media_id": m["id"], "attempt": attempts})
                if not returned:
                    try:
                        await track_usage("openai", "edit_image", cost_usd=0.0)
                    except Exception:
                        log.warning("Could not record failed GPT attempt for %s", m["id"], exc_info=True)
                if attempts >= 2:
                    raise
                await asyncio.sleep(0.5)

        duration = finish_stage("gpt_image_polish", started, status="success", engine="gpt_image",
                                attempt_count=attempts, request_id=request_id)
        gpt_name = f"{m['id']}_gpt_{new_id()[:6]}.jpg"
        gpt_path = st.work_path(gpt_name)
        ie.save_jpeg(edited, gpt_path, metadata=source_metadata)
        gpt_url = await st.put_file(gpt_name, gpt_path, "image/jpeg")
        files["gpt"] = gpt_name
        urls["gpt"] = gpt_url
        files["enhanced"] = gpt_name
        urls["enhanced"] = gpt_url
        wm = (s.get("watermark_text") or s.get("brand_name")) if s.get("watermark_enabled") else ""
        for name, size in ie.VARIANTS.items():
            variant = ie.make_variant(edited, size, wm)
            variant_name = f"{m['id']}_{name}_gpt_{new_id()[:6]}.jpg"
            variant_path = st.work_path(variant_name)
            ie.save_jpeg(variant, variant_path, metadata=source_metadata)
            files[name] = variant_name
            urls[name] = await st.put_file(variant_name, variant_path, "image/jpeg")
        quality_after = quality_analyzer.analyze(
            cv2.cvtColor(np.asarray(edited.convert("RGB")), cv2.COLOR_RGB2BGR)
        ).as_dict()
        before_quality = (m.get("quality") or {}).get("before") or {}
        quality_record = {**(m.get("quality") or {}), "before": before_quality,
                          "after_opencv": (m.get("quality") or {}).get("after"),
                          "after_gpt": quality_after, "after": quality_after,
                          "quality_gain": quality_after.get("quality_score", 0) - before_quality.get("quality_score", 0)}
        cost = s.get("gpt_image_cost_per_request_usd")
        processing_report = dict(m.get("processing_report") or {})
        timings = list(processing_report.get("stage_timings") or [])
        timings.append(duration)
        processing_report.update({
            "stage_timings": timings, "gpt_image_status": "completed",
            "gpt_image_request_id": request_id, "gpt_image_attempt_count": attempts,
            "gpt_image_billable_attempt_count": billable,
            "gpt_image_processing_time_ms": duration["duration_ms"],
            "actual_gpt_cost_usd": None, "enhancement_prompt": prompt,
            "gpt_image_error": None,
        })
        processing_report["stage_images"] = [
            stage for stage in processing_report.get("stage_images", [])
            if stage.get("stage") != "gpt_image_polish"
        ] + [{"stage": "gpt_image_polish", "label": "GPT Image Polish", "file": gpt_name,
              "url": gpt_url, "status": "success", "timing": duration}]
        gpt_diagnostic = {
            "stage": "gpt_image_polish", "label": "GPT Image Polish",
            "enabled": True, "executed": True, "status": "success",
            "execution_time_ms": duration["duration_ms"], "duration_ms": duration["duration_ms"],
            "timing": duration, "input_source": "saved_opencv_image",
            "strength_applied": {"request_policy": "user_requested"},
        }
        profile["stages"] = [stage for stage in profile.get("stages", []) if stage.get("stage") != "gpt_image_polish"]
        profile["stages"].append(gpt_diagnostic)
        profile.update({"gpt_image_status": "completed", "gpt_image_request_id": request_id,
                        "gpt_image_processing_time_ms": duration["duration_ms"],
                        "gpt_image_attempt_count": attempts, "gpt_prompt": prompt,
                        "gpt_prompt_used": True,
                        "gpt_image_decision": {"decision": "run_gpt", "run_gpt": True,
                                               "reason": "User explicitly requested GPT Image enhancement.",
                                               "rule": "user_initiated_only", "confidence": 1.0}})
        processing_report["execution_report"] = [
            stage for stage in processing_report.get("execution_report", [])
            if stage.get("stage") != "gpt_image_polish"
        ] + [{"stage": "gpt_image_polish", "stage_name": "GPT Image Polish", "executed": True,
              "status": "success", "duration_ms": duration["duration_ms"]}]
        return {
            "files": files, "urls": urls, "local_urls": dict(urls), "quality": quality_record,
            "quality_after": quality_after, "quality_gain": quality_record["quality_gain"],
            "enhanced_quality": ie.quality_metrics(edited), "enhanced_by": "openai",
            "gpt_request_id": request_id, "gpt_image_status": "completed",
            "gpt_image_processing_time_ms": duration["duration_ms"],
            "processing_time_seconds": float(m.get("processing_time_seconds") or 0) + duration["duration_ms"] / 1000,
            "actual_gpt_cost_usd": None, "api_cost_usd": float(cost or 0) * billable,
            "enhancement_prompt": prompt, "gpt_prompt": prompt,
            "enhancement_profile": profile, "processing_report": processing_report,
            "gpt_image_error": None, "gpt_completed_at": now_iso(),
        }
    except Exception as exc:
        duration = finish_stage("gpt_image_polish", started, status="failed", engine="gpt_image",
                                attempt_count=attempts, request_id=request_id, fallback_used=True)
        processing_report = dict(m.get("processing_report") or {})
        timings = list(processing_report.get("stage_timings") or [])
        timings.append(duration)
        processing_report.update({"stage_timings": timings, "gpt_image_status": "failed_fallback",
                                  "gpt_image_request_id": request_id, "gpt_image_attempt_count": attempts,
                                  "gpt_image_processing_time_ms": duration["duration_ms"],
                                  "gpt_image_error": str(exc)[:500]})
        log.exception("GPT enhancement failed; preserving the OpenCV image", extra={"media_id": m["id"]})
        return {"gpt_image_status": "failed_fallback", "gpt_image_error": str(exc)[:500],
                "gpt_request_id": request_id, "gpt_image_processing_time_ms": duration["duration_ms"],
                "processing_report": processing_report, "enhancement_prompt": prompt,
                "actual_gpt_cost_usd": None, "api_cost_usd": float(s.get("gpt_image_cost_per_request_usd") or 0) * billable}
    finally:
        source_path.unlink(missing_ok=True)
        output_path.unlink(missing_ok=True)


async def _process_image(m: dict, s: dict):
    processing_started = time.perf_counter()
    img = ie.load(await st.fetch_local(m["files"]["original"]))
    h = ie.ahash(img)
    dup = await _find_duplicate(m["id"], h)
    context = {
        "filename": m["filename"],
        "folder": m.get("folder"),
        "project": m["project_name"],
        "kind": "image",
        "quality_metrics": ie.quality_metrics(img),
        "possible_duplicate_of_existing": bool(dup),
    }
    analysis = await ai_analyzer.analyze_image(s, ie.thumb_b64(img), context)
    scene_analysis = await asyncio.to_thread(
        scene_analyzer.analyze,
        img,
        analysis,
    )
    await db.media.update_one(
        {"id": m["id"]},
        {"$set": {"scene_analysis": scene_analysis}},
    )
    if dup:
        analysis["content_type"] = "skip"
        analysis["reason"] = "Visually near-identical to an existing upload. " + analysis.get("reason", "")
    updates = await render_image_outputs(
        m,
        s,
        classification=analysis,
        scene_analysis=scene_analysis,
    )
    template_metadata = {
        "filename": m["filename"],
        "folder": m.get("folder"),
        "project": m["project_name"],
        "kind": "image",
        "quality_metrics": updates["quality"],
    }
    template_metadata["analysis"] = analysis
    template_service = TemplateService()
    recommendation = await template_service.recommend_template(template_metadata)
    template_metadata["recommendation"] = recommendation
    if recommendation["enabled"]:
        analysis["template_content"] = {
            key: recommendation[key]
            for key in (
                "type",
                "headline",
                "subtitle",
                "cta",
                "badge",
                "story_sticker",
                "location_label",
                "progress_percentage",
                "progress_is_estimate",
                "completion_stage",
            )
        }
        analysis["story_text"] = recommendation["story_sticker"]
        enhanced_path = st.work_path(updates["files"]["enhanced"])
        generated_path = template_service.generate_template(str(enhanced_path), template_metadata)
        if generated_path == str(enhanced_path):
            log.warning("Template rendering failed or was skipped for %s; keeping the enhanced image", m["id"])
        else:
            template_path = Path(generated_path)
            if not template_path.is_file():
                raise FileNotFoundError(f"Generated template image not found: {template_path}")
            template_name = f"{m['id']}_template_{new_id()[:6]}.jpg"
            template_url = await st.put_file(template_name, template_path, "image/jpeg")
            updates["files"]["template"] = template_name
            updates["urls"]["template"] = template_url
            updates["local_urls"]["template"] = template_url
            updates["files"]["enhanced"] = template_name
            updates["urls"]["enhanced"] = template_url
            updates["local_urls"]["enhanced"] = template_url
            log.info("Applied template to enhanced image for %s", m["id"])
    status = "skipped" if analysis["content_type"] == "skip" else "ready"
    processing_time_seconds = time.perf_counter() - processing_started
    updates["processing_time_seconds"] = round(processing_time_seconds, 4)
    await db.media.update_one({"id": m["id"]}, {"$set": {**updates, "ahash": h, "is_duplicate": bool(dup), "duplicate_of": dup,
                                                          "analysis": analysis, "scene_analysis": scene_analysis,
                                                          "status": status, "processed_at": now_iso()}})
    await learning_engine.record_processed_image(
        media_id=m["id"],
        scene_analysis=scene_analysis,
        quality_report=updates["quality"],
        quality_after=updates["quality_after"],
        quality_gain=updates["quality_gain"],
        adaptive_profile=updates["enhancement_profile"],
        gpt_prompt=updates.get("gpt_prompt"),
        processing_time_seconds=processing_time_seconds,
        stage_timings=updates["processing_report"]["stage_timings"],
        stage_images=updates["processing_report"].get("stage_images", []),
        execution_report=updates["processing_report"].get("execution_report", []),
        opencv_image={
            "file": updates["files"].get("opencv"),
            "url": updates["urls"].get("opencv"),
        },
        gpt_request_id=updates.get("gpt_request_id"),
        enhancement_prompt=updates.get("enhancement_prompt"),
        gpt_status=updates["processing_report"].get("gpt_image_status"),
        gpt_error=updates["processing_report"].get("gpt_image_error"),
        gpt_attempt_count=updates["processing_report"].get("gpt_image_attempt_count"),
        opencv_processing_time_ms=updates["processing_report"]["opencv_processing_time_ms"],
        gpt_image_processing_time_ms=updates["processing_report"]["gpt_image_processing_time_ms"],
        api_cost_usd=updates["api_cost_usd"],
        before_image={
            "file": m["files"]["original"],
            "url": (m.get("urls") or {}).get("original"),
        },
        after_image={
            "file": updates["files"]["enhanced"],
            "url": updates["urls"]["enhanced"],
        },
    )


async def _process_video(m: dict, s: dict):
    src = await st.fetch_local(m["files"]["original"])
    reel, thumb = f"{m['id']}_reel.mp4", f"{m['id']}_thumb.jpg"
    await reel_service.video_to_reel(str(src), str(st.work_path(reel)))
    await reel_service.video_thumbnail(str(st.work_path(reel)), str(st.work_path(thumb)))
    files, urls = dict(m["files"]), dict(m["urls"])
    files.update({"video": reel, "thumbnail": thumb})
    urls["video"] = await st.put_file(reel, st.work_path(reel), "video/mp4")
    urls["thumbnail"] = urls["story"] = urls["portrait"] = urls["enhanced"] = await st.put_file(thumb, st.work_path(thumb), "image/jpeg")
    if cloudinary_ready(s):
        try:
            up = await cld.upload(s, st.work_path(reel), m["id"], "video")
            await track_usage("cloudinary", "upload_video")
            urls["video"] = up["url"]
            urls["cloudinary_original"] = up["url"]
        except Exception as e:
            log.warning("Cloudinary video upload failed: %s", e)
    img = ie.load(st.work_path(thumb))
    metrics = ie.quality_metrics(img)
    context = {"filename": m["filename"], "folder": m.get("folder"), "project": m["project_name"], "kind": "video (this is a frame)",
               "quality_metrics": metrics}
    analysis = await ai_analyzer.analyze_image(s, ie.thumb_b64(img), context)
    scene_analysis = await asyncio.to_thread(
        scene_analyzer.analyze,
        img,
        analysis,
    )
    await db.media.update_one(
        {"id": m["id"]},
        {"$set": {"scene_analysis": scene_analysis}},
    )
    if analysis["content_type"] != "skip":
        analysis["content_type"] = "reel"
    status = "skipped" if analysis["content_type"] == "skip" else "ready"
    await db.media.update_one({"id": m["id"]}, {"$set": {"files": files, "urls": urls, "quality": metrics, "analysis": analysis,
                                                          "scene_analysis": scene_analysis,
                                                          "status": status, "enhanced_by": "ffmpeg", "processed_at": now_iso()}})
