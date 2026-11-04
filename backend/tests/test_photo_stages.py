import asyncio
import sys
import logging
from pathlib import Path

import cv2
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import (  # noqa: E402
    adaptive_clarity,
    adaptive_profile,
    color_cast,
    color_grading,
    highlight_recovery,
    local_contrast,
    noise_reduction,
    perspective,
    quality_analyzer,
    shadow_recovery,
    smart_sharpen,
    texture,
    white_balance,
    wood_tone,
)
from services import pipeline  # noqa: E402
from services import photo_pipeline  # noqa: E402


def test_optional_gpt_polish_receives_opencv_enhanced_image(tmp_path, monkeypatch):
    original = Image.new("RGB", (24, 18), (25, 30, 35))
    opencv_result = Image.new("RGB", (24, 18), (190, 125, 80))
    events = []
    captured = {}

    async def fetch_local(_name):
        return b"original-upload"

    async def put_file(name, _path, _content_type):
        return f"https://example.test/{name}"

    async def track_usage(*_args):
        return None

    def enhance(_image, *_args):
        events.append("opencv")
        return opencv_result.copy(), {
            "brightness": 50,
            "quality_score": 80,
        }, {
            "preset": "AUTO",
            "segmentation": {"enabled": False},
        }

    def edit_image(input_path, output_path, *_args, **_kwargs):
        events.append("gpt")
        captured["gpt_prompt"] = _kwargs.get("generated_prompt")
        with Image.open(input_path) as image:
            processed = image.convert("RGB")
        captured["input_size"] = processed.size
        captured["input_pixel"] = processed.getpixel((8, 8))
        processed.save(output_path, format="PNG")

    monkeypatch.setattr(pipeline.st, "fetch_local", fetch_local)
    monkeypatch.setattr(pipeline.st, "put_file", put_file)
    monkeypatch.setattr(
        pipeline.st,
        "work_path",
        lambda name: tmp_path / name,
    )
    monkeypatch.setattr(pipeline.ie, "load", lambda _source: original.copy())
    monkeypatch.setattr(pipeline, "enhance_photo", enhance)
    monkeypatch.setattr(pipeline, "USE_AI_EDITOR", True)
    monkeypatch.setattr(pipeline, "EDITOR_MODE", "architectural")
    monkeypatch.setattr(pipeline, "EDITOR_STYLE_REFERENCE", "")
    monkeypatch.setattr(pipeline.aiie, "edit_image", edit_image)
    monkeypatch.setattr(pipeline, "track_usage", track_usage)
    monkeypatch.setattr(pipeline.ie, "quality_metrics", lambda _image: {"overall": 50})
    monkeypatch.setattr(pipeline.ie, "VARIANTS", {})
    monkeypatch.setattr(pipeline, "cloudinary_ready", lambda _settings: False)

    updates = asyncio.run(
        pipeline.render_image_outputs(
            {
                "id": "ai-polish-test",
                "files": {"original": "original.jpg"},
                "urls": {},
            },
            {},
            classification={"project_stage": "Completed Interior"},
        )
    )

    assert events == ["opencv", "gpt"]
    assert captured["input_size"] == opencv_result.size
    assert captured["input_pixel"] != original.getpixel((8, 8))
    assert captured["input_pixel"] == pytest.approx(
        opencv_result.getpixel((8, 8)),
        abs=8,
    )
    assert updates["enhanced_by"] == "openai"
    assert updates["gpt_image_decision"]["run_gpt"] is True
    assert updates["gpt_prompt"]
    assert captured["gpt_prompt"] == updates["gpt_prompt"]
    assert (
        updates["gpt_image_decision"]["rule"]
        == "completed_interior_quality_under_90"
    )


def test_quality_analyzer_measures_all_requested_dimensions():
    image = np.tile(np.arange(256, dtype=np.uint8), (128, 1))
    bgr = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)

    metrics = quality_analyzer.analyze(bgr)

    assert metrics.exposure in {"underexposed", "balanced", "overexposed"}
    assert 0 <= metrics.brightness <= 100
    assert metrics.contrast >= 0
    assert metrics.blur_score >= 0
    assert metrics.noise >= 0
    assert 0 <= metrics.dynamic_range <= 100
    assert len(metrics.histogram) == 16
    assert sum(metrics.histogram) == pytest.approx(1, abs=0.01)
    assert metrics.color_temperature >= 2000
    assert metrics.edge_density >= 0
    assert 0 <= metrics.highlight_clipping <= 100
    assert 0 <= metrics.shadow_clipping <= 100
    assert 0 <= metrics.shadow_percentage <= 100
    assert metrics.wall_area >= 0
    assert metrics.wood_area >= 0
    assert metrics.floor_area >= 0
    assert metrics.ceiling_area >= 0
    assert metrics.luxury_score >= 0
    assert metrics.construction_score >= 0
    assert metrics.completed_interior_score >= 0
    assert metrics.vertical_line_count >= 0
    assert metrics.perspective_distortion >= 0
    assert "roll_degrees" in metrics.camera_angle


def test_quality_report_explains_each_score_without_modifying_image():
    height, width = 96, 128
    y, x = np.mgrid[:height, :width]
    image = np.stack(
        (
            np.clip(65 + x, 0, 255),
            np.clip(72 + y, 0, 255),
            np.clip(80 + (x + y) // 2, 0, 255),
        ),
        axis=2,
    ).astype(np.uint8)
    original = image.copy()

    report = quality_analyzer.analyze(image).as_dict()

    expected_categories = {
        "sharpness",
        "exposure",
        "composition",
        "contrast",
        "dynamic_range",
        "noise",
        "perspective",
        "white_balance",
        "color_accuracy",
        "texture",
        "lighting",
        "subject_visibility",
    }
    assert 0 <= report["quality_score"] <= 100
    assert report["quality_grade"] in {"A", "B", "C", "D"}
    assert expected_categories == report["score_breakdown"].keys()
    assert all(
        0 <= detail["score"] <= 100 and detail["reason"]
        for detail in report["score_breakdown"].values()
    )
    assert report["recommended_actions"]
    assert np.array_equal(image, original)


def test_adaptive_profile_changes_with_image_and_preset():
    dark = np.full((64, 64, 3), 35, dtype=np.uint8)
    bright = np.full((64, 64, 3), 225, dtype=np.uint8)
    dark_quality = quality_analyzer.analyze(dark).as_dict()
    bright_quality = quality_analyzer.analyze(bright).as_dict()

    dark_profile = adaptive_profile.build_profile(dark_quality, "AUTO")
    bright_profile = adaptive_profile.build_profile(bright_quality, "AUTO")
    luxury_profile = adaptive_profile.build_profile(dark_quality, "LUXURY")

    assert (
        dark_profile["brightness_correction_ev"]
        > bright_profile["brightness_correction_ev"]
    )
    assert dark_profile["shadow_lift"] > bright_profile["shadow_lift"]
    assert luxury_profile["preset"] == "LUXURY"
    assert luxury_profile["warmth"] != dark_profile["warmth"] or (
        luxury_profile["wood_enhancement"] != dark_profile["wood_enhancement"]
    )
    assert set(dark_profile["scene"]) >= {
        "environment",
        "construction",
        "interior_status",
        "time_of_day",
        "lighting",
    }
    for preset in adaptive_profile.PRESETS:
        profile = adaptive_profile.build_profile(dark_quality, preset)
        assert profile["preset"] == preset


def test_profile_uses_structured_scene_and_quality_report():
    image = np.full((72, 96, 3), 38, dtype=np.uint8)
    quality_report = quality_analyzer.analyze(image).as_dict()
    scene = {
        "predictions": {
            "room_type": {"value": "Kitchen", "confidence": 0.91},
            "project_stage": {"value": "Construction", "confidence": 0.88},
            "interior_style": {"value": "Modern", "confidence": 0.82},
            "environment": {"value": "indoor", "confidence": 0.9},
            "perspective_tilt": {
                "value": 4.0,
                "confidence": 0.8,
                "unit": "degrees",
            },
            "wood_area": {"value": 24.0, "confidence": 0.75},
            "wall_area": {"value": 38.0, "confidence": 0.7},
            "window_area": {"value": 14.0, "confidence": 0.8},
        }
    }

    profile = adaptive_profile.build_profile(
        scene_analysis=scene,
        quality_report=quality_report,
    )
    positional_profile = adaptive_profile.build_profile(scene, quality_report)

    expected_strengths = {
        "perspective",
        "exposure",
        "highlights",
        "shadows",
        "contrast",
        "white_balance",
        "warmth",
        "texture",
        "clarity",
        "wood_enhancement",
        "wall_neutralization",
        "window_recovery",
        "noise_reduction",
        "sharpening",
        "instagram_crop",
    }
    assert set(profile["strengths"]) == expected_strengths
    assert positional_profile["strengths"] == profile["strengths"]
    assert profile["scene"]["room_type"] == "Kitchen"
    assert profile["scene"]["construction"] == "construction"
    assert profile["perspective_correction"] <= 0.18
    assert -0.35 <= profile["exposure_correction_ev"] <= 0.35
    assert profile["instagram_crop"]["preserve_all_pixels"] is True
    assert all(
        -1 <= value <= 1
        for name, value in profile["strengths"].items()
        if name == "warmth"
    )
    assert all(
        0 <= value <= 1
        for name, value in profile["strengths"].items()
        if name != "warmth"
    )


def test_scene_classifier_uses_vision_room_and_project_stage():
    image = np.full((48, 48, 3), 120, dtype=np.uint8)
    metrics = quality_analyzer.analyze(image).as_dict()

    scene = adaptive_profile.classify_scene(
        metrics,
        {"room_type": "Kitchen", "project_stage": "Electrical"},
    )

    assert scene["environment"] == "indoor"
    assert scene["construction"] == "construction"
    assert scene["room_type"] == "Kitchen"


def test_classical_stages_preserve_dimensions_and_valid_pixels():
    height, width = 96, 128
    y, x = np.mgrid[:height, :width]
    image = np.stack(
        (
            np.clip(70 + x, 0, 255),
            np.clip(65 + y, 0, 255),
            np.clip(55 + (x + y) // 2, 0, 255),
        ),
        axis=2,
    ).astype(np.uint8)
    metrics = quality_analyzer.analyze(image)

    result = perspective.correct(image)
    result = highlight_recovery.recover(result, metrics)
    result = shadow_recovery.recover(result, metrics)
    result = white_balance.correct(result)
    profile = adaptive_profile.build_profile(metrics.as_dict())
    result = color_cast.remove(result, profile)
    result = local_contrast.enhance(result, metrics, profile)
    result = adaptive_clarity.enhance(result, profile)
    result = texture.enhance(result, metrics, profile)
    result = wood_tone.enhance(result, profile)
    result = smart_sharpen.sharpen(result, metrics, profile)
    result = noise_reduction.reduce(result, metrics, profile)
    result = color_grading.grade(result, profile)

    assert result.shape == image.shape
    assert result.dtype == np.uint8
    assert np.isfinite(result).all()


def test_highlight_recovery_does_not_change_dark_regions():
    image = np.full((32, 32, 3), 60, dtype=np.uint8)
    image[8:24, 8:24] = 255
    metrics = quality_analyzer.analyze(image)

    result = highlight_recovery.recover(image, metrics)

    assert np.array_equal(result[:4, :4], image[:4, :4])
    assert result[16, 16].mean() < image[16, 16].mean()


def test_pipeline_logs_every_adaptive_stage_in_order(caplog):
    caplog.set_level(logging.INFO, logger="pipeline")
    source = Image.new("RGB", (72, 96), (110, 105, 100))

    result, _, profile = pipeline.enhance_photo(
        source,
        vision={"room_type": "Kitchen", "project_stage": "Construction"},
    )

    stages = [
        record.stage
        for record in caplog.records
        if getattr(record, "stage", None)
    ]
    assert stages == [
        "perspective",
        "lens_distortion",
        "highlight_recovery",
        "shadow_recovery",
        "adaptive_exposure",
        "white_balance",
        "color_temperature",
        "wall_neutralization",
        "wood_tone",
        "floor_texture",
        "texture",
        "local_contrast",
        "micro_contrast",
        "selective_sharpening",
        "noise_reduction",
        "window_glow",
        "vignette",
        "instagram_crop",
    ]
    assert result.size == source.size
    assert profile["instagram_crop"]["preserve_all_pixels"] is True
    assert len(profile["stages"]) == 18
    assert profile["stages"][0]["stage"] == "perspective"
    assert profile["stages"][-1]["stage"] == "instagram_crop"


def test_photo_pipeline_logs_measurements_time_and_profile_strength(caplog):
    caplog.set_level(logging.INFO, logger="pipeline")
    source = Image.new("RGB", (72, 96), (110, 105, 100))
    bgr = cv2.cvtColor(np.asarray(source), cv2.COLOR_RGB2BGR)
    quality = quality_analyzer.analyze(bgr)
    profile = adaptive_profile.build_profile(quality.as_dict())

    result, diagnostics = photo_pipeline.run_pipeline(
        bgr,
        profile,
        quality,
        enabled_stages={"texture": False},
    )

    assert len(diagnostics) == 18
    assert diagnostics[0]["stage"] == "perspective"
    texture_log = next(
        entry for entry in diagnostics if entry["stage"] == "texture"
    )
    assert texture_log["enabled"] is False
    assert texture_log["input"] == texture_log["output"]
    assert texture_log["execution_time_ms"] >= 0
    assert texture_log["strength_applied"] == {
        "texture": profile["texture"],
    }
    assert all(
        {
            "input",
            "output",
            "execution_time_ms",
            "strength_applied",
        } <= entry.keys()
        for entry in diagnostics
    )
    assert result.shape == bgr.shape
    records = [
        record
        for record in caplog.records
        if getattr(record, "stage", None)
    ]
    assert len(records) == len(diagnostics)


def test_photo_pipeline_rejects_unknown_stage_toggles():
    image = np.zeros((32, 32, 3), dtype=np.uint8)
    quality = quality_analyzer.analyze(image)
    profile = adaptive_profile.build_profile(quality.as_dict())

    with pytest.raises(ValueError, match="Unknown photo pipeline stage"):
        photo_pipeline.run_pipeline(
            image,
            profile,
            quality,
            enabled_stages={"typo_stage": False},
        )


def test_batch_enhancement_preserves_order_and_dimensions():
    images = [
        Image.new("RGB", (64, 48), (35, 45, 55)),
        Image.new("RGB", (48, 64), (210, 215, 220)),
    ]

    results = pipeline.enhance_batch(images, max_workers=2)

    result_sizes = [item[0].size for item in results]
    input_sizes = [image.size for image in images]
    assert result_sizes == input_sizes
    dark_exposure = results[0][2]["brightness_correction_ev"]
    bright_exposure = results[1][2]["brightness_correction_ev"]
    assert (
        dark_exposure
        > bright_exposure
    )
