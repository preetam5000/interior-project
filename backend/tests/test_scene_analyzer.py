import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import scene_analyzer  # noqa: E402


EXPECTED_PREDICTIONS = {
    "room_type",
    "project_stage",
    "interior_style",
    "environment",
    "lighting_type",
    "camera_angle",
    "perspective_tilt",
    "window_area",
    "wall_area",
    "floor_area",
    "ceiling_area",
    "wood_area",
    "furniture_area",
    "brightness",
    "contrast",
    "saturation",
    "sharpness",
    "blur",
    "noise",
    "exposure",
    "color_temperature",
    "white_balance",
    "highlight_clipping",
    "shadow_clipping",
}


def test_analyze_returns_json_predictions_with_confidence():
    image = Image.new("RGB", (96, 64), (160, 150, 140))

    result = scene_analyzer.analyze(
        image,
        {
            "room_type": "Kitchen",
            "project_stage": "Construction",
            "design_style": "Modern",
            "confidence": 0.87,
        },
    )

    assert result["schema_version"] == 1
    assert EXPECTED_PREDICTIONS <= result["predictions"].keys()
    assert result["predictions"]["room_type"] == {
        "value": "Kitchen",
        "confidence": 0.87,
    }
    assert result["predictions"]["perspective_tilt"]["unit"] == "degrees"
    for prediction in result["predictions"].values():
        assert 0 <= prediction["confidence"] <= 1
        assert "value" in prediction
    json.dumps(result)


def test_analyze_accepts_opencv_bgr_arrays():
    image = np.full((48, 64, 3), 120, dtype=np.uint8)

    result = scene_analyzer.analyze(image)

    assert result["predictions"]["brightness"]["value"] == pytest.approx(
        47.06,
        abs=1,
    )


def test_registered_detectors_can_add_prediction_fields():
    name = "test_extension"
    scene_analyzer.register_detector(
        name,
        lambda _image, _metrics, _semantic: {
            "extension_example": {"value": "detected", "confidence": 0.9}
        },
    )
    image = Image.new("RGB", (16, 16), (100, 100, 100))

    result = scene_analyzer.analyze(image)

    assert result["predictions"]["extension_example"] == {
        "value": "detected",
        "confidence": 0.9,
    }


def test_detector_registration_rejects_duplicate_names():
    with pytest.raises(ValueError, match="already registered"):
        scene_analyzer.register_detector(
            "quality",
            lambda _image, _metrics, _semantic: {},
        )
