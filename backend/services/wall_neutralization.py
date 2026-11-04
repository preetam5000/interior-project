"""Neutralize wall pixels without tinting other materials."""
from __future__ import annotations

import cv2
import numpy as np


def neutralize(image: np.ndarray, profile: dict) -> np.ndarray:
    strength = float(profile.get("wall_neutralization", 0))
    if strength <= 0:
        return image
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    wall = (
        (hsv[:, :, 1] < 45)
        & (hsv[:, :, 2] > 90)
        & (hsv[:, :, 2] < 245)
    )
    mask = cv2.GaussianBlur(
        wall.astype(np.float32),
        (0, 0),
        max(1, image.shape[0] / 300),
    )[:, :, None]
    neutral = np.repeat(np.mean(image, axis=2, keepdims=True), 3, axis=2)
    weight = mask * strength * 0.22
    return np.clip(
        image.astype(np.float32) * (1 - weight) + neutral * weight,
        0,
        255,
    ).astype(np.uint8)
