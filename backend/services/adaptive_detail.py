"""Luminance-only detail enhancement with noise-aware OpenCV parameters."""
from __future__ import annotations

import cv2
import numpy as np

from services.quality_analyzer import QualityMetrics


def enhance(image: np.ndarray, quality: QualityMetrics, profile: dict | None = None) -> np.ndarray:
    profile = profile or {}
    noise_gate = float(np.clip(1 - quality.noise / 28, 0.25, 1.0))
    strength = float(np.clip(profile.get("detail_enhancement", profile.get("clarity", 0.2)), 0, 0.45))
    strength *= noise_gate
    if strength <= 0.01:
        return image

    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    luminance = lab[:, :, 0]
    luminance_bgr = cv2.cvtColor(luminance, cv2.COLOR_GRAY2BGR)
    sigma_s = float(np.clip(7 + strength * 14, 7, 13))
    sigma_r = float(np.clip(0.07 + strength * 0.20, 0.07, 0.15))
    detailed = cv2.detailEnhance(luminance_bgr, sigma_s=sigma_s, sigma_r=sigma_r)
    detail_luma = cv2.cvtColor(detailed, cv2.COLOR_BGR2GRAY)
    # Favor existing wood grain, cabinet edges, and floor material. Low-edge,
    # low-saturation painted walls stay smooth when semantic masks are absent.
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    hue, saturation, value = cv2.split(hsv)
    wood = cv2.inRange(hue, 3, 32)
    wood = cv2.bitwise_and(wood, cv2.inRange(saturation, 18, 220))
    wood = cv2.bitwise_and(wood, cv2.inRange(value, 20, 248)).astype(np.float32) / 255
    gx = cv2.Sobel(luminance, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(luminance, cv2.CV_32F, 0, 1, ksize=3)
    edges = np.clip(cv2.magnitude(gx, gy) / 42, 0, 1)
    height = image.shape[0]
    lower = np.clip((np.linspace(0, 1, height, dtype=np.float32)[:, None] - 0.52) / 0.48, 0, 1)
    material = np.maximum(wood, np.maximum(edges * 0.62, lower * edges))
    painted_wall = (saturation < 42) & (value > 112)
    material[painted_wall] *= 0.18
    detected_region = profile.get("_stage_mask")
    if isinstance(detected_region, np.ndarray) and detected_region.shape == luminance.shape:
        material = np.maximum(material, np.clip(detected_region.astype(np.float32), 0, 1))
    material = cv2.GaussianBlur(material.astype(np.float32), (0, 0), 1.0)

    # Blend conservatively in L only to prevent chroma shifts and bright halos.
    blend = float(np.clip(0.22 + strength * 0.52, 0.22, 0.45))
    amount_map = np.clip(material * blend, 0, 0.45)
    lab[:, :, 0] = np.clip(
        luminance.astype(np.float32) * (1 - amount_map)
        + detail_luma.astype(np.float32) * amount_map,
        0,
        255,
    ).astype(np.uint8)
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
