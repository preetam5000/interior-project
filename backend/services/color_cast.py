"""Selective color-cast correction for neutral surfaces."""
from __future__ import annotations

import cv2
import numpy as np


def remove(image: np.ndarray, profile: dict) -> np.ndarray:
    strength = float(profile.get("color_cast_removal", 0))
    shifts = profile.get("white_balance_shift") or {}
    gains = np.array(
        [
            float(shifts.get("blue", 1)),
            float(shifts.get("green", 1)),
            float(shifts.get("red", 1)),
        ],
        dtype=np.float32,
    )
    gains = 1 + (gains - 1) * strength * 0.55
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    neutral = (hsv[:, :, 1] < 42) & (hsv[:, :, 2] > 55)
    mask = cv2.GaussianBlur(neutral.astype(np.float32), (0, 0), 2)[:, :, None]
    corrected = image.astype(np.float32) * gains
    return np.clip(
        image.astype(np.float32) * (1 - mask) + corrected * mask,
        0,
        255,
    ).astype(np.uint8)
