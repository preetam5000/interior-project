"""Adaptive micro-contrast enhancement for material details."""
from __future__ import annotations

import cv2
import numpy as np


def enhance(image: np.ndarray, profile: dict) -> np.ndarray:
    amount = float(profile.get("micro_contrast", 0))
    if amount <= 0:
        return image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    base = cv2.bilateralFilter(luminance, d=0, sigmaColor=24, sigmaSpace=2.2)
    detail = luminance.astype(np.float32) - base.astype(np.float32)
    lab[:, :, 0] = np.clip(
        luminance.astype(np.float32) + detail * amount * 0.22,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
