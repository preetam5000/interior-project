"""Choose Instagram framing without cropping construction details."""
from __future__ import annotations

import numpy as np


def optimize(image: np.ndarray, profile: dict) -> tuple[np.ndarray, dict]:
    """Keep the full frame and select a compatible padded output variant."""
    height, width = image.shape[:2]
    aspect = width / max(height, 1)
    framing = profile.get("instagram_crop") or {}
    primary = framing.get("primary_variant", "portrait")
    crop_profile = {
        **framing,
        "strategy": "fit_full_frame",
        "primary_variant": primary,
        "source_aspect_ratio": round(aspect, 5),
        "source_dimensions": [width, height],
        "preserve_all_pixels": True,
    }
    profile["instagram_crop"] = crop_profile
    return image, crop_profile
