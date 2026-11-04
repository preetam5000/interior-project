"""Apply a subtle vignette only when the image profile calls for it."""
from __future__ import annotations

import numpy as np


def apply(image: np.ndarray, profile: dict) -> np.ndarray:
    strength = float(profile.get("vignette_strength", 0))
    if strength <= 0:
        return image
    height, width = image.shape[:2]
    x = np.linspace(-1, 1, width, dtype=np.float32)
    y = np.linspace(-1, 1, height, dtype=np.float32)
    xx, yy = np.meshgrid(x, y)
    radial = np.clip((xx * xx + yy * yy - 0.25) / 1.75, 0, 1)
    mask = (1 - radial * strength)[:, :, None]
    return np.clip(image.astype(np.float32) * mask, 0, 255).astype(np.uint8)
