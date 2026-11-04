"""Conservative vertical-line correction that never crops source pixels."""
from __future__ import annotations

import cv2
import numpy as np


def correct(image: np.ndarray, profile: dict | None = None) -> np.ndarray:
    """Correct only very mild vertical convergence when the full frame fits."""
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 1800,
        threshold=max(35, height // 8),
        minLineLength=max(30, height // 5),
        maxLineGap=max(8, height // 40),
    )
    if lines is None:
        return image

    slopes: list[tuple[float, float]] = []
    for line in lines[:, 0]:
        x1, y1, x2, y2 = (float(value) for value in line)
        dy, dx = y2 - y1, x2 - x1
        if abs(dy) < height * 0.2 or abs(dx / dy) > 0.18:
            continue
        midpoint_x = (x1 + x2) / 2
        slope = dx / dy
        slopes.append((midpoint_x, slope))

    if len(slopes) < 3:
        return image
    center = width / 2
    convergence = [
        -slope / (x - center)
        for x, slope in slopes
        if abs(x - center) > width * 0.12
    ]
    if len(convergence) < 2:
        return image

    projective_y = float(np.median(convergence))
    if profile is not None:
        projective_y *= float(profile.get("perspective_correction", 0))
        if abs(projective_y) < 1e-8:
            return image
    if not np.isfinite(projective_y) or abs(projective_y * height) > 0.025:
        return image

    # This transform makes detected vertical lines parallel.
    matrix = np.array(
        [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, projective_y, 1.0]],
        dtype=np.float64,
    )
    corners = np.array(
        [[[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]]],
        dtype=np.float32,
    )
    transformed = cv2.perspectiveTransform(corners, matrix)[0]
    # Refuse corrections that trim corners; exposed edges use replication.
    if (
        not np.isfinite(transformed).all()
        or transformed[:, 0].min() < 0
        or transformed[:, 1].min() < 0
        or transformed[:, 0].max() > width - 1
        or transformed[:, 1].max() > height - 1
    ):
        return image
    return cv2.warpPerspective(
        image, matrix, (width, height),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE,
    )
