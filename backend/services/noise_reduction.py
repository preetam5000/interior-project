"""Edge-preserving noise reduction, scaled to measured noise."""
from __future__ import annotations

import cv2
import numpy as np

from services.quality_analyzer import QualityMetrics


def reduce(
    image: np.ndarray,
    quality: QualityMetrics,
    profile: dict | None = None,
) -> np.ndarray:
    amount = (
        float(profile.get("noise_reduction", 0))
        if profile is not None
        else float(np.clip(quality.noise / 24, 0, 1))
    )
    if amount <= 0:
        return image
    strength = int(np.clip(quality.noise * amount * 0.38, 1, 9))
    if strength < 2:
        return image
    return cv2.fastNlMeansDenoisingColored(
        image, None, strength, strength, 7, 21
    )
