"""Low-strength local contrast on luminance only."""
from __future__ import annotations

import cv2
import numpy as np

from services.quality_analyzer import QualityMetrics


def enhance(
    image: np.ndarray,
    quality: QualityMetrics,
    profile: dict | None = None,
) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    clip_limit = float(
        np.clip(1.35 + (38 - quality.contrast) / 100, 1.15, 1.7)
    )
    local = cv2.createCLAHE(
        clipLimit=clip_limit,
        tileGridSize=(8, 8),
    ).apply(luminance)
    amount = (
        float(profile.get("local_contrast", 0))
        if profile is not None
        else float(np.clip((48 - quality.contrast) / 140, 0.0, 0.34))
    )
    amount *= float((profile or {}).get("contrast_correction", 1))
    lab[:, :, 0] = cv2.addWeighted(luminance, 1 - amount, local, amount, 0)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
