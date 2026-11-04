"""Apply a bounded, analysis-derived color temperature correction."""
from __future__ import annotations

import numpy as np


def correct(image: np.ndarray, profile: dict) -> np.ndarray:
    shift = float(profile.get("color_temperature_correction", 0))
    if abs(shift) < 1e-5:
        return image
    gains = np.array([1 - shift, 1.0, 1 + shift], dtype=np.float32)
    return np.clip(image.astype(np.float32) * gains, 0, 255).astype(np.uint8)
