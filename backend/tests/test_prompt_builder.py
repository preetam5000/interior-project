from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import prompt_builder  # noqa: E402


def test_build_prompt_combines_only_relevant_context_templates():
    prompt = prompt_builder.build_prompt(
        "architectural",
        classification={
            "room_type": "Kitchen",
            "project_stage": "Construction Progress",
            "design_style": "Modern",
            "luxury_score": 72,
            "construction_score": 83,
        },
        scene_analysis={
            "predictions": {
                "lighting_type": {"value": "natural", "confidence": 0.8},
                "window_area": {"value": 12.5, "confidence": 0.7},
                "wood_area": {"value": 18.0, "confidence": 0.7},
                "wall_area": {"value": 31.0, "confidence": 0.7},
            }
        },
        quality_report={
            "quality_score": 61.5,
            "quality_grade": "C",
            "score_breakdown": {
                "exposure": {"score": 48, "reason": "Highlights are clipped."}
            },
            "recommended_actions": ["Balance exposure carefully."],
        },
    )

    assert "Room context: kitchen." in prompt
    assert "Project stage: construction or progress." in prompt
    assert "Lighting: natural daylight is indicated." in prompt
    assert "Style: modern." in prompt
    assert "Estimated luxury score is 72.0/100." in prompt
    assert "Estimated construction score is 83.0/100." in prompt
    assert "Window area is estimated at 12.5%." in prompt
    assert "Wood occupies an estimated 18.0% of the image." in prompt
    assert "Wall area is estimated at 31.0%." in prompt
    assert "Overall measured image quality: 61.5/100 (grade C)." in prompt
    assert "Areas needing the most restraint-aware attention: exposure." in prompt
    assert "Room context: bathroom." not in prompt


def test_build_prompt_omits_irrelevant_or_missing_context():
    prompt = prompt_builder.build_prompt(
        "minimal",
        classification={"room_type": "unknown"},
        scene_analysis={"predictions": {"wood_area": {"value": 4}}},
    )

    assert "Preset: Minimal." in prompt
    assert "Room context:" not in prompt
    assert "Wood occupies" not in prompt
    assert prompt_builder.STYLE_REFERENCE_PROMPT not in prompt


def test_build_prompt_logs_the_generated_prompt(caplog):
    with caplog.at_level(logging.INFO, logger="prompt_builder"):
        prompt = prompt_builder.build_prompt("luxury")

        assert "Generated GPT Image prompt" in caplog.text
        assert prompt in caplog.text


def test_build_prompt_supports_approval_queue_modes():
    assert "Preset: Bright." in prompt_builder.build_prompt("bright")
    assert "Preset: Instagram ready." in prompt_builder.build_prompt("instagram ready")


def test_build_prompt_uses_interior_design_instagram_edit_brief():
    prompt = prompt_builder.build_prompt("architectural")

    assert "You are a professional interior design photo editor." in prompt
    assert "Enhance this image for Instagram while preserving authenticity." in prompt
    assert "Preserve measurements and proportions." in prompt
    assert "Improve white balance." in prompt
    assert "Output should be ready for Instagram posting." in prompt
