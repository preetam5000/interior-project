"""Selective, bounded enhancement for existing brown wood pixels."""
from __future__ import annotations

import cv2
import numpy as np


def enhance(image: np.ndarray, profile: dict | None = None) -> np.ndarray:
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    wood = cv2.inRange(hue, 3, 28)
    wood = cv2.bitwise_and(wood, cv2.inRange(saturation, 28, 190))
    wood = cv2.bitwise_and(wood, cv2.inRange(value, 28, 235))
    mask = (
        cv2.GaussianBlur(wood, (0, 0), 1.2)
        .astype(np.float32)[:, :, None]
        / 255
    )
    amount = float((profile or {}).get("wood_enhancement", 0.5))
    richer_saturation = np.minimum(
        saturation.astype(np.float32) * (1 + 0.18 * amount),
        155,
    )
    richer_value = np.minimum(
        value.astype(np.float32) * (1 + 0.05 * amount),
        255,
    )
    hsv[:, :, 1] = np.clip(
        saturation * (1 - mask[:, :, 0])
        + richer_saturation * mask[:, :, 0],
        0,
        255,
    ).astype(np.uint8)
    hsv[:, :, 2] = np.clip(
        value * (1 - mask[:, :, 0]) + richer_value * mask[:, :, 0],
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
