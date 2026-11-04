"""Derive image-specific enhancement strengths and scene labels."""
from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any

PRESETS = (
    "AUTO",
    "ARCHITECTURAL",
    "LUXURY",
    "CONSTRUCTION PROGRESS",
    "COMPLETED INTERIOR",
    "MINIMAL",
    "SCANDINAVIAN",
    "MODERN",
)

_PRESET_FACTORS = {
    "AUTO": {},
    "ARCHITECTURAL": {"clarity": 0.92, "warmth": 0.85},
    "LUXURY": {"clarity": 1.08, "wood_enhancement": 1.08, "warmth": 1.12},
    "CONSTRUCTION PROGRESS": {
        "clarity": 1.12,
        "texture": 1.14,
        "sharpening": 1.08,
        "warmth": 0.78,
    },
    "COMPLETED INTERIOR": {
        "local_contrast": 0.94,
        "warmth": 1.08,
        "wood_enhancement": 1.05,
    },
    "MINIMAL": {
        "local_contrast": 0.88,
        "clarity": 0.84,
        "wood_enhancement": 0.88,
        "warmth": 0.72,
    },
    "SCANDINAVIAN": {
        "warmth": 1.08,
        "shadow_lift": 1.04,
        "wood_enhancement": 0.96,
    },
    "MODERN": {"local_contrast": 1.06, "clarity": 1.04, "warmth": 0.82},
}

_ROOMS = {
    "living room",
    "bedroom",
    "kitchen",
    "dining",
    "bathroom",
    "wardrobe",
    "office",
    "exterior",
    "landscape",
    "commercial",
    "staircase",
}
_CONSTRUCTION_TERMS = (
    "construction",
    "brick",
    "electrical",
    "painting",
    "wood work",
    "site visit",
    "work in progress",
    "unfinished",
)


def _text(value: Any) -> str:
    return str(value or "").strip().lower()


def _finite(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return round(max(lower, min(upper, value)), 4)


def _scene_value(
    scene_analysis: Mapping[str, Any],
    name: str,
    default: Any = None,
) -> Any:
    predictions = scene_analysis.get("predictions")
    if isinstance(predictions, Mapping):
        prediction = predictions.get(name)
        if isinstance(prediction, Mapping):
            return prediction.get("value", default)
    return scene_analysis.get(name, default)


def _scene_confidence(
    scene_analysis: Mapping[str, Any],
    name: str,
    default: float = 0.0,
) -> float:
    predictions = scene_analysis.get("predictions")
    prediction = (
        predictions.get(name)
        if isinstance(predictions, Mapping)
        else None
    )
    if not isinstance(prediction, Mapping):
        return default
    return _clamp(_finite(prediction.get("confidence"), default))


def _score_deficit(
    report: Mapping[str, Any],
    category: str,
    fallback: float,
) -> float:
    breakdown = report.get("score_breakdown")
    detail = (
        breakdown.get(category)
        if isinstance(breakdown, Mapping)
        else None
    )
    if isinstance(detail, Mapping) and "score" in detail:
        return _clamp(1 - _finite(detail.get("score"), 100) / 100)
    return _clamp(fallback)


def _quality_measure(
    quality: Mapping[str, Any],
    report: Mapping[str, Any],
    scene_analysis: Mapping[str, Any],
    metric_name: str,
    scene_name: str,
    default: float = 0.0,
) -> float:
    value = quality.get(metric_name)
    if value is None:
        value = report.get(metric_name)
    if value is None:
        value = _scene_value(scene_analysis, scene_name, default)
    return _finite(value, default)


def classify_scene(
    quality: dict[str, Any],
    vision: dict[str, Any] | None = None,
) -> dict[str, str | float]:
    """Combine existing vision labels with measurable visual cues."""
    vision = vision or {}
    if isinstance(vision.get("predictions"), Mapping):
        vision = {
            key: _scene_value(vision, key)
            for key in (
                "room_type",
                "project_stage",
                "interior_style",
                "environment",
            )
        }
    room = str(
        vision.get("room_type")
        or quality.get("room_type")
        or "Unknown"
    )
    stage = str(vision.get("project_stage") or "Unknown")
    room_key, stage_key = _text(room), _text(stage)
    construction = any(term in stage_key for term in _CONSTRUCTION_TERMS)
    if not construction and stage_key not in {"", "unknown"}:
        construction = stage_key not in {"completed", "styling", "furniture"}

    outdoor_cues = float(quality.get("outdoor_cues", 0))
    known_environment = _text(vision.get("environment"))
    if known_environment in {"indoor", "outdoor"}:
        environment = known_environment
        environment_confidence = _finite(
            vision.get("environment_confidence"),
            0.9,
        )
    elif room_key in {"exterior", "landscape"}:
        environment, environment_confidence = "outdoor", 0.95
    elif room_key in _ROOMS and room_key not in {
        "exterior",
        "landscape",
    }:
        environment, environment_confidence = "indoor", 0.95
    elif outdoor_cues >= 12:
        environment, environment_confidence = (
            "outdoor",
            min(0.8, outdoor_cues / 30),
        )
    else:
        environment, environment_confidence = "indoor", 0.55

    brightness = float(quality.get("brightness", 50))
    time_of_day = "daytime" if brightness >= 35 else "evening"
    temperature = float(quality.get("color_temperature", 5500))
    lighting = (
        "warm"
        if temperature < 4500
        else "cool" if temperature > 6500 else "neutral"
    )
    completed = stage_key in {"completed", "styling", "furniture"}
    return {
        "environment": environment,
        "environment_confidence": round(
            environment_confidence,
            3,
        ),
        "room_type": room,
        "construction": (
            "construction" if construction else "completed_or_unknown"
        ),
        "interior_status": (
            "completed" if completed else "progress_or_unknown"
        ),
        "time_of_day": time_of_day,
        "lighting": lighting,
        "lighting_type": str(
            vision.get("lighting_type") or "estimated_from_color_temperature"
        ),
        "project_stage": stage,
    }


def build_profile(
    quality: dict[str, Any] | None = None,
    preset: str | Mapping[str, Any] = "AUTO",
    vision: dict[str, Any] | None = None,
    *,
    scene_analysis: Mapping[str, Any] | None = None,
    quality_report: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Build a safe, image-adaptive profile from analysis and quality evidence.

    Strength controls are normalized to [0, 1], except signed exposure and
    warmth. Perspective correction, contrast gain, and exposure have tighter
    bounds to avoid geometry and tonal artifacts. Instagram output always fits
    the full source frame instead of cropping it.
    """
    if isinstance(preset, Mapping):
        scene_analysis = scene_analysis or quality or {}
        quality_report = quality_report or preset
        quality = {}
        preset = "AUTO"
    normalized_preset = preset.strip().upper()
    if normalized_preset not in _PRESET_FACTORS:
        raise ValueError(f"Unsupported enhancement preset: {preset}")

    quality = quality or {}
    quality_report = quality_report or quality
    scene_analysis = scene_analysis or {}
    semantic = vision or {}
    if not semantic and isinstance(scene_analysis.get("predictions"), Mapping):
        semantic = {
            "room_type": _scene_value(scene_analysis, "room_type"),
            "project_stage": _scene_value(scene_analysis, "project_stage"),
            "design_style": _scene_value(scene_analysis, "interior_style"),
            "environment": _scene_value(scene_analysis, "environment"),
            "lighting_type": _scene_value(scene_analysis, "lighting_type"),
        }

    brightness = _quality_measure(
        quality, quality_report, scene_analysis, "brightness", "brightness", 50
    )
    contrast = _quality_measure(
        quality, quality_report, scene_analysis, "contrast", "contrast", 50
    )
    noise = _quality_measure(
        quality, quality_report, scene_analysis, "noise", "noise", 0
    )
    blur = _quality_measure(
        quality, quality_report, scene_analysis, "blur_score", "blur", 0
    )
    sharpness = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "sharpness",
        "sharpness",
        100 - blur,
    )
    highlights = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "highlight_clipping",
        "highlight_clipping",
    )
    shadows = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "shadow_clipping",
        "shadow_clipping",
    )
    wood = _quality_measure(
        quality, quality_report, scene_analysis, "wood_coverage", "wood_area"
    )
    walls = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "white_wall_coverage",
        "wall_area",
    )
    windows = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "window_coverage",
        "window_area",
    )
    floor_area = _quality_measure(
        quality, quality_report, scene_analysis, "floor_area", "floor_area"
    )
    dynamic_range = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "dynamic_range",
        "dynamic_range",
    )
    perspective_distortion = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "perspective_distortion",
        "perspective_distortion",
    )
    perspective_tilt = abs(
        _finite(
            _scene_value(
                scene_analysis,
                "perspective_tilt",
                (quality.get("camera_angle") or {}).get("roll_degrees", 0),
            )
        )
    )
    temperature = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "color_temperature",
        "color_temperature",
        5500,
    )
    wb_shift = quality.get("white_balance_shift")
    if not isinstance(wb_shift, Mapping):
        wb_shift = _scene_value(scene_analysis, "white_balance", {})
    if not isinstance(wb_shift, Mapping):
        wb_shift = {}
    wb_shift = {
        channel: round(
            max(0.94, min(1.06, _finite(wb_shift.get(channel), 1.0))),
            4,
        )
        for channel in ("red", "green", "blue")
    }
    wb_delta = max(
        abs(_finite(wb_shift.get(channel), 1.0) - 1)
        for channel in ("red", "green", "blue")
    )

    saturation = _quality_measure(
        quality,
        quality_report,
        scene_analysis,
        "saturation",
        "saturation",
        28,
    )
    deficits = {
        name: _score_deficit(quality_report, name, fallback)
        for name, fallback in {
            "exposure": abs(brightness - 50) / 50,
            "contrast": abs(contrast - 35) / 65,
            "perspective": perspective_distortion / 100,
            "white_balance": wb_delta / 0.06,
            "color_accuracy": abs(saturation - 28) / 72,
            "texture": (100 - sharpness) / 100,
            "sharpness": (100 - sharpness) / 100,
            "noise": noise / 24,
            "lighting": abs(brightness - 50) / 50,
            "composition": perspective_distortion / 100,
            "dynamic_range": (100 - dynamic_range) / 100,
            "subject_visibility": (
                highlights + shadows
            ) / 100,
        }.items()
    }

    def confidence(name: str, default: float = 1.0) -> float:
        return _scene_confidence(scene_analysis, name, default)

    perspective_strength = max(
        deficits["perspective"],
        _clamp(perspective_distortion / 100),
        _clamp(perspective_tilt / 10),
    )
    perspective_strength *= confidence("perspective_tilt", 1.0)
    exposure_strength = max(
        deficits["exposure"],
        deficits["lighting"],
        abs(brightness - 50) / 50,
    ) * confidence("brightness", 1.0)
    exposure_strength = _clamp(exposure_strength)
    # Do not darken a photo just because a bright wall pulls its mean above
    # the scorer's midpoint. Prefer local shadow recovery; only pull global
    # exposure down when the frame is genuinely bright and clipping exists.
    interior_lift = 0.08 if brightness < 58 and highlights < 8 else 0.0
    if brightness < 58:
        exposure_ev = max(exposure_strength * 0.24, interior_lift)
    elif brightness > 72 and highlights >= 2:
        exposure_ev = -min(0.18, exposure_strength * 0.24)
    else:
        exposure_ev = 0.0

    highlight_strength = max(
        _clamp(highlights / 8),
        _clamp(windows / 100) * _clamp(highlights / 8),
    ) * confidence("highlight_clipping", 1.0)
    deep_shadow_pct = _finite(
        quality.get("shadow_percentage", quality_report.get("shadow_percentage", 0))
    )
    shadow_strength = max(
        _clamp(shadows / 8),
        _clamp((50 - brightness) / 50),
        _clamp((deep_shadow_pct - 8) / 32),
    ) * confidence("shadow_clipping", 1.0)
    contrast_strength = deficits["contrast"]
    white_balance_strength = max(
        deficits["white_balance"],
        _clamp(wb_delta / 0.06),
    ) * confidence("white_balance", 1.0)
    color_cast_strength = _clamp(wb_delta / 0.06) * confidence(
        "white_balance",
        1.0,
    )
    warmth = _clamp((5500 - temperature) / 3500, -1.0, 1.0)
    wood_confidence = confidence("wood_area", 0.5)
    wood_strength = (
        _clamp(wood / 100)
        * max(deficits["texture"], deficits["color_accuracy"])
        * wood_confidence
    )
    wall_strength = (
        _clamp(walls / 100)
        * deficits["white_balance"]
        * confidence("wall_area", 0.5)
    )
    window_strength = (
        _clamp(windows / 100)
        * _clamp(highlights / 8)
        * confidence("window_area", 0.5)
    )
    texture_strength = max(
        deficits["texture"],
        deficits["dynamic_range"] * _clamp(floor_area / 100),
    ) * max(0.0, 1 - _clamp(noise / 24))
    clarity_strength = max(
        deficits["contrast"],
        deficits["texture"],
    ) * max(0.0, 1 - _clamp(noise / 24))
    noise_strength = max(
        _clamp(noise / 24),
        deficits["noise"],
    )
    sharpening_strength = deficits["sharpness"] * max(
        0.0,
        1 - noise_strength,
    )
    width = _finite(quality.get("width", quality_report.get("width")), 0)
    height = _finite(quality.get("height", quality_report.get("height")), 0)
    aspect_ratio = width / height if height > 0 else 0.0
    instagram_fit_strength = (
        _clamp(abs(aspect_ratio - 0.8) / max(aspect_ratio, 0.8))
        if aspect_ratio > 0
        else 0.0
    )

    def preset_value(name: str, value: float) -> float:
        preset_key = {
            "shadows": "shadow_lift",
            "contrast": "local_contrast",
        }.get(name, name)
        factor = _PRESET_FACTORS[normalized_preset].get(preset_key, 1.0)
        return (
            _clamp(value * factor, -1.0, 1.0)
            if name == "warmth"
            else _clamp(value * factor)
        )

    profile: dict[str, Any] = {
        "preset": normalized_preset,
        "perspective": preset_value("perspective", perspective_strength),
        "perspective_correction": _clamp(
            preset_value("perspective", perspective_strength), 0.0, 0.18
        ),
        "exposure": _clamp(exposure_strength),
        "exposure_correction_ev": _clamp(exposure_ev, -0.35, 0.35),
        "brightness_correction_ev": _clamp(exposure_ev, -0.35, 0.35),
        "highlights": preset_value("highlights", highlight_strength),
        "highlight_recovery": preset_value(
            "highlights",
            highlight_strength,
        ),
        "shadows": preset_value("shadows", shadow_strength),
        "shadow_lift": preset_value("shadows", shadow_strength),
        "contrast": preset_value("contrast", contrast_strength),
        "contrast_correction": _clamp(
            1
            + (
                contrast_strength
                if contrast < 35
                else -contrast_strength
            )
            * 0.12,
            0.85,
            1.15,
        ),
        "white_balance": preset_value(
            "white_balance",
            white_balance_strength,
        ),
        "white_balance_strength": preset_value(
            "white_balance",
            white_balance_strength,
        ),
        "white_balance_shift": dict(wb_shift),
        "warmth": preset_value("warmth", warmth),
        "wood_enhancement": preset_value(
            "wood_enhancement",
            wood_strength,
        ),
        "texture": preset_value("texture", texture_strength),
        "detail_enhancement": _clamp(
            max(clarity_strength, texture_strength * 0.75)
            * max(0.0, 1 - noise / 30)
        ),
        "clarity": preset_value("clarity", clarity_strength),
        "local_contrast": _clamp(
            preset_value("clarity", clarity_strength)
            * deficits["contrast"]
        ),
        "sharpening": preset_value(
            "sharpening",
            sharpening_strength,
        ),
        "noise_reduction": preset_value(
            "noise_reduction",
            noise_strength,
        ),
        "color_cast_removal": color_cast_strength,
        "dynamic_range_correction": deficits["dynamic_range"],
        "lens_distortion": round(
            max(
                -0.03,
                min(
                    0.03,
                    float(quality.get("lens_distortion_estimate", 0)),
                ),
            ),
            6,
        ),
        "color_temperature_correction": round(
            max(
                -0.08,
                min(
                    0.08,
                    (5500 - temperature) / 25000,
                ),
            ),
            5,
        ),
        "wall_neutralization": preset_value(
            "wall_neutralization",
            wall_strength,
        ),
        "floor_texture": round(
            _clamp(floor_area / 100)
            * deficits["texture"]
            * max(0, 1 - noise_strength),
            4,
        ),
        "micro_contrast": _clamp(clarity_strength * deficits["contrast"]),
        "window_recovery": preset_value(
            "window_recovery",
            window_strength,
        ),
        "window_glow_recovery": preset_value(
            "window_recovery",
            window_strength,
        ),
        "vignette_strength": round(
            _clamp(deficits["composition"] * 0.12, 0.0, 0.12),
            4,
        ),
        "instagram_crop": {
            "strategy": "fit_full_frame",
            "primary_variant": "portrait",
            "source_aspect_ratio": round(aspect_ratio, 5),
            "strength": _clamp(instagram_fit_strength),
            "preserve_all_pixels": True,
        },
        "scene_scores": {
            "luxury": quality.get("luxury_score", 0),
            "construction": quality.get("construction_score", 0),
            "completed_interior": quality.get(
                "completed_interior_score",
                0,
            ),
        },
        "features": {
            "wood_coverage": round(wood, 2),
            "white_wall_coverage": round(walls, 2),
            "window_coverage": round(windows, 2),
            "edge_density": quality.get("edge_density", 0),
            "saturation": quality.get("saturation", 0),
            "color_temperature": temperature,
            "highlight_clipping": highlights,
            "shadow_clipping": shadows,
            "wall_area": walls,
            "floor_area": floor_area,
            "ceiling_area": quality.get("ceiling_area", 0),
            "perspective_distortion": perspective_distortion,
            "camera_angle": quality.get("camera_angle", {}),
        },
        "quality_score": _finite(
            quality_report.get("quality_score"),
            0,
        ),
        "quality_grade": quality_report.get("quality_grade", "Unknown"),
        "quality_deficits": deficits,
        "scene": classify_scene(quality, semantic),
    }
    strength_clamps: list[dict[str, Any]] = []

    def ensure_minimum(names: tuple[str, ...], minimum: float, needed: bool, reason: str) -> None:
        if not needed:
            return
        original_values = {
            name: _finite(profile.get(name), 0)
            for name in names if name in profile
        }
        if not original_values or all(value >= minimum for value in original_values.values()):
            return
        for name in names:
            if name in profile:
                upper = 0.25 if name == "perspective_correction" else 1.0
                profile[name] = _clamp(minimum, 0.0, upper)
        strength_clamps.append({
            "parameters": list(names), "original_strengths": original_values,
            "applied_strength": minimum, "reason": reason,
        })

    ensure_minimum(
        ("perspective", "perspective_correction"), 0.20,
        perspective_distortion >= 8 or perspective_tilt >= 1.2,
        "measurable perspective distortion or camera tilt was detected",
    )
    ensure_minimum(
        ("highlights", "highlight_recovery"), 0.35, highlights >= 1.0,
        "clipped highlight pixels were measured",
    )
    ensure_minimum(
        ("shadows", "shadow_lift"), 0.35,
        shadows >= 1.0 or brightness < 45 or deep_shadow_pct >= 12,
        "clipped shadows, low scene brightness, or a substantial dark-region share was measured",
    )
    ensure_minimum(
        ("white_balance", "white_balance_strength"), 0.20,
        wb_delta >= 0.012 or temperature < 4300 or temperature > 6800,
        "a measurable neutral-color or color-temperature cast was detected",
    )
    ensure_minimum(
        ("wood_enhancement",), 0.30,
        wood >= 3 and max(deficits["texture"], deficits["color_accuracy"]) >= 0.08,
        "wood coverage and a texture or color-accuracy deficit were detected",
    )
    ensure_minimum(
        ("texture",), 0.25,
        max(deficits["texture"], deficits["dynamic_range"]) >= 0.10 and noise < 18,
        "texture or dynamic-range deficit was detected without excessive noise",
    )
    ensure_minimum(
        ("local_contrast",), 0.30,
        deficits["contrast"] >= 0.10,
        "a measurable contrast deficit was detected",
    )
    ensure_minimum(
        ("micro_contrast",), 0.25,
        max(deficits["contrast"], deficits["texture"]) >= 0.12 and noise < 18,
        "local detail has a contrast or texture deficit and noise is acceptable",
    )
    ensure_minimum(
        ("sharpening",), 0.20,
        deficits["sharpness"] >= 0.08 and noise < 18,
        "a sharpness deficit was detected and noise is acceptable",
    )
    construction_scene = (
        normalized_preset == "CONSTRUCTION PROGRESS"
        or profile["scene"].get("construction") == "construction"
    )
    if construction_scene:
        # Keep construction dimensions and shelf alignment documentary. Tonal
        # and detail stages still run, but geometric warps stay disabled.
        profile["perspective"] = 0.0
        profile["perspective_correction"] = 0.0
        profile["lens_distortion"] = 0.0
        strength_clamps.append({
            "parameters": ["perspective_correction", "lens_distortion"],
            "original_strengths": {
                "perspective_correction": perspective_strength,
                "lens_distortion": _finite(quality.get("lens_distortion_estimate", 0)),
            },
            "applied_strength": 0.0,
            "reason": "Geometric correction is disabled for construction-progress imagery to preserve measured proportions",
        })
    profile["construction_geometry_protection"] = construction_scene
    profile["strength_clamps"] = strength_clamps
    profile["strengths"] = {
        "perspective": profile["perspective"],
        "exposure": profile["exposure"],
        "highlights": profile["highlights"],
        "shadows": profile["shadows"],
        "contrast": profile["contrast"],
        "white_balance": profile["white_balance"],
        "warmth": profile["warmth"],
        "texture": profile["texture"],
        "clarity": profile["clarity"],
        "wood_enhancement": profile["wood_enhancement"],
        "wall_neutralization": profile["wall_neutralization"],
        "window_recovery": profile["window_recovery"],
        "noise_reduction": profile["noise_reduction"],
        "sharpening": profile["sharpening"],
        "instagram_crop": profile["instagram_crop"]["strength"],
    }
    stage = _text(semantic.get("project_stage"))
    style = _text(semantic.get("design_style"))
    profile["scene_scores"]["luxury"] = (
        100.0 if "luxury" in style else quality.get("luxury_score", 0)
    )
    profile["scene_scores"]["construction"] = (
        100.0
        if any(term in stage for term in _CONSTRUCTION_TERMS)
        else quality.get("construction_score", 0)
    )
    profile["scene_scores"]["completed_interior"] = (
        100.0
        if stage in {"completed", "styling", "furniture"}
        else quality.get("completed_interior_score", 0)
    )
    profile["scene"]["camera_angle"] = quality.get("camera_angle", {})
    ratio = float(profile["instagram_crop"]["source_aspect_ratio"])
    profile["instagram_crop"]["primary_variant"] = (
        "story" if ratio < 0.8 else "portrait" if ratio <= 1.0 else "square"
    )
    return profile


def apply_learning_weights(profile: dict[str, Any], weights: Mapping[str, Any], version: int = 0) -> dict[str, Any]:
    """Apply versioned learned multipliers to a derived profile, preserving preset defaults."""
    if not weights:
        profile["adaptive_learning"] = {"version": version, "weights": {}}
        return profile
    aliases = {
        "perspective": ("perspective", "perspective_correction"),
        "exposure": ("exposure", "exposure_correction_ev", "brightness_correction_ev"),
        "highlights": ("highlights", "highlight_recovery"),
        "shadows": ("shadows", "shadow_lift"),
        "contrast": ("contrast",), "white_balance": ("white_balance", "white_balance_strength"),
        "warmth": ("warmth",), "wood_enhancement": ("wood_enhancement",),
        "texture": ("texture",), "clarity": ("clarity", "local_contrast", "micro_contrast"),
        "sharpening": ("sharpening",), "noise_reduction": ("noise_reduction",),
        "wall_neutralization": ("wall_neutralization",),
        "window_recovery": ("window_recovery", "window_glow_recovery"),
    }
    applied = {}
    for name, raw_weight in weights.items():
        try:
            weight = min(1.25, max(1.0, float(raw_weight)))
        except (TypeError, ValueError):
            continue
        if weight == 1.0:
            continue
        keys = aliases.get(name, (name,))
        before = profile.get(keys[0])
        if not isinstance(before, (int, float)):
            continue
        for key in keys:
            value = profile.get(key)
            if isinstance(value, (int, float)):
                profile[key] = round(max(-1.0, min(1.0, value * weight)), 6)
        if name == "contrast":
            profile["contrast_correction"] = round(max(0.85, min(1.15, 1 + (profile["contrast"] * 0.12))), 6)
        applied[name] = {"weight": weight, "base_strength": before, "effective_strength": profile.get(keys[0])}
    profile["adaptive_learning"] = {"version": version, "weights": dict(weights), "applied": applied}
    profile["strengths"] = {**(profile.get("strengths") or {}), **{k: profile.get(k) for k in applied}}
    return profile
