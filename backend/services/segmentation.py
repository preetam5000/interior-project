"""Local, text-prompted AI segmentation for architectural image regions."""
from __future__ import annotations

import logging
import os
import threading
from collections.abc import Sequence
from dataclasses import dataclass
from importlib import import_module
from typing import Any

import cv2
import numpy as np
from PIL import Image

log = logging.getLogger("segmentation")

MODEL_NAME = os.environ.get(
    "SCENE_SEGMENTATION_MODEL",
    "CIDAS/clipseg-rd64-refined",
).strip()
MASK_THRESHOLD = float(
    os.environ.get("SCENE_SEGMENTATION_THRESHOLD", "0.5")
)

CATEGORY_PROMPTS: dict[str, tuple[str, ...]] = {
    "walls": ("interior wall", "wall surface"),
    "wood": ("wooden surface", "wood panel", "wood furniture"),
    "windows": ("window", "window frame"),
    "glass": ("glass surface", "glass panel"),
    "floor": ("floor", "floor surface"),
    "ceiling": ("ceiling", "ceiling surface"),
    "furniture": ("interior furniture", "furniture"),
    "construction_materials": (
        "construction materials",
        "unfinished building materials",
        "construction site materials",
    ),
}


class SegmentationError(RuntimeError):
    """Raised when the configured local segmentation model cannot run."""


@dataclass(frozen=True)
class SegmentationResult:
    """Soft masks and per-category model confidence for one source image."""

    masks: dict[str, np.ndarray]
    confidence: dict[str, float]
    model: str
    threshold: float

    def summary(self) -> dict[str, Any]:
        """Return JSON-safe metadata, excluding image-sized mask arrays."""
        return {
            "enabled": True,
            "model": self.model,
            "categories": {
                category: {
                    "confidence": self.confidence[category],
                    "coverage_pct": round(
                        float(np.mean(mask >= self.threshold) * 100),
                        3,
                    ),
                }
                for category, mask in self.masks.items()
            },
        }


_model_lock = threading.Lock()
_inference_lock = threading.Lock()
_model: Any = None
_processor: Any = None
_torch: Any = None
_model_device: Any = None


def _load_model() -> tuple[Any, Any, Any, Any]:
    global _model, _processor, _torch, _model_device
    if _model is not None:
        return _model, _processor, _torch, _model_device
    with _model_lock:
        if _model is not None:
            return _model, _processor, _torch, _model_device
        try:
            torch = import_module("torch")
            transformers = import_module("transformers")
        except ImportError as exc:
            raise SegmentationError(
                "AI segmentation requires the optional packages in "
                "backend/requirements-segmentation.txt"
            ) from exc
        try:
            model = transformers.CLIPSegForImageSegmentation.from_pretrained(
                MODEL_NAME
            )
            processor = transformers.CLIPSegProcessor.from_pretrained(
                MODEL_NAME
            )
            device = torch.device(
                "cuda" if torch.cuda.is_available() else "cpu"
            )
            model.to(device)
            model.eval()
        except Exception as exc:
            raise SegmentationError(
                f"Could not load local segmentation model {MODEL_NAME!r}"
            ) from exc
        _model, _processor, _torch, _model_device = (
            model,
            processor,
            torch,
            device,
        )
    return _model, _processor, _torch, _model_device


def _to_rgb(image: Image.Image | np.ndarray) -> np.ndarray:
    if isinstance(image, Image.Image):
        return np.asarray(image.convert("RGB"))
    if (
        not isinstance(image, np.ndarray)
        or image.ndim != 3
        or image.shape[2] != 3
        or image.dtype != np.uint8
    ):
        raise ValueError(
            "Segmentation requires a Pillow image or uint8 three-channel "
            "OpenCV BGR array"
        )
    if image.shape[0] == 0 or image.shape[1] == 0:
        raise ValueError("Segmentation image dimensions must be non-zero")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)


def segment(
    image: Image.Image | np.ndarray,
    *,
    categories: Sequence[str] | None = None,
    threshold: float = MASK_THRESHOLD,
) -> SegmentationResult:
    """Generate soft [0, 1] masks for requested scene categories.

    CLIPSeg performs local model inference. Only model weights are obtained
    from Hugging Face; the input image is not uploaded to a remote service.
    """
    if not np.isfinite(threshold) or not 0 < threshold < 1:
        raise ValueError("Segmentation threshold must be between 0 and 1")
    selected = tuple(
        CATEGORY_PROMPTS if categories is None else categories
    )
    unknown = set(selected) - CATEGORY_PROMPTS.keys()
    if unknown:
        raise ValueError(
            "Unknown segmentation category(s): "
            + ", ".join(sorted(unknown))
        )
    if not selected:
        raise ValueError("At least one segmentation category is required")

    rgb = _to_rgb(image)
    height, width = rgb.shape[:2]
    prompts = [
        prompt
        for category in selected
        for prompt in CATEGORY_PROMPTS[category]
    ]
    try:
        model, processor, torch, device = _load_model()
        pil_image = Image.fromarray(rgb)
        encoded = processor(
            text=list(prompts),
            images=[pil_image] * len(prompts),
            padding=True,
            return_tensors="pt",
        )
        encoded = {
            key: value.to(device)
            for key, value in encoded.items()
        }
        with _inference_lock, torch.inference_mode():
            output = model(**encoded)
            logits = output.logits
            if logits.ndim == 2:
                logits = logits.unsqueeze(0)
            probabilities = torch.sigmoid(logits)
            probabilities = torch.nn.functional.interpolate(
                probabilities.unsqueeze(1),
                size=(height, width),
                mode="bilinear",
                align_corners=False,
            ).squeeze(1)
            probabilities = probabilities.cpu().numpy()
    except SegmentationError:
        raise
    except Exception as exc:
        raise SegmentationError(
            f"Local segmentation inference failed with {MODEL_NAME!r}"
        ) from exc

    masks: dict[str, np.ndarray] = {}
    confidence: dict[str, float] = {}
    offset = 0
    for category in selected:
        prompt_count = len(CATEGORY_PROMPTS[category])
        class_probability = np.max(
            probabilities[offset:offset + prompt_count],
            axis=0,
        ).astype(np.float32)
        offset += prompt_count
        masks[category] = np.ascontiguousarray(
            np.where(class_probability >= threshold, class_probability, 0),
            dtype=np.float32,
        )
        positive = class_probability[class_probability >= threshold]
        confidence[category] = round(
            float(np.mean(positive)) if positive.size else 0.0,
            4,
        )
    log.info(
        "scene_segmentation_completed",
        extra={
            "model": MODEL_NAME,
            "image_dimensions": [width, height],
            "categories": {
                name: {
                    "confidence": confidence[name],
                    "coverage_pct": round(
                        float(np.mean(mask >= threshold) * 100),
                        3,
                    ),
                }
                for name, mask in masks.items()
            },
        },
    )
    return SegmentationResult(
        masks,
        confidence,
        MODEL_NAME,
        threshold,
    )


def reset_model_cache() -> None:
    """Clear loaded model state, primarily for isolated test processes."""
    global _model, _processor, _torch, _model_device
    with _model_lock:
        _model = None
        _processor = None
        _torch = None
        _model_device = None
