"""Apply radial correction only when calibrated analysis detects distortion."""
from __future__ import annotations

import cv2
import numpy as np


def correct(image: np.ndarray, profile: dict) -> np.ndarray:
    distortion = float(profile.get("lens_distortion", 0))
    if abs(distortion) < 1e-5:
        return image
    height, width = image.shape[:2]
    focal = float(max(width, height))
    camera = np.array(
        [
            [focal, 0, width / 2],
            [0, focal, height / 2],
            [0, 0, 1],
        ],
        dtype=np.float32,
    )
    coefficients = np.array(
        [distortion, distortion * 0.2, 0, 0, 0],
        dtype=np.float32,
    )
    return cv2.undistort(
        image,
        camera,
        coefficients,
        newCameraMatrix=camera,
    )
