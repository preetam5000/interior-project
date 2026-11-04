"""Selective recovery of near-clipped highlights."""
from __future__ import annotations

import cv2
import numpy as np

from services.quality_analyzer import QualityMetrics


def recover(
    image: np.ndarray,
    quality: QualityMetrics,
    profile: dict | None = None,
) -> np.ndarray:
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0].astype(np.float32)
    clipped = np.clip((luminance - 238) / 17, 0, 1)
    mask = cv2.GaussianBlur(clipped, (0, 0), 2.0)
    strength = (
        float(profile.get("highlight_recovery", 0))
        if profile is not None
        else min(0.5, max(0.0, (100 - quality.dynamic_range) / 180))
    )
    recovered = luminance - (luminance - 224) * mask * strength
    lab[:, :, 0] = np.clip(recovered, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
