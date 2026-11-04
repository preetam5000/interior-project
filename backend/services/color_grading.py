"""Subtle warm-daylight grading that retains neutral whites and shadows."""
from __future__ import annotations

import cv2
import numpy as np


def grade(image: np.ndarray, profile: dict | None = None) -> np.ndarray:
    luminance = (
        cv2.cvtColor(image, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    )
    highlights = np.clip((luminance - 0.48) / 0.4, 0, 1)
    highlights *= np.clip((0.98 - luminance) / 0.12, 0, 1)
    shadows = np.clip((0.42 - luminance) / 0.42, 0, 1)
    graded = image.astype(np.float32)
    profile = profile or {}
    warmth = float(profile.get("warmth", 0))
    preset = str(profile.get("preset", "AUTO"))
    preset_strength = {
        "AUTO": 1.0,
        "ARCHITECTURAL": 0.8,
        "LUXURY": 1.12,
        "CONSTRUCTION PROGRESS": 0.68,
        "COMPLETED INTERIOR": 1.05,
        "MINIMAL": 0.65,
        "SCANDINAVIAN": 0.9,
        "MODERN": 0.75,
    }.get(preset, 1.0)
    grade_strength = warmth * preset_strength
    graded[:, :, 2] += highlights * 1.2 * grade_strength
    graded[:, :, 0] -= highlights * 0.35 * grade_strength
    graded[:, :, 0] += shadows * 0.2 * grade_strength
    return np.clip(graded, 0, 255).astype(np.uint8)
