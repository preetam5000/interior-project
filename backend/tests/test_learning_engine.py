from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import learning_engine  # noqa: E402


class FakeCursor:
    def __init__(self, documents):
        self.documents = documents

    async def to_list(self, _length):
        return self.documents


class FakeLearningRecords:
    def __init__(self):
        self.document = None
        self.query = None
        self.update = None

    async def update_one(self, query, update, upsert=False):
        self.query = query
        self.update = update
        self.upsert = upsert
        if self.document is None:
            self.document = {
                **update["$setOnInsert"],
                **update["$set"],
            }
        else:
            self.document.update(update["$set"])

    async def update_many(self, query, update):
        self.query = query
        self.update = update
        return SimpleNamespace(modified_count=2)


def test_refresh_adaptive_preset_uses_room_and_preset_key(monkeypatch):
    class SamplesCollection:
        def find(self, _query, _projection):
            return FakeCursor([])

    class PresetsCollection:
        def __init__(self):
            self.query = None

        async def find_one(self, query, _projection):
            self.query = query
            return None

    samples = SamplesCollection()
    presets = PresetsCollection()
    monkeypatch.setattr(
        learning_engine,
        "_collection",
        lambda name: {
            "adaptive_learning_samples": samples,
            "adaptive_presets": presets,
        }[name],
    )

    result = asyncio.run(learning_engine.refresh_adaptive_preset("Kitchen", "AUTO"))

    assert presets.query == {"key": "Kitchen::AUTO"}
    assert result["key"] == "Kitchen::AUTO"


def test_record_processed_image_persists_training_inputs_and_image_refs(
    monkeypatch,
):
    records = FakeLearningRecords()
    monkeypatch.setattr(
        learning_engine.db,
        "learning_records",
        records,
        raising=False,
    )

    result = asyncio.run(
        learning_engine.record_processed_image(
            media_id="media-123",
            scene_analysis={"predictions": {"room_type": {"value": "Kitchen"}}},
            quality_report={"quality_score": 88.2},
            adaptive_profile={"preset": "AUTO"},
            gpt_prompt="Preserve the room; refine light and color.",
            processing_time_seconds=2.34567,
            before_image={
                "file": "original.jpg",
                "url": "https://x/original.jpg",
            },
            after_image={
                "file": "enhanced.jpg",
                "url": "https://x/enhanced.jpg",
            },
        )
    )

    assert records.query == {"media_id": "media-123"}
    assert records.upsert is True
    assert records.document["scene_analysis"]["predictions"]["room_type"]["value"] == "Kitchen"
    assert records.document["quality_report"]["quality_score"] == 88.2
    assert records.document["adaptive_profile"]["preset"] == "AUTO"
    assert records.document["gpt_prompt"] == result["gpt_prompt"]
    assert records.document["processing_time_seconds"] == 2.3457
    assert records.document["quality_after"] == {}
    assert records.document["quality_gain"] is None
    assert records.document["api_cost_usd"] is None
    assert records.document["before_image"]["file"] == "original.jpg"
    assert records.document["after_image"]["file"] == "enhanced.jpg"
    assert records.document["instagram_engagement"] == {
        "likes": None,
        "reach": None,
        "saves": None,
        "shares": None,
        "post_id": None,
        "synced_at": None,
    }


def test_update_instagram_engagement_stores_only_requested_metrics(monkeypatch):
    records = FakeLearningRecords()
    monkeypatch.setattr(
        learning_engine.db,
        "learning_records",
        records,
        raising=False,
    )

    updated = asyncio.run(
        learning_engine.update_instagram_engagement(
            ["media-1", "media-2", "media-1"],
            "post-1",
            {"likes": 12, "reach": 345, "saves": 7, "shares": 3},
            synced_at="2026-10-24T00:00:00+00:00",
        )
    )

    assert updated == 2
    assert records.query == {"media_id": {"$in": ["media-1", "media-2"]}}
    assert records.update["$set"]["instagram_engagement"] == {
        "likes": 12,
        "reach": 345,
        "saves": 7,
        "shares": 3,
        "post_id": "post-1",
        "synced_at": "2026-10-24T00:00:00+00:00",
    }


def test_update_instagram_engagement_rejects_invalid_metric(monkeypatch):
    records = FakeLearningRecords()
    monkeypatch.setattr(
        learning_engine.db,
        "learning_records",
        records,
        raising=False,
    )

    with pytest.raises(ValueError, match="likes"):
        asyncio.run(
            learning_engine.update_instagram_engagement(
                ["media-1"],
                "post-1",
                {"likes": -1},
            )
        )


def test_reprocessing_does_not_clear_existing_instagram_engagement(monkeypatch):
    records = FakeLearningRecords()
    existing_engagement = {
        "likes": 14,
        "reach": 520,
        "saves": 9,
        "shares": 2,
        "post_id": "post-1",
        "synced_at": "2026-10-24T00:00:00+00:00",
    }
    records.document = {
        "media_id": "media-123",
        "instagram_engagement": existing_engagement,
    }
    monkeypatch.setattr(
        learning_engine.db,
        "learning_records",
        records,
        raising=False,
    )

    asyncio.run(
        learning_engine.record_processed_image(
            media_id="media-123",
            scene_analysis={},
            quality_report={"quality_score": 90},
            adaptive_profile={"preset": "AUTO"},
            gpt_prompt=None,
            processing_time_seconds=1,
            before_image={"file": "original.jpg"},
            after_image={"file": "enhanced.jpg"},
        )
    )

    assert records.document["instagram_engagement"] == existing_engagement


def test_summarize_records_returns_ai_dashboard_metrics():
    summary = learning_engine.summarize_records(
        [
            {
                "scene_analysis": {
                    "predictions": {
                        "room_type": {"value": "Kitchen"},
                        "project_stage": {"value": "Construction"},
                    }
                },
                "quality_gain": 8,
                "processing_time_seconds": 3,
                "api_cost_usd": 0.05,
                "adaptive_profile": {
                    "gpt_image_decision": {"run_gpt": True}
                },
            },
            {
                "scene_analysis": {
                    "predictions": {
                        "room_type": {"value": "Kitchen"},
                        "project_stage": {"value": "Completed Interior"},
                    }
                },
                "quality_gain": 4,
                "processing_time_seconds": 5,
                "api_cost_usd": 0,
                "adaptive_profile": {
                    "gpt_image_decision": {"run_gpt": False}
                },
            },
        ],
        total_count=2,
    )

    assert summary["images_processed"] == 2
    assert summary["average_quality_gain"] == 6
    assert summary["quality_gain_samples"] == 2
    assert summary["average_processing_time_seconds"] == 4
    assert summary["gpt_usage_rate"] == 50
    assert summary["gpt_images_processed"] == 1
    assert summary["api_cost_usd"] == pytest.approx(0.05)
    assert summary["cost_per_image_usd"] == pytest.approx(0.025)
    assert summary["most_common_room_types"] == [{"name": "Kitchen", "count": 2}]
    assert summary["most_common_project_stages"] == [
        {"name": "Completed Interior", "count": 1},
        {"name": "Construction", "count": 1},
    ]
