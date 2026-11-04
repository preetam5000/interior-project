"""Tame clipped window glow while retaining the rest of the exposure."""
from __future__ import annotations

import cv2
import numpy as np


def recover(image: np.ndarray, profile: dict) -> np.ndarray:
    strength = float(profile.get("window_glow_recovery", 0))
    if strength <= 0:
        return image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0].astype(np.float32)
    window_mask = np.clip((luminance - 225) / 30, 0, 1)
    window_mask = cv2.GaussianBlur(window_mask, (0, 0), 1.5)
    recovered = (
        luminance
        - np.maximum(luminance - 220, 0) * window_mask * strength * 0.22
    )
    lab[:, :, 0] = np.clip(recovered, 0, 255).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
