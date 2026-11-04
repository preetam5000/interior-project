from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import decision_engine  # noqa: E402


@pytest.mark.parametrize(
    ("report", "classification", "expected_run", "expected_rule"),
    [
        (
            {"quality_score": 95},
            {"project_stage": "Completed Interior", "design_style": "Luxury"},
            False,
            "quality_at_least_95",
        ),
        (
            {"quality_score": 92, "construction_score": 72},
            {"project_stage": "Construction Progress"},
            False,
            "construction_progress_quality_over_90",
        ),
        (
            {"quality_score": 90, "construction_score": 20, "brightness": 60},
            {"project_stage": "Construction Progress"},
            False,
            "no_matching_polish_rule",
        ),
        (
            {"quality_score": 90, "luxury_score": 10, "brightness": 60},
            {"project_stage": "Completed Interior"},
            False,
            "no_matching_polish_rule",
        ),
        (
            {"quality_score": 89},
            {"project_stage": "Completed Interior"},
            True,
            "completed_interior_quality_under_90",
        ),
        (
            {"quality_score": 70, "luxury_score": 65, "brightness": 80},
            {},
            True,
            "luxury_image",
        ),
        (
            {"quality_score": 70, "luxury_score": 20, "brightness": 34.9},
            {},
            True,
            "dark_image",
        ),
        (
            {
                "quality_score": 80,
                "construction_score": 65,
                "brightness": 60,
            },
            {},
            False,
            "no_matching_polish_rule",
        ),
    ],
)
def test_decision_engine_applies_ordered_rules(
    report,
    classification,
    expected_run,
    expected_rule,
):
    decision = decision_engine.decide(
        report,
        classification=classification,
    )

    assert decision["run_gpt"] is expected_run
    assert decision["rule"] == expected_rule
    assert decision["reason"]


def test_decision_engine_records_metrics_and_detected_scene():
    decision = decision_engine.decide(
        {
            "quality_score": 80,
            "construction_score": 10,
            "luxury_score": 10,
            "brightness": 25,
            "noise": 4.2,
            "sharpness": 42,
            "perspective_distortion": 12,
        },
        scene_analysis={
            "predictions": {
                "project_stage": {
                    "value": "Completed Interior",
                    "confidence": 0.9,
                }
            }
        },
    )

    assert decision["run_gpt"] is True
    assert decision["rule"] == "completed_interior_quality_under_90"
    assert decision["inputs"] == {
        "quality_score": 80,
        "construction_score": 10,
        "luxury_score": 10,
        "brightness": 25,
        "noise": 4.2,
        "sharpness": 42,
        "perspective": 12,
        "project_stage": "completed interior",
        "construction_progress_detected": False,
        "completed_interior_detected": True,
        "luxury_detected": False,
    }


@pytest.mark.parametrize(
    ("options", "expected_rule"),
    [
        ({"enabled": False}, "gpt_image_disabled"),
        ({"segmentation_enabled": True}, "segmentation_mask_safety"),
    ],
)
def test_safety_gates_take_priority(options, expected_rule):
    decision = decision_engine.decide(
        {
            "quality_score": 30,
            "brightness": 10,
            "luxury_score": 99,
        },
        **options,
    )

    assert decision["run_gpt"] is False
    assert decision["rule"] == expected_rule
    assert decision["reason"]
