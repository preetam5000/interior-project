"""Image quality measurements used to adapt the photographic pipeline."""
from __future__ import annotations

from dataclasses import asdict, dataclass

import cv2
import numpy as np


@dataclass(frozen=True)
class QualityMetrics:
    brightness: float
    contrast: float
    blur_score: float
    noise: float
    exposure: str
    dynamic_range: float
    sharpness: float
    saturation: float
    color_temperature: float
    white_balance_shift: dict[str, float]
    edge_density: float
    highlight_clipping: float
    shadow_clipping: float
    shadow_percentage: float
    wood_coverage: float
    outdoor_cues: float
    white_wall_coverage: float
    window_coverage: float
    histogram: list[float]
    wall_area: float
    wood_area: float
    floor_area: float
    ceiling_area: float
    luxury_score: float
    construction_score: float
    completed_interior_score: float
    room_type: str
    camera_angle: dict[str, float | str]
    vertical_line_count: int
    perspective_distortion: float
    lens_distortion_estimate: float
    width: int
    height: int
    quality_score: float
    quality_grade: str
    score_breakdown: dict[str, dict[str, float | str]]
    recommended_actions: list[str]

    def as_dict(self) -> dict:
        return asdict(self)


def _color_temperature(rgb_mean: np.ndarray) -> float:
    """Estimate correlated color temperature from sampled average RGB."""
    red, green, blue = np.maximum(rgb_mean / 255, 1e-6)
    x = 0.4124 * red + 0.3576 * green + 0.1805 * blue
    y = 0.2126 * red + 0.7152 * green + 0.0722 * blue
    z = 0.0193 * red + 0.1192 * green + 0.9505 * blue
    total = x + y + z
    chromaticity_x, chromaticity_y = x / total, y / total
    denominator = 0.1858 - chromaticity_y
    if abs(denominator) < 1e-6:
        return 5500.0
    n = (chromaticity_x - 0.3320) / denominator
    temperature = -449 * n**3 + 3525 * n**2 - 6823.3 * n + 5520.33
    return float(np.clip(temperature, 2000, 12000))


def _score_detail(score: float, reason: str) -> dict[str, float | str]:
    return {"score": round(float(np.clip(score, 0, 100)), 1), "reason": reason}


def _professional_quality(
    *,
    brightness: float,
    contrast: float,
    sharpness: float,
    noise: float,
    dynamic_range: float,
    saturation: float,
    highlight_clipping: float,
    shadow_clipping: float,
    edge_density: float,
    perspective_distortion: float,
    roll_degrees: float,
    white_balance_shift: np.ndarray,
) -> tuple[float, str, dict[str, dict[str, float | str]], list[str]]:
    """Legacy scorer retained for reference; active scoring is defined below."""
    wb_error = float(np.max(np.abs(white_balance_shift - 1)))
    exposure_score = 100 - abs(brightness - 50) * 2
    exposure_score -= highlight_clipping * 1.5 + shadow_clipping * 1.5
    contrast_score = 100 - max(0, 28 - contrast) * 1.8
    contrast_score -= max(0, contrast - 72) * 1.5
    dynamic_score = min(100, dynamic_range * 1.35)
    noise_score = 100 - min(100, noise * 5)
    perspective_score = 100 - abs(roll_degrees) * 7
    perspective_score -= perspective_distortion * 0.7
    white_balance_score = 100 - wb_error * 500
    color_score = 100 - abs(saturation - 28) * 1.25 - wb_error * 180
    texture_score = 100 - abs(edge_density - 9) * 3 - min(noise * 2, 25)
    lighting_score = (
        100
        - abs(brightness - 52) * 1.25
        - highlight_clipping * 1.8
        - shadow_clipping * 1.2
    )
    composition_score = (
        100
        - abs(edge_density - 9) * 2.5
        - perspective_distortion * 0.55
        - abs(roll_degrees) * 4
    )
    visibility_score = (
        min(100, edge_density * 8)
        - highlight_clipping * 1.2
        - shadow_clipping * 1.2
    )

    scores = {
        "sharpness": _score_detail(
            sharpness,
            f"Measured edge sharpness is {sharpness:.1f}/100 "
            "using Laplacian detail.",
        ),
        "exposure": _score_detail(
            exposure_score,
            f"Mean brightness is {brightness:.1f}/100; highlight clipping is "
            f"{highlight_clipping:.2f}% and shadow clipping is "
            f"{shadow_clipping:.2f}%.",
        ),
        "composition": _score_detail(
            composition_score,
            f"Edge density is {edge_density:.1f}% and estimated perspective "
            f"distortion is {perspective_distortion:.1f}/100; "
            "composition is estimated from image structure, not semantic "
            "subject placement.",
        ),
        "contrast": _score_detail(
            contrast_score,
            f"Normalized luminance contrast is {contrast:.1f}/100.",
        ),
        "dynamic_range": _score_detail(
            dynamic_score,
            f"The 1st-to-99th percentile luminance range spans "
            f"{dynamic_range:.1f}% of the available tonal range.",
        ),
        "noise": _score_detail(
            noise_score,
            f"Estimated flat-region noise level is {noise:.1f} "
            "intensity levels.",
        ),
        "perspective": _score_detail(
            perspective_score,
            f"Detected camera roll is {roll_degrees:.2f} degrees with "
            f"perspective distortion {perspective_distortion:.1f}/100; "
            "line-based estimates may be uncertain when few vertical "
            "lines exist.",
        ),
        "white_balance": _score_detail(
            white_balance_score,
            f"Estimated maximum channel correction from neutral is "
            f"{wb_error * 100:.1f}%.",
        ),
        "color_accuracy": _score_detail(
            color_score,
            f"Mean saturation is {saturation:.1f}/100 with estimated neutral "
            f"channel imbalance {wb_error * 100:.1f}%; "
            "no reference color chart "
            "is available.",
        ),
        "texture": _score_detail(
            texture_score,
            f"Edge density is {edge_density:.1f}% and estimated noise is "
            f"{noise:.1f}; fine texture is inferred "
            "from image detail.",
        ),
        "lighting": _score_detail(
            lighting_score,
            f"Brightness is {brightness:.1f}/100 with "
            f"{highlight_clipping:.2f}% highlight and "
            f"{shadow_clipping:.2f}% shadow clipping.",
        ),
        "subject_visibility": _score_detail(
            visibility_score,
            f"Visible edge density is {edge_density:.1f}%; clipping affects "
            f"{highlight_clipping + shadow_clipping:.2f}% of pixels. "
            "This is a "
            "general visibility proxy, not object detection.",
        ),
    }
    weights = {
        "sharpness": 1.1,
        "exposure": 1.2,
        "composition": 1.0,
        "contrast": 0.9,
        "dynamic_range": 0.9,
        "noise": 0.8,
        "perspective": 0.9,
        "white_balance": 0.8,
        "color_accuracy": 0.8,
        "texture": 0.8,
        "lighting": 1.1,
        "subject_visibility": 0.9,
    }
    quality_score = sum(
        float(scores[name]["score"]) * weight
        for name, weight in weights.items()
    ) / sum(weights.values())
    grade = (
        "A" if quality_score >= 85
        else "B" if quality_score >= 70
        else "C" if quality_score >= 55
        else "D"
    )
    action_by_score = {
        "sharpness": (
            "Use a stable capture and focus on key architectural details."
        ),
        "exposure": (
            "Adjust exposure to reduce clipping and keep midtones readable."
        ),
        "composition": (
            "Refine framing and alignment while keeping important details "
            "in frame."
        ),
        "contrast": (
            "Improve tonal separation without crushing shadows or "
            "clipping highlights."
        ),
        "dynamic_range": (
            "Balance bright and dark regions while preserving natural "
            "tonal depth."
        ),
        "noise": (
            "Use better light or a lower camera ISO to reduce image noise."
        ),
        "perspective": (
            "Level the camera and correct converging vertical lines."
        ),
        "white_balance": (
            "Neutralize the color cast while preserving natural "
            "material colors."
        ),
        "color_accuracy": (
            "Check white balance and keep saturation natural."
        ),
        "texture": (
            "Improve focus and lighting to reveal material texture "
            "without oversharpening."
        ),
        "lighting": (
            "Use more even light and protect highlights and shadows."
        ),
        "subject_visibility": (
            "Improve subject illumination and avoid blocking important "
            "details."
        ),
    }
    recommendations = [
        action_by_score[name]
        for name, detail in scores.items()
        if float(detail["score"]) < 70
    ]
    if not recommendations:
        recommendations.append(
            "Quality is strong across measured categories; "
            "preserve the natural scene."
        )
    return (
        round(quality_score, 1),
        grade,
        scores,
        recommendations,
    )


def _adaptive_quality_scores(
    *,
    brightness: float,
    contrast: float,
    sharpness: float,
    noise: float,
    dynamic_range: float,
    saturation: float,
    highlight_clipping: float,
    shadow_clipping: float,
    edge_density: float,
    perspective_distortion: float,
    roll_degrees: float,
    white_balance_shift: np.ndarray,
    lighting_variation: float,
) -> tuple[float, str, dict[str, dict[str, float | str]], list[str]]:
    """Build deterministic 0–100 scores from OpenCV image measurements."""
    wb_error = float(np.max(np.abs(white_balance_shift - 1)))
    exposure_score = 100 - abs(brightness - 50) * 2
    exposure_score -= highlight_clipping * 1.5 + shadow_clipping * 1.5
    contrast_score = 100 - max(0, 28 - contrast) * 1.8
    contrast_score -= max(0, contrast - 72) * 1.5
    dynamic_score = min(100, dynamic_range * 1.35)
    noise_score = 100 - min(100, noise * 5)
    perspective_score = 100 - abs(roll_degrees) * 7
    perspective_score -= perspective_distortion * 0.7
    white_balance_score = 100 - wb_error * 500
    color_score = 100 - abs(saturation - 28) * 1.25 - wb_error * 180
    texture_score = 100 - abs(edge_density - 9) * 3 - min(noise * 2, 25)
    lighting_score = (
        100
        - abs(brightness - 52) * 1.25
        - highlight_clipping * 1.8
        - shadow_clipping * 1.2
    )
    composition_score = (
        100
        - abs(edge_density - 9) * 2.5
        - perspective_distortion * 0.55
        - abs(roll_degrees) * 4
    )
    visibility_score = (
        min(100, edge_density * 8)
        - highlight_clipping * 1.2
        - shadow_clipping * 1.2
    )
    scores = {
        "sharpness": _score_detail(
            sharpness,
            f"Measured edge sharpness is {sharpness:.1f}/100 using Laplacian detail.",
        ),
        "exposure": _score_detail(
            exposure_score,
            f"Mean brightness is {brightness:.1f}/100; highlight clipping is {highlight_clipping:.2f}% and shadow clipping is {shadow_clipping:.2f}%.",
        ),
        "composition": _score_detail(
            composition_score,
            f"Edge density is {edge_density:.1f}% and estimated perspective distortion is {perspective_distortion:.1f}/100; composition is estimated from image structure, not semantic subject placement.",
        ),
        "contrast": _score_detail(
            contrast_score,
            f"Normalized luminance contrast is {contrast:.1f}/100.",
        ),
        "dynamic_range": _score_detail(
            dynamic_score,
            f"The 1st-to-99th percentile luminance range spans {dynamic_range:.1f}% of the available tonal range.",
        ),
        "noise": _score_detail(
            noise_score,
            f"Estimated flat-region noise level is {noise:.1f} intensity levels.",
        ),
        "perspective": _score_detail(
            perspective_score,
            f"Detected camera roll is {roll_degrees:.2f} degrees with perspective distortion {perspective_distortion:.1f}/100; line-based estimates may be uncertain when few vertical lines exist.",
        ),
        "white_balance": _score_detail(
            white_balance_score,
            f"Estimated maximum channel correction from neutral is {wb_error * 100:.1f}%.",
        ),
        "color_accuracy": _score_detail(
            color_score,
            f"Mean saturation is {saturation:.1f}/100 with estimated neutral channel imbalance {wb_error * 100:.1f}%; no reference color chart is available.",
        ),
        "texture": _score_detail(
            texture_score,
            f"Edge density is {edge_density:.1f}% and estimated noise is {noise:.1f}; fine texture is inferred from image detail.",
        ),
        "lighting": _score_detail(
            lighting_score,
            f"Brightness is {brightness:.1f}/100 with {highlight_clipping:.2f}% highlight and {shadow_clipping:.2f}% shadow clipping.",
        ),
        "subject_visibility": _score_detail(
            visibility_score,
            f"Visible edge density is {edge_density:.1f}%; clipping affects {highlight_clipping + shadow_clipping:.2f}% of pixels. This is a general visibility proxy, not object detection.",
        ),
    }
    weights = {
        "sharpness": 1.1,
        "exposure": 1.2,
        "composition": 1.0,
        "contrast": 0.9,
        "dynamic_range": 0.9,
        "noise": 0.8,
        "perspective": 0.9,
        "white_balance": 0.8,
        "color_accuracy": 0.8,
        "texture": 0.8,
        "lighting": 1.1,
        "subject_visibility": 0.9,
    }
    overall = sum(float(scores[name]["score"]) * weight for name, weight in weights.items()) / sum(weights.values())
    grade = (
        "A" if overall >= 85 else
        "B" if overall >= 70 else
        "C" if overall >= 55 else "D"
    )
    actions = {
        "sharpness": "Use a stable capture and focus on key architectural details.",
        "exposure": "Adjust exposure to reduce clipping and keep midtones readable.",
        "composition": "Refine framing and alignment while keeping important details in frame.",
        "contrast": "Improve tonal separation without crushing shadows or clipping highlights.",
        "dynamic_range": "Balance bright and dark regions while preserving natural tonal depth.",
        "noise": "Reduce noise with better lighting or a lower ISO.",
        "perspective": "Level the camera and correct converging vertical lines.",
        "white_balance": "Correct the color cast while preserving material colors.",
        "color_accuracy": "Keep colors natural and accurate for materials and finishes.",
        "texture": "Reveal material texture without oversharpening the image.",
        "lighting": "Balance the scene lighting while protecting realistic highlight and shadow detail.",
        "subject_visibility": "Improve the visibility of key architectural details and edges.",
    }
    recommendations = [actions[name] for name, detail in scores.items() if float(detail["score"]) < 70]
    if not recommendations:
        recommendations.append("Quality is strong across measured categories; preserve the natural scene.")
    return round(float(np.clip(overall, 0, 100)), 1), grade, scores, recommendations


def analyze(image: np.ndarray) -> QualityMetrics:
    """Measure a BGR image at reduced resolution for fast batch processing."""
    if image.ndim != 3 or image.shape[2] != 3 or image.dtype != np.uint8:
        raise ValueError("Quality analysis requires a uint8 BGR image")

    height, width = image.shape[:2]
    scale = min(1.0, 640 / max(height, width))
    sample = (
        cv2.resize(
            image,
            None,
            fx=scale,
            fy=scale,
            interpolation=cv2.INTER_AREA,
        )
        if scale < 1
        else image
    )
    gray = cv2.cvtColor(sample, cv2.COLOR_BGR2GRAY)
    brightness = float(np.mean(gray) / 255 * 100)
    contrast = float(np.std(gray) / 128 * 100)
    laplacian_variance = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness = float(min(100, laplacian_variance**0.5 * 2.2))
    blur_score = 100 - sharpness
    residual = (
        gray.astype(np.float32) - cv2.medianBlur(gray, 3).astype(np.float32)
    )
    gradients = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3) ** 2
    gradients += cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3) ** 2
    flat_regions = gradients < 24**2
    sample_residual = (
        np.abs(residual[flat_regions])
        if np.any(flat_regions)
        else np.abs(residual)
    )
    noise = float(np.median(sample_residual) / 0.6745)
    low, high = np.percentile(gray, (1, 99))
    dynamic_range = float((high - low) / 255 * 100)
    clipped_shadows = float(np.mean(gray <= 5))
    clipped_highlights = float(
        np.mean(gray >= 250)
    )
    tile_means = [
        float(np.mean(tile) / 255 * 100)
        for row in np.array_split(gray, 4, axis=0)
        for tile in np.array_split(row, 4, axis=1)
        if tile.size
    ]
    lighting_variation = float(np.std(tile_means)) if tile_means else 0.0
    hsv = cv2.cvtColor(sample, cv2.COLOR_BGR2HSV)
    saturation = float(np.mean(hsv[:, :, 1]) / 255 * 100)
    edges = cv2.Canny(gray, 80, 160)
    edge_density = float(np.mean(edges > 0) * 100)
    wood_mask = cv2.inRange(
        hsv,
        np.array([3, 28, 25]),
        np.array([28, 210, 245]),
    )
    wood_coverage = float(np.mean(wood_mask > 0) * 100)
    top = hsv[: max(1, int(hsv.shape[0] * 0.35))]
    sky = (
        (top[:, :, 0] >= 85)
        & (top[:, :, 0] <= 135)
        & (top[:, :, 1] > 45)
        & (top[:, :, 2] > 90)
    )
    vegetation = (
        (hsv[:, :, 0] >= 35)
        & (hsv[:, :, 0] <= 90)
        & (hsv[:, :, 1] > 45)
        & (hsv[:, :, 2] > 35)
    )
    outdoor_cues = float(max(np.mean(sky) * 100, np.mean(vegetation) * 85))
    neutral_material = (hsv[:, :, 1] < 68) & (hsv[:, :, 2] > 58)
    white_walls = (
        (hsv[:, :, 1] < 38)
        & (hsv[:, :, 2] > 150)
        & (gray > np.percentile(gray, 45))
    )
    white_wall_coverage = float(np.mean(white_walls) * 100)
    bright_neutral = (hsv[:, :, 1] < 45) & (hsv[:, :, 2] > 210)
    window_coverage = float(np.mean(bright_neutral) * 100)
    rows, _ = np.indices(gray.shape)
    row_fraction = rows / max(gray.shape[0] - 1, 1)
    wall_region = (row_fraction >= 0.18) & (row_fraction <= 0.82)
    wall_area = float(
        np.mean(neutral_material & wall_region & (row_fraction < 0.78)) * 100
    )
    ceiling_area = float(
        np.mean(neutral_material & (row_fraction < 0.22)) * 100
    )
    wood_area = wood_coverage
    floor_region = row_fraction >= 0.7
    floor_material = (
        floor_region
        & (hsv[:, :, 2] > 25)
        & (hsv[:, :, 2] < 225)
        & ((hsv[:, :, 1] > 18) | (gray < np.percentile(gray, 48)))
    )
    floor_area = float(np.mean(floor_material) * 100)
    lines = cv2.HoughLinesP(
        edges,
        rho=1,
        theta=np.pi / 180,
        threshold=max(16, min(gray.shape) // 12),
        minLineLength=max(16, gray.shape[0] // 10),
        maxLineGap=max(4, gray.shape[0] // 50),
    )
    vertical_segments: list[tuple[float, float]] = []
    if lines is not None:
        for line in lines[:, 0]:
            x1, y1, x2, y2 = (float(value) for value in line)
            dx, dy = x2 - x1, y2 - y1
            if abs(dy) >= gray.shape[0] * 0.08 and abs(dx / dy) <= 0.35:
                vertical_segments.append(((x1 + x2) / 2, dx / dy))
    vertical_slopes = np.array(
        [slope for _, slope in vertical_segments],
        dtype=np.float32,
    )
    roll_degrees = (
        float(np.degrees(np.arctan(np.median(vertical_slopes))))
        if vertical_slopes.size
        else 0.0
    )
    if len(vertical_segments) >= 3:
        xs = np.array([x for x, _ in vertical_segments], dtype=np.float32)
        slope_trend = float(
            np.polyfit(xs - np.mean(xs), vertical_slopes, 1)[0]
        )
        perspective_distortion = min(
            100.0,
            float(abs(slope_trend) * gray.shape[1] * 100),
        )
    else:
        perspective_distortion = 0.0
    room_type = "unknown"
    luxury_score = float(
        np.clip(
            20
            + (saturation / 100) * 20
            + min(edge_density, 20) * 1.5
            + min(wood_area, 30) * 0.7,
            0,
            100,
        )
    )
    construction_score = float(
        np.clip(
            min(edge_density, 25) * 2.1
            + min(noise, 20) * 0.9
            + min(wood_area, 30) * 0.5,
            0,
            100,
        )
    )
    completed_interior_score = float(
        np.clip(
            (white_wall_coverage + wood_area + floor_area) * 0.55
            + (100 - min(noise, 100)) * 0.2
            - min(construction_score, 60) * 0.2,
            0,
            100,
        )
    )
    bgr_means = np.mean(sample, axis=(0, 1))
    rgb_means = bgr_means[::-1]
    neutral = (
        (hsv[:, :, 1] < 35)
        & (hsv[:, :, 2] > 55)
        & (hsv[:, :, 2] < 245)
    )
    neutral_means = (
        np.median(sample[neutral], axis=0)[::-1].astype(np.float32)
        if np.any(neutral)
        else rgb_means.astype(np.float32)
    )
    neutral_target = float(np.mean(neutral_means))
    wb_shift = np.clip(
        neutral_target / np.maximum(neutral_means, 1),
        0.94,
        1.06,
    )
    white_balance_shift = wb_shift.copy()
    histogram = cv2.calcHist([gray], [0], None, [16], [0, 256]).flatten()
    histogram = (
        histogram / max(float(histogram.sum()), 1)
    ).round(5).tolist()
    if brightness < 32 or clipped_shadows > 0.25:
        exposure = "underexposed"
    elif brightness > 78 or clipped_highlights > 0.2:
        exposure = "overexposed"
    else:
        exposure = "balanced"
    quality_score, quality_grade, score_breakdown, recommended_actions = (
        _adaptive_quality_scores(
            brightness=brightness,
            contrast=contrast,
            sharpness=sharpness,
            noise=noise,
            dynamic_range=dynamic_range,
            saturation=saturation,
            highlight_clipping=clipped_highlights * 100,
            shadow_clipping=clipped_shadows * 100,
            edge_density=edge_density,
            perspective_distortion=perspective_distortion,
            roll_degrees=roll_degrees,
            white_balance_shift=white_balance_shift,
            lighting_variation=lighting_variation,
        )
    )
    return QualityMetrics(
        brightness=round(brightness, 2),
        contrast=round(contrast, 2),
        blur_score=round(blur_score, 2),
        noise=round(noise, 2),
        exposure=exposure,
        dynamic_range=round(dynamic_range, 2),
        sharpness=round(sharpness, 2),
        saturation=round(saturation, 2),
        color_temperature=round(_color_temperature(rgb_means), 0),
        white_balance_shift={
            "red": round(float(wb_shift[0]), 4),
            "green": round(float(wb_shift[1]), 4),
            "blue": round(float(wb_shift[2]), 4),
        },
        edge_density=round(edge_density, 2),
        highlight_clipping=round(clipped_highlights * 100, 3),
        shadow_clipping=round(clipped_shadows * 100, 3),
        shadow_percentage=round(float(np.mean(gray < 64) * 100), 2),
        wood_coverage=round(wood_coverage, 2),
        outdoor_cues=round(outdoor_cues, 2),
        white_wall_coverage=round(white_wall_coverage, 2),
        window_coverage=round(window_coverage, 2),
        histogram=histogram,
        wall_area=round(wall_area, 2),
        wood_area=round(wood_area, 2),
        floor_area=round(floor_area, 2),
        ceiling_area=round(ceiling_area, 2),
        luxury_score=round(luxury_score, 2),
        construction_score=round(construction_score, 2),
        completed_interior_score=round(completed_interior_score, 2),
        room_type=room_type,
        camera_angle={
            "roll_degrees": round(roll_degrees, 2),
            "view": (
                "wide"
                if perspective_distortion > 4
                else "straight_or_unknown"
            ),
        },
        vertical_line_count=len(vertical_segments),
        perspective_distortion=round(perspective_distortion, 2),
        # Radial distortion cannot be inferred reliably without calibration
        # metadata or a known straight-line model, so default to no correction.
        lens_distortion_estimate=0.0,
        width=int(width),
        height=int(height),
        quality_score=quality_score,
        quality_grade=quality_grade,
        score_breakdown=score_breakdown,
        recommended_actions=recommended_actions,
    )
