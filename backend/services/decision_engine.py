"""Deterministic rules for deciding whether GPT Image polishing should run."""
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

QUALITY_SKIP_THRESHOLD = 95.0
QUALITY_GPT_THRESHOLD = 85.0
SEVERE_QUALITY_THRESHOLD = 65.0
CONSTRUCTION_SCORE_THRESHOLD = 60.0
LUXURY_SCORE_THRESHOLD = 60.0


def _value(source: Mapping[str, Any], name: str) -> Any:
    predictions = source.get("predictions")
    if isinstance(predictions, Mapping) and name in predictions:
        prediction = predictions[name]
        return prediction.get("value") if isinstance(prediction, Mapping) else prediction
    value = source.get(name)
    return value.get("value") if isinstance(value, Mapping) else value


def _number(sources: tuple[Mapping[str, Any], ...], *names: str) -> float | None:
    for source in sources:
        for name in names:
            value = _value(source, name)
            if value is None or isinstance(value, bool):
                continue
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(number):
                return number
    return None


def _text(sources: tuple[Mapping[str, Any], ...], *names: str) -> str:
    for source in sources:
        for name in names:
            value = _value(source, name)
            if value is not None and str(value).strip():
                return str(value).strip().lower().replace("_", " ").replace("-", " ")
    return ""


def _confidence(quality: float | None, signal_count: int, band: str) -> float:
    """Heuristic confidence: boundary distance plus available input coverage."""
    if quality is None:
        return round(0.25 + 0.05 * signal_count / 9, 2)
    if band == "high":
        margin = min(1.0, max(0.0, (quality - QUALITY_SKIP_THRESHOLD) / 10))
    elif band == "mid":
        margin = min(1.0, max(0.0, min(quality - QUALITY_GPT_THRESHOLD, QUALITY_SKIP_THRESHOLD - quality) / 5))
    else:
        margin = min(1.0, max(0.0, (QUALITY_GPT_THRESHOLD - quality) / 20))
    coverage = signal_count / 9
    return round(min(0.99, 0.55 + 0.35 * margin + 0.09 * coverage), 2)


def decide(
    quality_report: Mapping[str, Any],
    *,
    classification: Mapping[str, Any] | None = None,
    scene_analysis: Mapping[str, Any] | None = None,
    enabled: bool = True,
    segmentation_enabled: bool = False,
    selected_preset: str | None = None,
) -> dict[str, Any]:
    """Choose GPT Image or OpenCV and return the decision, reason, confidence.

    Quality bands are strict: >95 skips GPT; 85–95 inclusive uses OpenCV;
    <85 may use GPT. Construction stage prefers OpenCV until severe defects.
    """
    sources = (quality_report, scene_analysis or {}, classification or {})
    quality = _number(sources, "quality_score")
    room_type = _text(sources, "room_type") or None
    project_stage = _text(sources, "project_stage", "stage") or None
    lighting = _text(sources, "lighting_type", "lighting") or None
    luxury_score = _number(sources, "luxury_score")
    construction_score = _number(sources, "construction_score")
    noise = _number(sources, "noise")
    sharpness = _number(sources, "sharpness")
    perspective = _number(sources, "perspective_distortion", "perspective", "distortion")
    window_coverage = _number(sources, "window_highlights", "window_area", "window_coverage")
    highlight_clipping = _number(sources, "highlight_clipping", "highlight_clipping_pct")
    brightness = _number(sources, "brightness")
    exposure = _text(sources, "exposure") or None
    style = _text(sources, "design_style", "interior_style", "style")
    normalized_preset = str(selected_preset or "AUTO").strip().upper()

    project_stage_norm = (project_stage or "").strip().lower().replace("_", " ").replace("-", " ")
    construction_progress_detected = bool(
        project_stage_norm and any(
            token in project_stage_norm
            for token in (
                "construction",
                "progress",
                "unfinished",
                "renovat",
                "brick work",
                "electrical",
                "painting",
                "wood work",
            )
        )
    )
    completed_interior_detected = bool(
        project_stage_norm and (
            "completed interior" in project_stage_norm
            or "complete interior" in project_stage_norm
            or "complete" in project_stage_norm
            or "finished" in project_stage_norm
        )
    )

    construction = construction_progress_detected or (
        project_stage in {None, "unknown", "not available"} and construction_score is not None and construction_score >= CONSTRUCTION_SCORE_THRESHOLD
    )
    luxury_preset = normalized_preset == "LUXURY"
    luxury = luxury_preset or (luxury_score is not None and luxury_score >= LUXURY_SCORE_THRESHOLD) or "luxury" in style
    luxury_detected = luxury

    severe_reasons = []
    if quality is not None and quality < SEVERE_QUALITY_THRESHOLD:
        severe_reasons.append(f"overall quality {quality:.1f} is below {SEVERE_QUALITY_THRESHOLD:.0f}")
    if sharpness is not None and sharpness < 25:
        severe_reasons.append(f"sharpness {sharpness:.1f} is critically low")
    if highlight_clipping is not None and highlight_clipping >= 15:
        severe_reasons.append(f"highlight clipping is {highlight_clipping:.1f}%")
    if exposure in {"underexposed", "under exposed"} and brightness is not None and brightness < 18:
        severe_reasons.append("the image is severely underexposed")
    if exposure in {"overexposed", "over exposed"} and brightness is not None and brightness > 92:
        severe_reasons.append("the image is severely overexposed")
    if window_coverage is not None and window_coverage >= 20 and highlight_clipping is not None and highlight_clipping >= 8:
        severe_reasons.append("bright window regions have substantial highlight clipping")
    severe_quality = bool(severe_reasons)

    inputs = {
        "quality_score": quality,
        "construction_score": construction_score,
        "luxury_score": luxury_score,
        "brightness": brightness,
        "noise": noise,
        "sharpness": sharpness,
        "perspective": perspective,
        "project_stage": project_stage_norm or None,
        "construction_progress_detected": construction_progress_detected,
        "completed_interior_detected": completed_interior_detected,
        "luxury_detected": luxury_detected,
    }
    signal_count = sum(value is not None for value in (
        quality, room_type, project_stage, lighting, luxury_score,
        construction_score, sharpness, window_coverage, exposure,
    ))

    if not enabled:
        decision, rule, reason, band = "skip_gpt", "gpt_image_disabled", "GPT Image is disabled by USE_AI_EDITOR; retain OpenCV processing.", "low"
    elif segmentation_enabled:
        decision, rule, reason, band = "skip_gpt", "segmentation_mask_safety", "GPT Image cannot be constrained to the active segmentation masks; retain the OpenCV result.", "low"
    elif quality is None:
        decision, rule, reason, band = "opencv_only", "quality_score_unavailable", "Quality score is unavailable, so the safe deterministic OpenCV pipeline is used.", "low"
    elif quality >= 95.0:
        decision, rule, reason, band = "skip_gpt", "quality_at_least_95", "Quality is at or above 95; GPT Image is skipped.", "high"
    elif construction_progress_detected and quality > 90.0:
        decision, rule, reason, band = "skip_gpt", "construction_progress_quality_over_90", "Construction-progress media is above 90 quality, so the faithful OpenCV result is preferred.", "mid"
    elif construction_progress_detected:
        decision, rule, reason, band = "skip_gpt", "no_matching_polish_rule", "Construction-progress media does not match an active polish rule.", "low"
    elif completed_interior_detected and quality < 90.0:
        decision, rule, reason, band = "run_gpt", "completed_interior_quality_under_90", "Completed-interior media below 90 quality can benefit from GPT Image polishing.", "low"
    elif completed_interior_detected:
        decision, rule, reason, band = "skip_gpt", "no_matching_polish_rule", "Completed-interior media does not match an active polish rule.", "low"
    elif construction_score is not None and construction_score >= CONSTRUCTION_SCORE_THRESHOLD and quality < 95.0:
        decision, rule, reason, band = "skip_gpt", "no_matching_polish_rule", "Construction signal is present but does not meet an active GPT polish rule.", "low"
    elif luxury_detected and quality < 85.0:
        decision, rule, reason, band = "run_gpt", "luxury_image", "Low-quality luxury interior media qualifies for subtle GPT Image polishing.", "low"
    elif brightness is not None and brightness < 40.0 and quality < 85.0:
        decision, rule, reason, band = "run_gpt", "dark_image", "Low-light media qualifies for gentle GPT Image polishing.", "low"
    elif quality >= 85.0 and quality < 95.0:
        decision, rule, reason, band = "skip_gpt", "quality_85_to_95", "Quality remains in the safe OpenCV band and does not trigger a GPT polish rule.", "mid"
    elif quality < 85.0:
        decision, rule, reason, band = "run_gpt", "quality_under_85", "Quality is below 85; GPT Image polishing is allowed after OpenCV processing.", "low"
    else:
        decision, rule, reason, band = "skip_gpt", "no_matching_polish_rule", "No active GPT polish rule matched the available image signals.", "low"

    reasons = [reason]
    if window_coverage is not None and window_coverage >= 20 and highlight_clipping is not None and highlight_clipping >= 8:
        reasons.append(
            f"Large clipped window highlights detected: estimated window coverage is {window_coverage:.1f}% and overall highlight clipping is {highlight_clipping:.1f}%."
        )
    if luxury_preset:
        reasons.append("Luxury interior preset selected.")
    elif luxury_detected:
        reasons.append("Luxury interior characteristics were detected from the style or luxury score.")
    if lighting and any(term in lighting for term in ("natural", "daylight")):
        reasons.append("Natural lighting detected; preserve the existing light direction and avoid adding synthetic light sources.")
    elif lighting and "mixed" in lighting:
        reasons.append("Mixed lighting detected; retain the existing light sources and balance their color carefully.")
    if exposure in {"underexposed", "under exposed", "overexposed", "over exposed"}:
        reasons.append(f"The measured exposure is {exposure}.")
    if construction:
        reasons.append(
            "Construction-progress details are treated as documentary content and must remain unchanged."
            if decision != "run_gpt" else
            "GPT Image is allowed only to address the listed severe photographic quality issues; construction details remain protected."
        )
    reason_text = " ".join(reasons)

    return {
        "decision": decision,
        "run_gpt": decision == "run_gpt",
        "reason": reason_text,
        "reasons": reasons,
        "confidence": 1.0 if not enabled or segmentation_enabled else _confidence(quality, signal_count, band),
        "rule": rule,
        "inputs": inputs,
    }
