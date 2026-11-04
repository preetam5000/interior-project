"""Restrained neutral-pixel white balancing."""
from __future__ import annotations

import cv2
import numpy as np


def correct(image: np.ndarray, profile: dict | None = None) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    neutral = (
        (hsv[:, :, 1] < 35)
        & (hsv[:, :, 2] > 70)
        & (hsv[:, :, 2] < 240)
    )
    minimum_neutral_pixels = max(
        64,
        image.shape[0] * image.shape[1] // 500,
    )
    if np.count_nonzero(neutral) < minimum_neutral_pixels:
        return image

    means = np.median(image[neutral].astype(np.float32), axis=0)
    target = float(np.mean(means))
    strength = (
        float(profile.get("white_balance_strength", 0))
        if profile is not None
        else 0.5
    )
    gains = np.clip(target / np.maximum(means, 1), 0.94, 1.06)
    gains = 1 + (gains - 1) * strength
    balanced = np.clip(
        image.astype(np.float32) * gains,
        0,
        255,
    ).astype(np.uint8)
    return balanced
