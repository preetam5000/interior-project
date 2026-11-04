"""Lift deep shadows with a gentle, depth-preserving luminance curve."""
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
    luminance = lab[:, :, 0].astype(np.float32) / 255
    # Extend the mask into dark midtones so dark cabinet interiors and
    # recessed shelves recover detail even when bright walls keep the global
    # exposure score looking acceptable.
    darkness = np.clip((0.55 - luminance) / 0.55, 0, 1)
    strength = (
        float(profile.get("shadow_lift", 0))
        if profile is not None
        else (1.0 if quality.exposure == "underexposed" else 0.55)
    )
    lift = darkness**1.5 * 32 * strength
    corrected = luminance * 255 + lift
    lab[:, :, 0] = np.clip(corrected, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
