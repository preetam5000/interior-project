"""Subtle micro-texture enhancement without global edge sharpening."""
from __future__ import annotations

import cv2
import numpy as np

from services.quality_analyzer import QualityMetrics


def enhance(
    image: np.ndarray,
    quality: QualityMetrics,
    profile: dict | None = None,
) -> np.ndarray:
    if quality.blur_score > 96 or quality.noise > 20:
        return image
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    height, width = image.shape[:2]
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)

    # Brown wood grain and textured lower-frame flooring are enhanced; bright,
    # low-saturation painted walls are explicitly held smooth.
    wood = cv2.inRange(hue, 3, 32)
    wood = cv2.bitwise_and(wood, cv2.inRange(saturation, 20, 210))
    wood = cv2.bitwise_and(wood, cv2.inRange(value, 22, 245)).astype(np.float32) / 255
    gradient_x = cv2.Sobel(luminance, cv2.CV_32F, 1, 0, ksize=3)
    gradient_y = cv2.Sobel(luminance, cv2.CV_32F, 0, 1, ksize=3)
    edge_energy = cv2.magnitude(gradient_x, gradient_y)
    edge_energy = np.clip(edge_energy / 48, 0, 1)
    lower_frame = np.clip((np.linspace(0, 1, height, dtype=np.float32)[:, None] - 0.56) / 0.44, 0, 1)
    floor_texture = lower_frame * np.maximum(edge_energy, saturation.astype(np.float32) / 255 * 0.35)
    region = np.maximum(wood, floor_texture)

    detected_region = (profile or {}).get("_stage_mask")
    if isinstance(detected_region, np.ndarray) and detected_region.shape == (height, width):
        region = np.maximum(region, np.clip(detected_region.astype(np.float32), 0, 1))
    painted_wall = (saturation < 38) & (value > 112)
    region[painted_wall] *= 0.12
    region = cv2.GaussianBlur(region.astype(np.float32), (0, 0), 1.1)

    base = cv2.GaussianBlur(luminance, (0, 0), 1.2)
    detail = luminance.astype(np.float32) - base.astype(np.float32)
    amount = float((profile or {}).get("texture", np.clip((30 - quality.contrast) / 150, 0, 0.18)))
    amount *= float(np.clip(1 - quality.noise / 26, 0.2, 1.0))
    lab[:, :, 0] = np.clip(
        luminance.astype(np.float32) + detail * region * amount * 0.42,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
