"""Edge-only sharpening with a threshold to avoid halos on flat walls."""
from __future__ import annotations

import cv2
import numpy as np

from services.quality_analyzer import QualityMetrics


def sharpen(
    image: np.ndarray,
    quality: QualityMetrics,
    profile: dict | None = None,
) -> np.ndarray:
    if quality.noise > 22 or quality.blur_score > 98:
        return image
    amount = (
        float(profile.get("sharpening", 0))
        if profile is not None
        else float(np.clip((quality.blur_score - 18) / 75, 0, 1))
    )
    if amount <= 0:
        return image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    # The bilateral base preserves cabinet, panel and wall-corner boundaries;
    # the edge mask leaves low-detail flat walls and noisy regions alone.
    base = cv2.bilateralFilter(luminance, d=0, sigmaColor=18, sigmaSpace=2.0)
    detail = luminance.astype(np.float32) - base.astype(np.float32)
    edge = np.abs(detail)
    mask = np.clip((edge - 3.5) / 18, 0, 1)
    mask *= float(np.clip(1 - quality.noise / 28, 0.15, 1.0))
    lab[:, :, 0] = np.clip(
        luminance.astype(np.float32) + detail * mask * amount * 0.42,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
