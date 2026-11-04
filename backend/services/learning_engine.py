"""Persist processed-image examples and measured Instagram outcomes."""
from __future__ import annotations

import logging
import math
from collections.abc import Mapping
from typing import Any

from core.config import OPENAI_IMAGE_COST_USD
from core.db import db, new_id, now_iso

log = logging.getLogger("learning_engine")
ENGAGEMENT_METRICS = ("likes", "reach", "saves", "shares")
ADAPTIVE_MIN_SAMPLES = 3
ADAPTIVE_WEIGHT_STEP = 0.02
ADAPTIVE_WEIGHT_MAX = 1.25


def _collection(name: str):
    try:
        return getattr(db, name)
    except Exception:
        return None


def _metric_value(metrics: Mapping[str, Any], name: str) -> int | None:
    value = metrics.get(name)
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"Instagram metric {name!r} must be numeric") from exc
    if not math.isfinite(number) or number < 0:
        raise ValueError(f"Instagram metric {name!r} must be finite and non-negative")
    return int(number)


async def record_processed_image(
    *,
    media_id: str,
    scene_analysis: Mapping[str, Any],
    quality_report: Mapping[str, Any],
    adaptive_profile: Mapping[str, Any],
    gpt_prompt: str | None,
    processing_time_seconds: float,
    stage_timings: list[Mapping[str, Any]] | None = None,
    execution_report: list[Mapping[str, Any]] | None = None,
    stage_images: list[Mapping[str, Any]] | None = None,
    opencv_image: Mapping[str, Any] | None = None,
    gpt_request_id: str | None = None,
    enhancement_prompt: str | None = None,
    gpt_status: str | None = None,
    gpt_error: str | None = None,
    gpt_attempt_count: int | None = None,
    opencv_processing_time_ms: float | None = None,
    gpt_image_processing_time_ms: float | None = None,
    before_image: Mapping[str, Any],
    after_image: Mapping[str, Any],
    quality_after: Mapping[str, Any] | None = None,
    quality_gain: float | None = None,
    api_cost_usd: float | None = None,
) -> dict[str, Any]:
    """Upsert the learning snapshot for one successfully processed still image.

    Image payloads remain in the configured media storage. This record stores
    their stable media file and URL references rather than duplicating bytes.
    """
    if not media_id.strip():
        raise ValueError("media_id must not be empty")
    if not math.isfinite(processing_time_seconds) or processing_time_seconds < 0:
        raise ValueError("processing_time_seconds must be finite and non-negative")
    if quality_gain is not None and not math.isfinite(quality_gain):
        raise ValueError("quality_gain must be finite")
    if api_cost_usd is not None and (
        not math.isfinite(api_cost_usd) or api_cost_usd < 0
    ):
        raise ValueError("api_cost_usd must be finite and non-negative")

    timestamp = now_iso()
    record = {
        "id": new_id(),
        "media_id": media_id,
        "scene_analysis": dict(scene_analysis),
        "quality_report": dict(quality_report),
        "quality_after": dict(quality_after or {}),
        "quality_gain": quality_gain,
        "quality": {
            "before": dict(quality_report.get("before", quality_report)),
            "after": dict(quality_after or quality_report.get("after") or {}),
            "quality_gain": quality_gain,
        },
        "adaptive_profile": dict(adaptive_profile),
        "gpt_prompt": gpt_prompt,
        "processing_time_seconds": round(processing_time_seconds, 4),
        "stage_timings": [dict(timing) for timing in (stage_timings or [])],
        "execution_report": [dict(stage) for stage in (execution_report or [])],
        "stage_images": [dict(image) for image in (stage_images or [])],
        "opencv_image": dict(opencv_image or {}),
        "gpt_request_id": gpt_request_id,
        "enhancement_prompt": enhancement_prompt,
        "gpt_status": gpt_status,
        "gpt_error": gpt_error,
        "gpt_attempt_count": gpt_attempt_count,
        "opencv_processing_time_ms": opencv_processing_time_ms,
        "gpt_image_processing_time_ms": gpt_image_processing_time_ms,
        "api_cost_usd": api_cost_usd,
        "user_approval": None,
        "before_image": dict(before_image),
        "after_image": dict(after_image),
        "instagram_engagement": {
            "likes": None,
            "reach": None,
            "saves": None,
            "shares": None,
            "post_id": None,
            "synced_at": None,
        },
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    records_collection = _collection("learning_records")
    if records_collection is not None:
        try:
            await records_collection.update_one(
                {"media_id": media_id},
                {
                    "$set": {
                        key: value
                        for key, value in record.items()
                        if key not in {"id", "created_at", "instagram_engagement"}
                    },
                    "$setOnInsert": {
                        "id": record["id"],
                        "created_at": timestamp,
                        "instagram_engagement": record["instagram_engagement"],
                    },
                },
                upsert=True,
            )
        except Exception:
            log.debug("Skipping learning record persistence; database is unavailable", exc_info=True)
    await record_adaptive_sample(
        media_id=media_id,
        adaptive_profile=adaptive_profile,
        quality_before=record["quality"]["before"],
        quality_after=record["quality"]["after"],
        quality_gain=quality_gain,
    )
    log.info(
        "Saved image learning record",
        extra={"media_id": media_id, "processing_time_seconds": record[
            "processing_time_seconds"
        ]},
    )
    return record


def _label(value: Any) -> str:
    if isinstance(value, Mapping):
        value = value.get("value")
    return str(value or "unknown").strip().lower() or "unknown"


async def record_adaptive_sample(
    *, media_id: str, adaptive_profile: Mapping[str, Any],
    quality_before: Mapping[str, Any], quality_after: Mapping[str, Any],
    quality_gain: float | None,
) -> None:
    """Persist immutable training inputs and refresh the relevant preset version."""
    scene = adaptive_profile.get("scene") or {}
    room = _label(scene.get("room_type"))
    preset = str(adaptive_profile.get("preset") or "AUTO").strip().upper()
    strengths = dict(adaptive_profile.get("strengths") or {})
    if not strengths:
        strengths = {
            key: value for key, value in adaptive_profile.items()
            if isinstance(value, (int, float)) and key not in {"quality_score", "quality_grade"}
        }
    timestamp = now_iso()
    sample = {
        "media_id": media_id, "room_type": room, "preset": preset,
        "parameters": strengths,
        "quality_before": dict(quality_before), "quality_after": dict(quality_after),
        "quality_gain": quality_gain, "approved": None, "engagement": {},
        "created_at": timestamp, "updated_at": timestamp,
    }
    samples_collection = _collection("adaptive_learning_samples")
    if samples_collection is not None:
        try:
            await samples_collection.update_one(
                {"media_id": media_id},
                {"$set": sample},
                upsert=True,
            )
        except Exception:
            log.debug("Skipping adaptive sample persistence; database is unavailable", exc_info=True)
    await refresh_adaptive_preset(room, preset)


async def refresh_adaptive_preset(room_type: str, preset: str) -> dict[str, Any]:
    """Increase bounded weights only after repeated, approved quality gains."""
    key = f"{room_type}::{preset}"
    samples_collection = _collection("adaptive_learning_samples")
    presets_collection = _collection("adaptive_presets")
    if samples_collection is None or presets_collection is None:
        return {
            "key": f"{room_type}::{preset}",
            "room_type": room_type,
            "preset": preset,
            "version": 0,
            "weights": {},
            "versions": [],
            "sample_count": 0,
            "approved_quality_wins": 0,
        }
    try:
        samples = await samples_collection.find(
            {"room_type": room_type, "preset": preset}, {"_id": 0}
        ).to_list(10000)
    except Exception:
        log.debug("Skipping adaptive preset refresh; database is unavailable", exc_info=True)
        return {
            "key": f"{room_type}::{preset}",
            "room_type": room_type,
            "preset": preset,
            "version": 0,
            "weights": {},
            "versions": [],
            "sample_count": 0,
            "approved_quality_wins": 0,
        }
    wins = [s for s in samples if s.get("approved") is True and (s.get("quality_gain") or 0) > 0]
    by_parameter: dict[str, list[float]] = {}
    for sample in wins:
        for name, value in (sample.get("parameters") or {}).items():
            try:
                strength = float(value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(strength) and abs(strength) > 1e-6:
                by_parameter.setdefault(name, []).append(strength)

    try:
        current = await presets_collection.find_one({"key": key}, {"_id": 0}) or {
            "key": key, "room_type": room_type, "preset": preset,
            "version": 0, "weights": {}, "versions": [],
        }
    except Exception:
        log.debug("Skipping adaptive preset load; database is unavailable", exc_info=True)
        return {
            "key": key,
            "room_type": room_type,
            "preset": preset,
            "version": 0,
            "weights": {},
            "versions": [],
            "sample_count": len(samples),
            "approved_quality_wins": len(wins),
        }
    weights = dict(current.get("weights") or {})
    changed = False
    evidence = {}
    if len(wins) >= ADAPTIVE_MIN_SAMPLES:
        for name, strengths in by_parameter.items():
            if len(strengths) < ADAPTIVE_MIN_SAMPLES:
                continue
            old = float(weights.get(name, 1.0))
            earned_steps = len(strengths) // ADAPTIVE_MIN_SAMPLES
            contributing = [sample for sample in wins if name in (sample.get("parameters") or {})]
            engagement_rates = []
            for sample in contributing:
                engagement = sample.get("engagement") or {}
                reach = max(1, int(engagement.get("reach") or 0))
                interactions = sum(int(engagement.get(metric) or 0) for metric in ("likes", "saves", "shares"))
                if engagement.get("reach") is not None:
                    engagement_rates.append(min(1.0, interactions / reach))
            mean_engagement_rate = sum(engagement_rates) / len(engagement_rates) if engagement_rates else 0.0
            # Quality/approval evidence earns a 1% step per three wins; engagement
            # can add up to another 1%, while the final weight remains capped.
            step = min(ADAPTIVE_WEIGHT_STEP, 0.01 + 0.01 * mean_engagement_rate)
            new = min(ADAPTIVE_WEIGHT_MAX, round(1.0 + earned_steps * step, 4))
            evidence[name] = {
                "positive_samples": len(strengths),
                "mean_strength": round(sum(strengths) / len(strengths), 4),
                "mean_engagement_rate": round(mean_engagement_rate, 4) if engagement_rates else None,
            }
            if new > old:
                weights[name] = new
                changed = True
    if changed:
        version = int(current.get("version", 0)) + 1
        versions = list(current.get("versions") or [])
        versions.append({
            "version": version, "weights": weights, "sample_count": len(samples),
            "approved_quality_wins": len(wins), "evidence": evidence, "created_at": now_iso(),
        })
        await presets_collection.update_one(
            {"key": key}, {"$set": {
                "room_type": room_type, "preset": preset, "version": version,
                "weights": weights, "versions": versions, "updated_at": now_iso(),
            }, "$setOnInsert": {"key": key}}, upsert=True,
        )
        current.update({"version": version, "weights": weights, "versions": versions})
    return {**current, "sample_count": len(samples), "approved_quality_wins": len(wins)}


async def adaptive_adjustments(room_type: str, preset: str) -> dict[str, Any]:
    room, selected = _label(room_type), str(preset or "AUTO").strip().upper()
    presets_collection = _collection("adaptive_presets")
    if presets_collection is None:
        return {"room_type": room, "preset": selected, "version": 0, "weights": {}}
    try:
        specific = await presets_collection.find_one({"key": f"{room}::{selected}"}, {"_id": 0})
        general = await presets_collection.find_one({"key": f"unknown::{selected}"}, {"_id": 0})
    except Exception:
        log.debug("Skipping adaptive preset lookup; database is unavailable", exc_info=True)
        return {"room_type": room, "preset": selected, "version": 0, "weights": {}}
    return {
        "room_type": room, "preset": selected,
        "version": (specific or {}).get("version", 0),
        "weights": (specific or general or {}).get("weights", {}),
    }


async def adaptive_dashboard() -> dict[str, Any]:
    presets_collection = _collection("adaptive_presets")
    samples_collection = _collection("adaptive_learning_samples")
    if presets_collection is None or samples_collection is None:
        return {"minimum_samples": ADAPTIVE_MIN_SAMPLES, "weight_step": ADAPTIVE_WEIGHT_STEP,
                "maximum_weight": ADAPTIVE_WEIGHT_MAX, "presets": [],
                "sample_count": 0, "approved_count": 0,
                "pending_feedback_count": 0}
    try:
        presets = await presets_collection.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
        samples = await samples_collection.find({}, {"_id": 0}).to_list(10000)
    except Exception:
        log.debug("Skipping adaptive dashboard query; database is unavailable", exc_info=True)
        return {"minimum_samples": ADAPTIVE_MIN_SAMPLES, "weight_step": ADAPTIVE_WEIGHT_STEP,
                "maximum_weight": ADAPTIVE_WEIGHT_MAX, "presets": [],
                "sample_count": 0, "approved_count": 0, "pending_feedback_count": 0}
    return {"minimum_samples": ADAPTIVE_MIN_SAMPLES, "weight_step": ADAPTIVE_WEIGHT_STEP,
            "maximum_weight": ADAPTIVE_WEIGHT_MAX, "presets": presets,
            "sample_count": len(samples),
            "approved_count": sum(1 for sample in samples if sample.get("approved") is True),
            "pending_feedback_count": sum(1 for sample in samples if sample.get("approved") is None)}


async def update_adaptive_approval(media_ids: list[str], approved: bool) -> None:
    timestamp = now_iso()
    learning_records_collection = _collection("learning_records")
    if learning_records_collection is not None:
        try:
            await learning_records_collection.update_many(
                {"media_id": {"$in": list(dict.fromkeys(media_ids))}},
                {"$set": {"user_approval": {"approved": approved, "updated_at": timestamp}, "updated_at": timestamp}},
            )
        except Exception:
            log.debug("Skipping learning record approval update; database is unavailable", exc_info=True)
    samples_collection = _collection("adaptive_learning_samples")
    if samples_collection is not None:
        for media_id in dict.fromkeys(media_ids):
            try:
                sample = await samples_collection.find_one({"media_id": media_id}, {"_id": 0})
            except Exception:
                log.debug("Skipping adaptive approval sample lookup; database is unavailable", exc_info=True)
                continue
            if not sample:
                continue
            try:
                await samples_collection.update_one(
                    {"media_id": media_id}, {"$set": {"approved": approved, "updated_at": timestamp}}
                )
            except Exception:
                log.debug("Skipping adaptive approval update; database is unavailable", exc_info=True)
                continue
            await refresh_adaptive_preset(sample["room_type"], sample["preset"])


def summarize_records(
    records: list[Mapping[str, Any]],
    total_count: int,
) -> dict[str, Any]:
    """Summarize learning snapshots for the AI dashboard."""
    room_types: dict[str, int] = {}
    project_stages: dict[str, int] = {}
    quality_gains: list[float] = []
    processing_times: list[float] = []
    opencv_times: list[float] = []
    gpt_times: list[float] = []
    known_costs: list[float] = []
    gpt_count = 0

    def add_label(counts: dict[str, int], value: Any) -> None:
        label = str(value or "").strip()
        if label and label.lower() not in {"unknown", "none"}:
            counts[label] = counts.get(label, 0) + 1

    def finite_number(value: Any) -> float | None:
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return number if math.isfinite(number) else None

    for record in records:
        analysis = record.get("scene_analysis") or {}
        predictions = analysis.get("predictions") or {}
        room = predictions.get("room_type", {})
        stage = predictions.get("project_stage", {})
        add_label(
            room_types,
            room.get("value") if isinstance(room, Mapping) else room,
        )
        add_label(
            project_stages,
            stage.get("value") if isinstance(stage, Mapping) else stage,
        )

        gain = finite_number(record.get("quality_gain"))
        if gain is not None:
            quality_gains.append(gain)
        elapsed = finite_number(record.get("processing_time_seconds"))
        if elapsed is not None and elapsed >= 0:
            processing_times.append(elapsed)
        opencv_elapsed = finite_number(record.get("opencv_processing_time_ms"))
        if opencv_elapsed is not None and opencv_elapsed >= 0:
            opencv_times.append(opencv_elapsed)
        gpt_elapsed = finite_number(record.get("gpt_image_processing_time_ms"))
        if gpt_elapsed is not None and gpt_elapsed >= 0:
            gpt_times.append(gpt_elapsed)
        cost = finite_number(record.get("api_cost_usd"))
        if cost is not None and cost >= 0:
            known_costs.append(cost)
        profile = record.get("adaptive_profile") or {}
        decision = profile.get("gpt_image_decision") or {}
        if decision.get("run_gpt") is True:
            gpt_count += 1

    def common(counts: dict[str, int]) -> list[dict[str, Any]]:
        return [
            {"name": name, "count": count}
            for name, count in sorted(
                counts.items(),
                key=lambda item: (-item[1], item[0].lower()),
            )[:8]
        ]

    return {
        "images_processed": total_count,
        "records_in_summary": len(records),
        "average_quality_gain": (
            sum(quality_gains) / len(quality_gains)
            if quality_gains
            else None
        ),
        "quality_gain_samples": len(quality_gains),
        "average_processing_time_seconds": (
            sum(processing_times) / len(processing_times)
            if processing_times
            else None
        ),
        "average_opencv_processing_time_ms": (
            sum(opencv_times) / len(opencv_times) if opencv_times else None
        ),
        "opencv_runtime_samples": len(opencv_times),
        "average_gpt_image_processing_time_ms": (
            sum(gpt_times) / len(gpt_times) if gpt_times else None
        ),
        "gpt_runtime_samples": len(gpt_times),
        "gpt_usage_rate": (
            gpt_count / len(records) * 100
            if records
            else None
        ),
        "gpt_images_processed": gpt_count,
        "api_cost_usd": (
            sum(known_costs)
            if known_costs
            else None
        ),
        "cost_per_image_usd": (
            sum(known_costs) / len(records)
            if records and len(known_costs) == len(records)
            else None
        ),
        "costed_image_count": len(known_costs),
        "cost_tracking_configured": OPENAI_IMAGE_COST_USD is not None,
        "most_common_room_types": common(room_types),
        "most_common_project_stages": common(project_stages),
    }


async def dashboard_summary() -> dict[str, Any]:
    total = await db.learning_records.count_documents({})
    records = await db.learning_records.find(
        {},
        {
            "_id": 0,
            "scene_analysis": 1,
            "quality_gain": 1,
            "processing_time_seconds": 1,
            "opencv_processing_time_ms": 1,
            "gpt_image_processing_time_ms": 1,
            "api_cost_usd": 1,
            "adaptive_profile.gpt_image_decision": 1,
        },
    ).sort("updated_at", -1).to_list(10000)
    summary = summarize_records(records, total)
    runtime_cursor = await db.learning_records.aggregate([
        {"$group": {
            "_id": None,
            "average_processing_time_seconds": {"$avg": "$processing_time_seconds"},
            "processing_runtime_samples": {"$sum": {"$cond": [{"$isNumber": "$processing_time_seconds"}, 1, 0]}},
            "average_opencv_processing_time_ms": {"$avg": "$opencv_processing_time_ms"},
            "opencv_runtime_samples": {"$sum": {"$cond": [{"$isNumber": "$opencv_processing_time_ms"}, 1, 0]}},
            "average_gpt_image_processing_time_ms": {"$avg": "$gpt_image_processing_time_ms"},
            "gpt_runtime_samples": {"$sum": {"$cond": [{"$isNumber": "$gpt_image_processing_time_ms"}, 1, 0]}},
        }}
    ])
    runtime_rows = await runtime_cursor.to_list(1)
    if runtime_rows:
        summary.update({key: value for key, value in runtime_rows[0].items() if key != "_id"})
    return summary


async def dashboard_records(limit: int = 30, skip: int = 0) -> dict[str, Any]:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    if skip < 0:
        raise ValueError("skip must not be negative")
    records_collection = _collection("learning_records")
    if records_collection is None:
        return {"items": [], "total": 0, "limit": limit, "skip": skip}
    records = await records_collection.find(
        {},
        {"_id": 0},
    ).sort("updated_at", -1).skip(skip).to_list(limit)
    total = await records_collection.count_documents({})
    return {"items": records, "total": total, "limit": limit, "skip": skip}


async def update_instagram_engagement(
    media_ids: list[str],
    post_id: str,
    metrics: Mapping[str, Any],
    synced_at: str | None = None,
) -> int:
    """Attach the latest post-level Instagram metrics to its media records."""
    normalized = {
        name: _metric_value(metrics, name)
        for name in ENGAGEMENT_METRICS
    }
    timestamp = synced_at or now_iso()
    records_collection = _collection("learning_records")
    samples_collection = _collection("adaptive_learning_samples")
    if records_collection is None:
        return 0
    try:
        result = await records_collection.update_many(
            {"media_id": {"$in": list(dict.fromkeys(media_ids))}},
            {
                "$set": {
                    "instagram_engagement": {
                        **normalized,
                        "post_id": post_id,
                        "synced_at": timestamp,
                    },
                    "updated_at": timestamp,
                }
            },
        )
    except Exception:
        log.debug("Skipping Instagram engagement update; database is unavailable", exc_info=True)
        return 0
    if samples_collection is not None:
        for media_id in dict.fromkeys(media_ids):
            try:
                sample = await samples_collection.find_one({"media_id": media_id}, {"_id": 0})
            except Exception:
                log.debug("Skipping adaptive engagement update; database is unavailable", exc_info=True)
                continue
            if not sample:
                continue
            try:
                await samples_collection.update_one(
                    {"media_id": media_id}, {"$set": {"engagement": normalized, "updated_at": timestamp}}
                )
            except Exception:
                log.debug("Skipping adaptive engagement sample update; database is unavailable", exc_info=True)
                continue
            await refresh_adaptive_preset(sample["room_type"], sample["preset"])
    updated = int(result.modified_count)
    log.info(
        "Updated learning records with Instagram engagement",
        extra={"post_id": post_id, "media_count": updated},
    )
    return updated
