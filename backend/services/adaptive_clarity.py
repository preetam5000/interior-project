"""Adaptive, edge-limited micro-contrast enhancement."""
from __future__ import annotations

import cv2
import numpy as np


def enhance(image: np.ndarray, profile: dict) -> np.ndarray:
    amount = float(profile.get("clarity", 0))
    if amount <= 0:
        return image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    base = cv2.GaussianBlur(luminance, (0, 0), 2.0)
    detail = luminance.astype(np.float32) - base.astype(np.float32)
    edge_mask = np.clip(np.abs(detail) / 20, 0, 1)
    correction = detail * edge_mask * amount * 0.16
    lab[:, :, 0] = np.clip(
        luminance.astype(np.float32) + correction,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
