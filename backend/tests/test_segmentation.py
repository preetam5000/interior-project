import contextlib
import sys
from pathlib import Path
from types import SimpleNamespace

import cv2
import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import (  # noqa: E402
    photo_pipeline,
    pipeline,
    quality_analyzer,
    segmentation,
)


class FakeTensor:
    def __init__(self, value):
        self.value = np.asarray(value)

    def to(self, _device):
        return self

    @property
    def ndim(self):
        return self.value.ndim

    def unsqueeze(self, axis):
        return FakeTensor(np.expand_dims(self.value, axis))

    def squeeze(self, axis=None):
        return FakeTensor(np.squeeze(self.value, axis=axis))

    def cpu(self):
        return self

    def numpy(self):
        return self.value


class FakeTorch:
    inference_mode = staticmethod(contextlib.nullcontext)
    sigmoid = staticmethod(
        lambda tensor: FakeTensor(
            1 / (1 + np.exp(-tensor.value))
        )
    )
    nn = SimpleNamespace(
        functional=SimpleNamespace(
            interpolate=staticmethod(
                lambda tensor, size, **_kwargs: FakeTensor(
                    np.stack(
                        [
                            cv2.resize(
                                sample[0],
                                (size[1], size[0]),
                                interpolation=cv2.INTER_LINEAR,
                            )
                            for sample in tensor.value
                        ],
                        axis=0,
                    )[:, None, :, :]
                )
            )
        )
    )


class FakeProcessor:
    def __init__(self):
        self.calls = []

    def __call__(self, **kwargs):
        self.calls.append(kwargs)
        return {"input_ids": FakeTensor([1])}


class FakeModel:
    def __init__(self):
        values = np.full((18, 4, 4), -5, dtype=np.float32)
        values[0, :2, :2] = 5
        values[2, 2:, :2] = 5
        values[7, :2, 2:] = 5
        self.logits = FakeTensor(values)

    def __call__(self, **_kwargs):
        return SimpleNamespace(logits=self.logits)


def test_segmentation_returns_masks_for_each_scene_class(monkeypatch):
    model = FakeModel()
    processor = FakeProcessor()
    monkeypatch.setattr(
        segmentation,
        "_load_model",
        lambda: (model, processor, FakeTorch, "cpu"),
    )
    image = np.zeros((40, 60, 3), dtype=np.uint8)
    original = image.copy()

    result = segmentation.segment(image)

    assert set(result.masks) == set(segmentation.CATEGORY_PROMPTS)
    assert all(mask.shape == (40, 60) for mask in result.masks.values())
    assert all(mask.dtype == np.float32 for mask in result.masks.values())
    assert result.confidence["walls"] > 0.85
    assert result.summary()["model"] == segmentation.MODEL_NAME
    assert np.array_equal(image, original)
    assert len(processor.calls[0]["text"]) == 18


def test_segmentation_validates_requested_categories_and_threshold():
    image = Image.new("RGB", (32, 24), "white")

    with pytest.raises(ValueError, match="Unknown segmentation category"):
        segmentation.segment(image, categories=["lamps"])
    with pytest.raises(ValueError, match="threshold"):
        segmentation.segment(image, threshold=1)


def test_photo_pipeline_blends_stage_output_only_inside_target_masks():
    image = np.zeros((24, 24, 3), dtype=np.uint8)
    quality = quality_analyzer.analyze(image)
    profile = {"test_strength": 0.7}
    mask = np.zeros((24, 24), dtype=np.float32)
    mask[8:16, 8:16] = 1
    stage = photo_pipeline.PhotoStage(
        "masked_test",
        lambda source, _profile: np.full_like(source, 200),
        ("test_strength",),
        ("walls",),
    )

    result, diagnostics = photo_pipeline.run_pipeline(
        image,
        profile,
        quality,
        stages=[stage],
        masks={"walls": mask},
    )

    assert np.array_equal(result[:4, :4], image[:4, :4])
    assert result[12, 12].mean() == 200
    assert diagnostics[0]["enabled"] is True
    assert diagnostics[0]["strength_applied"] == {"test_strength": 0.7}


def test_photo_pipeline_skips_pixel_edits_when_masks_are_missing():
    image = np.zeros((24, 24, 3), dtype=np.uint8)
    quality = quality_analyzer.analyze(image)
    profile = {"test_strength": 0.7}
    stage = photo_pipeline.PhotoStage(
        "masked_test",
        lambda source, _profile: np.full_like(source, 200),
        ("test_strength",),
        ("walls",),
    )

    result, diagnostics = photo_pipeline.run_pipeline(
        image,
        profile,
        quality,
        stages=[stage],
    )

    assert np.array_equal(result, image)
    assert diagnostics[0]["enabled"] is False
    assert diagnostics[0]["skip_reason"] == (
        "AI segmentation masks are unavailable"
    )


def test_photo_pipeline_skips_geometry_when_all_masks_are_empty():
    image = np.zeros((24, 24, 3), dtype=np.uint8)
    quality = quality_analyzer.analyze(image)
    profile = {"test_strength": 0.7}
    stage = photo_pipeline.PhotoStage(
        "geometry_test",
        lambda source, _profile: np.full_like(source, 200),
        ("test_strength",),
        global_transform=True,
    )

    result, diagnostics = photo_pipeline.run_pipeline(
        image,
        profile,
        quality,
        stages=[stage],
        masks={"walls": np.zeros((24, 24), dtype=np.float32)},
    )

    assert np.array_equal(result, image)
    assert diagnostics[0]["enabled"] is False


def test_enhancement_entry_point_runs_configured_segmentation(monkeypatch):
    masks = {
        name: np.ones((24, 32), dtype=np.float32)
        for name in segmentation.CATEGORY_PROMPTS
    }
    result = segmentation.SegmentationResult(
        masks,
        {name: 0.9 for name in masks},
        "test-model",
        0.5,
    )
    monkeypatch.setattr(pipeline, "SCENE_SEGMENTATION_ENABLED", True)
    monkeypatch.setattr(
        pipeline.segmentation,
        "segment",
        lambda _image: result,
    )
    image = Image.new("RGB", (32, 24), (110, 100, 90))

    _enhanced, _metrics, profile = pipeline.enhance_photo(image)

    assert profile["segmentation"]["model"] == "test-model"
    assert profile["segmentation"]["categories"]["walls"]["confidence"] == 0.9


def test_region_mask_rejects_wrong_dimensions():
    with pytest.raises(ValueError, match="shape"):
        photo_pipeline._region_mask(
            {"walls": np.zeros((8, 8), dtype=np.float32)},
            ("walls",),
            (10, 10),
        )
