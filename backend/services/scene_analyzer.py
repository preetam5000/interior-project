"""Structured scene analysis from vision labels and image metrics."""
from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime, timezone
import math
from typing import Any

import cv2
import numpy as np
from PIL import Image

from services import quality_analyzer

Prediction = dict[str, Any]
Detector = Callable[
    [np.ndarray, Mapping[str, Any], Mapping[str, Any]],
    Mapping[str, Prediction],
]

_DETECTORS: dict[str, Detector] = {}


def register_detector(name: str, detector: Detector) -> None:
    """Register a detector that emits distinct prediction field names."""
    normalized_name = name.strip()
    if not normalized_name:
        raise ValueError("Detector name must not be empty")
    if normalized_name in _DETECTORS:
        raise ValueError(f"Detector already registered: {normalized_name}")
    _DETECTORS[normalized_name] = detector


def _prediction(
    value: Any,
    confidence: float,
    unit: str | None = None,
) -> Prediction:
    numeric_confidence = float(confidence)
    if not math.isfinite(numeric_confidence):
        raise ValueError("Prediction confidence must be finite")
    result = {
        "value": value,
        "confidence": round(float(np.clip(numeric_confidence, 0, 1)), 3),
    }
    if unit:
        result["unit"] = unit
    return result


def _confidence(semantic: Mapping[str, Any]) -> float:
    try:
        value = float(semantic.get("confidence", 0))
    except (TypeError, ValueError):
        return 0.0
    return float(np.clip(value, 0, 1)) if math.isfinite(value) else 0.0


def _semantic_detector(
    _image: np.ndarray,
    metrics: Mapping[str, Any],
    semantic: Mapping[str, Any],
) -> Mapping[str, Prediction]:
    confidence = _confidence(semantic)
    room_type = semantic.get("room_type") or "Unknown"
    project_stage = semantic.get("project_stage") or "Unknown"
    style = semantic.get("design_style") or "Unknown"
    room_key = str(room_type).strip().lower()
    outdoor_rooms = {"exterior", "landscape"}
    indoor_rooms = {
        "living room",
        "bedroom",
        "kitchen",
        "dining",
        "bathroom",
        "wardrobe",
        "office",
        "staircase",
        "commercial",
    }
    outdoor_cues = float(metrics.get("outdoor_cues", 0))
    if room_key in outdoor_rooms:
        environment, environment_confidence = "outdoor", confidence
    elif room_key in indoor_rooms:
        environment, environment_confidence = "indoor", confidence
    elif outdoor_cues >= 12:
        environment = "outdoor"
        environment_confidence = min(0.8, outdoor_cues / 30)
    else:
        environment, environment_confidence = "indoor", 0.4

    return {
        "room_type": _prediction(room_type, confidence),
        "project_stage": _prediction(project_stage, confidence),
        "interior_style": _prediction(style, confidence),
        "environment": _prediction(environment, environment_confidence),
    }


def _lighting_detector(
    _image: np.ndarray,
    metrics: Mapping[str, Any],
    _semantic: Mapping[str, Any],
) -> Mapping[str, Prediction]:
    window_area = float(metrics.get("window_coverage", 0))
    outdoor_cues = float(metrics.get("outdoor_cues", 0))
    temperature = float(metrics.get("color_temperature", 5500))
    brightness = float(metrics.get("brightness", 50))
    has_daylight_cue = window_area >= 8 or outdoor_cues >= 12
    if has_daylight_cue and temperature < 4300:
        lighting = "mixed"
        confidence = min(0.75, 0.45 + window_area / 100)
    elif has_daylight_cue:
        lighting = "natural"
        confidence = min(0.8, 0.5 + window_area / 100)
    elif temperature < 4300 and brightness < 70:
        lighting, confidence = "artificial", 0.45
    elif temperature > 7000 and brightness < 70:
        lighting, confidence = "artificial", 0.4
    else:
        lighting, confidence = "unknown", 0.25
    return {"lighting_type": _prediction(lighting, confidence)}


def _quality_detector(
    image: np.ndarray,
    metrics: Mapping[str, Any],
    _semantic: Mapping[str, Any],
) -> Mapping[str, Prediction]:
    camera_angle = metrics.get("camera_angle") or {}
    tilt = float(camera_angle.get("roll_degrees", 0))
    line_count = int(metrics.get("vertical_line_count", 0))
    tilt_confidence = min(0.85, 0.25 + line_count * 0.05)
    angle = "tilted" if abs(tilt) >= 1 else str(
        camera_angle.get("view", "straight_or_unknown")
    )
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
    hsv = cv2.cvtColor(sample, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 70, 140) > 0
    rows = np.indices(gray.shape)[0] / max(gray.shape[0] - 1, 1)
    lower_scene = rows >= 0.35
    furniture_like = (
        lower_scene
        & (edges | (hsv[:, :, 1] > 55))
        & (gray > 20)
        & (gray < 245)
    )
    furniture_area = float(np.mean(furniture_like) * 100)
    wb = metrics.get("white_balance_shift") or {}
    wb_confidence = 0.65 if np.any(hsv[:, :, 1] < 35) else 0.3
    area_confidence = 0.35
    return {
        "camera_angle": _prediction(angle, tilt_confidence),
        "perspective_tilt": _prediction(tilt, tilt_confidence, "degrees"),
        "window_area": _prediction(
            float(metrics.get("window_coverage", 0)),
            0.35,
            "percent",
        ),
        "wall_area": _prediction(
            float(metrics.get("wall_area", 0)),
            area_confidence,
            "percent",
        ),
        "floor_area": _prediction(
            float(metrics.get("floor_area", 0)),
            area_confidence,
            "percent",
        ),
        "ceiling_area": _prediction(
            float(metrics.get("ceiling_area", 0)),
            area_confidence,
            "percent",
        ),
        "wood_area": _prediction(
            float(metrics.get("wood_area", 0)),
            0.5,
            "percent",
        ),
        "furniture_area": _prediction(furniture_area, 0.2, "percent"),
        "brightness": _prediction(
            float(metrics.get("brightness", 0)),
            0.99,
            "percent",
        ),
        "contrast": _prediction(
            float(metrics.get("contrast", 0)),
            0.95,
            "score",
        ),
        "saturation": _prediction(
            float(metrics.get("saturation", 0)),
            0.95,
            "percent",
        ),
        "sharpness": _prediction(
            float(metrics.get("sharpness", 0)),
            0.8,
            "score",
        ),
        "blur": _prediction(
            float(metrics.get("blur_score", 0)),
            0.8,
            "score",
        ),
        "noise": _prediction(float(metrics.get("noise", 0)), 0.65, "score"),
        "exposure": _prediction(str(metrics.get("exposure", "unknown")), 0.8),
        "color_temperature": _prediction(
            float(metrics.get("color_temperature", 0)),
            0.55,
            "kelvin",
        ),
        "white_balance": _prediction(wb, wb_confidence),
        "highlight_clipping": _prediction(
            float(metrics.get("highlight_clipping", 0)),
            0.95,
            "percent",
        ),
        "shadow_clipping": _prediction(
            float(metrics.get("shadow_clipping", 0)),
            0.95,
            "percent",
        ),
    }


register_detector("semantic", _semantic_detector)
register_detector("lighting", _lighting_detector)
register_detector("quality", _quality_detector)


def analyze(
    image: Image.Image | np.ndarray,
    semantic: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Analyze a Pillow image or a uint8 OpenCV BGR array."""
    if isinstance(image, Image.Image):
        rgb = np.asarray(image.convert("RGB"))
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    else:
        bgr = image
    metrics = quality_analyzer.analyze(bgr).as_dict()
    semantic_data = semantic or {}
    predictions: dict[str, Prediction] = {}
    for detector_name, detector in _DETECTORS.items():
        detected = detector(bgr, metrics, semantic_data)
        for field, result in detected.items():
            if field in predictions:
                raise ValueError(
                    "Scene analysis field "
                    f"{field!r} was emitted by multiple detectors"
                )
            if not isinstance(result, Mapping) or not {
                "value",
                "confidence",
            }.issubset(result):
                raise ValueError(
                    f"Detector {detector_name!r} returned an invalid "
                    f"prediction for {field!r}"
                )
            predictions[field] = _prediction(
                result["value"],
                result["confidence"],
                result.get("unit"),
            )
    return {
        "schema_version": 1,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "predictions": predictions,
    }
