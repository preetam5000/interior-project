"""Enhance texture gated by lower-frame floor-material coverage."""
from __future__ import annotations

import cv2
import numpy as np


def enhance(image: np.ndarray, profile: dict) -> np.ndarray:
    amount = float(profile.get("floor_texture", 0))
    if amount <= 0:
        return image
    height, width = image.shape[:2]
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    detail = luminance.astype(np.float32) - cv2.GaussianBlur(
        luminance,
        (0, 0),
        max(1, min(height, width) / 180),
    ).astype(np.float32)
    vertical = np.linspace(0, 1, height, dtype=np.float32)[:, None]
    floor_mask = np.broadcast_to(
        np.clip((vertical - 0.58) / 0.42, 0, 1),
        (height, width),
    )
    lab[:, :, 0] = np.clip(
        luminance.astype(np.float32) + detail * floor_mask * amount * 0.18,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
