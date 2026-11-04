"""Adaptive global exposure correction in perceptual luminance space."""
from __future__ import annotations

import cv2
import numpy as np


def correct(image: np.ndarray, profile: dict) -> np.ndarray:
    ev = float(profile.get("exposure_correction_ev", 0))
    if abs(ev) < 1e-4:
        return image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0].astype(np.float32) / 255
    lab[:, :, 0] = np.clip(
        np.power(np.maximum(luminance, 1e-4), 1 / (2**ev)) * 255,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
