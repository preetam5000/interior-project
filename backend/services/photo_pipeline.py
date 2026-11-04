"""Modular, profile-driven architectural photo enhancement pipeline."""
from __future__ import annotations

import logging
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass

import cv2
import numpy as np
from services.runtime_profiling import finish_stage, start_stage

from services import (
    adaptive_detail,
    adaptive_clarity,
    adaptive_exposure,
    adaptive_vignette,
    color_grading,
    color_temperature,
    floor_texture,
    highlight_recovery,
    instagram_crop,
    lens_distortion,
    local_contrast,
    micro_contrast,
    noise_reduction,
    perspective,
    shadow_recovery,
    smart_sharpen,
    texture,
    wall_neutralization,
    white_balance,
    window_glow,
    wood_tone,
)
from services.quality_analyzer import QualityMetrics

log = logging.getLogger("pipeline")
PIXEL_CHANGE_THRESHOLD = 0.05

StageOperation = Callable[
    [np.ndarray, Mapping[str, object]],
    np.ndarray | tuple[np.ndarray, dict],
]


@dataclass(frozen=True)
class PhotoStage:
    """A named image transform that always receives the adaptive profile."""

    name: str
    operation: StageOperation
    strength_keys: tuple[str, ...]
    mask_classes: tuple[str, ...] = ()
    global_transform: bool = False


def _signature(image: np.ndarray) -> dict[str, float | list[int]]:
    height, width = image.shape[:2]
    scale = min(1.0, 320 / max(height, width))
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
    return {
        "dimensions": [int(width), int(height)],
        "brightness": round(float(np.mean(gray)), 2),
        "contrast": round(float(np.std(gray)), 2),
        "clipped_highlights_pct": round(
            float(np.mean(gray >= 250) * 100),
            3,
        ),
        "clipped_shadows_pct": round(
            float(np.mean(gray <= 5) * 100),
            3,
        ),
    }


def _build_stages(quality: QualityMetrics) -> tuple[PhotoStage, ...]:
    """Build operations with quality captured and profile passed per stage."""

    def using_quality(function: Callable) -> StageOperation:
        def operation(
            image: np.ndarray,
            profile: Mapping[str, object],
        ) -> np.ndarray:
            return function(image, quality, dict(profile))

        return operation

    def temperature(
        image: np.ndarray,
        profile: Mapping[str, object],
    ) -> np.ndarray:
        adjusted = color_temperature.correct(image, profile)
        return color_grading.grade(adjusted, profile)

    def clarity(
        image: np.ndarray,
        profile: Mapping[str, object],
    ) -> np.ndarray:
        adjusted = adaptive_clarity.enhance(image, profile)
        return local_contrast.enhance(adjusted, quality, profile)

    return (
        PhotoStage(
            "perspective",
            lambda image, profile: perspective.correct(image, dict(profile)),
            ("perspective_correction",),
            global_transform=True,
        ),
        PhotoStage(
            "lens_distortion",
            lambda image, profile: lens_distortion.correct(
                image,
                dict(profile),
            ),
            ("lens_distortion",),
            global_transform=True,
        ),
        PhotoStage(
            "highlight_recovery",
            using_quality(highlight_recovery.recover),
            ("highlight_recovery",),
            ("windows", "glass", "ceiling", "walls"),
        ),
        PhotoStage(
            "shadow_recovery",
            using_quality(shadow_recovery.recover),
            ("shadow_lift",),
            ("walls", "wood", "floor", "ceiling", "furniture"),
        ),
        PhotoStage(
            "adaptive_exposure",
            lambda image, profile: adaptive_exposure.correct(
                image,
                dict(profile),
            ),
            ("exposure", "exposure_correction_ev"),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "white_balance",
            lambda image, profile: white_balance.correct(
                image,
                dict(profile),
            ),
            ("white_balance", "white_balance_strength"),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "color_temperature",
            temperature,
            ("warmth", "color_temperature_correction"),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "wall_neutralization",
            lambda image, profile: wall_neutralization.neutralize(
                image,
                dict(profile),
            ),
            ("wall_neutralization",),
            ("walls",),
        ),
        PhotoStage(
            "wood_tone",
            lambda image, profile: wood_tone.enhance(image, dict(profile)),
            ("wood_enhancement",),
            ("wood",),
        ),
        PhotoStage(
            "floor_texture",
            lambda image, profile: floor_texture.enhance(
                image,
                dict(profile),
            ),
            ("floor_texture",),
            ("floor",),
        ),
        PhotoStage(
            "texture",
            using_quality(texture.enhance),
            ("texture",),
            ("wood", "floor", "construction_materials", "furniture"),
        ),
        PhotoStage(
            "local_contrast",
            clarity,
            ("clarity", "local_contrast"),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "micro_contrast",
            lambda image, profile: micro_contrast.enhance(
                image,
                dict(profile),
            ),
            ("micro_contrast",),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "selective_sharpening",
            using_quality(smart_sharpen.sharpen),
            ("sharpening",),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "noise_reduction",
            using_quality(noise_reduction.reduce),
            ("noise_reduction",),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "window_glow",
            lambda image, profile: window_glow.recover(
                image,
                dict(profile),
            ),
            ("window_recovery", "window_glow_recovery"),
            ("windows", "glass"),
        ),
        PhotoStage(
            "vignette",
            lambda image, profile: adaptive_vignette.apply(
                image,
                dict(profile),
            ),
            ("vignette_strength",),
            tuple(SEGMENTATION_CLASSES),
        ),
        PhotoStage(
            "instagram_crop",
            lambda image, profile: instagram_crop.optimize(
                image,
                dict(profile),
            ),
            ("instagram_crop",),
        ),
    )


SEGMENTATION_CLASSES = (
    "walls",
    "wood",
    "windows",
    "glass",
    "floor",
    "ceiling",
    "furniture",
    "construction_materials",
)


def _validate_stages(stages: Sequence[PhotoStage]) -> None:
    names = [stage.name for stage in stages]
    if any(not name.strip() for name in names):
        raise ValueError("Stage names must not be empty")
    if len(names) != len(set(names)):
        raise ValueError("Photo pipeline stage names must be unique")


def _region_mask(
    masks: Mapping[str, np.ndarray],
    categories: Sequence[str],
    shape: tuple[int, int],
) -> np.ndarray:
    combined = np.zeros(shape, dtype=np.float32)
    for category in categories:
        mask = masks.get(category)
        if mask is None:
            continue
        if (
            not isinstance(mask, np.ndarray)
            or mask.shape != shape
            or not (
                np.issubdtype(mask.dtype, np.number)
                or np.issubdtype(mask.dtype, np.bool_)
            )
            or not np.isfinite(mask).all()
        ):
            raise ValueError(
                f"Segmentation mask {category!r} must be a finite "
                f"numeric array with shape {shape}"
            )
        combined = np.maximum(
            combined,
            np.clip(mask.astype(np.float32), 0, 1),
        )
    if np.any(combined):
        height, width = shape
        sigma = max(0.5, min(height, width) / 500)
        combined = cv2.GaussianBlur(combined, (0, 0), sigma)
    return np.clip(combined, 0, 1)


def _validate_masks(
    masks: Mapping[str, np.ndarray],
    shape: tuple[int, int],
) -> None:
    for category, mask in masks.items():
        if (
            not isinstance(mask, np.ndarray)
            or mask.shape != shape
            or not (
                np.issubdtype(mask.dtype, np.number)
                or np.issubdtype(mask.dtype, np.bool_)
            )
            or not np.isfinite(mask).all()
        ):
            raise ValueError(
                f"Segmentation mask {category!r} must be a finite "
                f"numeric array with shape {shape}"
            )


def _blend_mask(
    original: np.ndarray,
    enhanced: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    alpha = mask[:, :, None]
    return np.clip(
        original.astype(np.float32) * (1 - alpha)
        + enhanced.astype(np.float32) * alpha,
        0,
        255,
    ).astype(np.uint8)


def run_pipeline(
    image: np.ndarray,
    profile: dict,
    quality: QualityMetrics,
    *,
    enabled_stages: Mapping[str, bool] | None = None,
    stages: Sequence[PhotoStage] | None = None,
    masks: Mapping[str, np.ndarray] | None = None,
    stage_observer: Callable[[str, np.ndarray, dict], None] | None = None,
) -> tuple[np.ndarray, list[dict]]:
    """Run enabled stages in order and log measurements, time, and strength.

    The image must be a uint8 OpenCV BGR array. Supply a custom stage sequence
    to replace or extend the defaults; each operation receives ``(image,
    profile)``. A stage can be disabled by setting its name to ``False`` in
    ``enabled_stages``. Region effects are blended only through their class
    masks. When segmentation is unavailable, image operators use their own
    bounded pixel-level guards as a full-frame fallback. Geometry operations
    remain conservative and keep the source canvas dimensions.
    """
    if image.ndim != 3 or image.shape[2] != 3 or image.dtype != np.uint8:
        raise ValueError("Photo pipeline requires a uint8 BGR image")
    plan = tuple(stages) if stages is not None else _build_stages(quality)
    _validate_stages(plan)
    stage_switches = enabled_stages or {}
    unknown = set(stage_switches) - {stage.name for stage in plan}
    if unknown:
        raise ValueError(
            "Unknown photo pipeline stage(s): "
            + ", ".join(sorted(unknown))
        )

    if masks is not None:
        _validate_masks(masks, image.shape[:2])
    source_image = image.copy()
    result = image.copy()
    diagnostics: list[dict] = []
    for stage_index, stage in enumerate(plan, start=1):
        requested = stage_switches.get(stage.name, True)
        enabled = requested
        before = _signature(result)
        strength = {
            key: profile.get(key)
            for key in stage.strength_keys
        }
        mask_fallback = False
        started = start_stage()
        try:
            mask = None
            skip_reason = None
            if enabled and (stage.mask_classes or stage.global_transform):
                if masks is None:
                    if stage.mask_classes:
                        skip_reason = "AI segmentation masks are unavailable"
                else:
                    mask = (
                        _region_mask(
                            masks,
                            stage.mask_classes,
                            result.shape[:2],
                        )
                        if stage.mask_classes
                        else np.clip(
                            np.maximum.reduce(
                                [
                                    np.asarray(mask_values, dtype=np.float32)
                                    for mask_values in masks.values()
                                ]
                            )
                            if masks
                            else np.zeros(result.shape[:2], dtype=np.float32),
                            0,
                            1,
                        )
                    )
                    if not np.any(mask):
                        skip_reason = "No detected target-region pixels"
            should_run = enabled and skip_reason is None
            input_image = result
            input_pixels = input_image.copy()
            operation_profile = profile
            if mask is not None:
                operation_profile = {**profile, "_stage_mask": mask}
            output = (
                stage.operation(input_image, operation_profile)
                if should_run
                else input_image
            )
            stage_result = None
            if isinstance(output, tuple):
                output, stage_result = output
                profile[stage.name] = stage_result
            if (
                not isinstance(output, np.ndarray)
                or output.dtype != np.uint8
                or output.ndim != 3
                or output.shape[2] != 3
            ):
                raise ValueError(
                    f"Stage {stage.name!r} must return a uint8 BGR image"
                )
            if mask is not None:
                output = _blend_mask(input_pixels, output, mask)
            mean_pixel_difference = float(np.mean(cv2.absdiff(input_pixels, output)))
            changed_pixel_pct = float(np.mean(np.any(input_pixels != output, axis=2)) * 100)
            timing = finish_stage(
                stage.name,
                started,
                status="success",
                engine="opencv",
                skipped=not should_run,
            )
            after = _signature(output)
            entry = {
                "stage": stage.name,
                "enabled": should_run,
                "requested": bool(requested),
                "executed": bool(should_run),
                "status": "success",
                "input": before,
                "output": after,
                "execution_time_ms": timing["duration_ms"],
                "timing": timing,
                "strength_applied": strength,
                "mean_pixel_difference": round(mean_pixel_difference, 6),
                "changed_pixel_pct": round(changed_pixel_pct, 4),
                "input_source": "pipeline_input" if stage_index == 1 else "previous_stage_output",
                "stage_input_is_previous_output": stage_index > 1,
            }
            if mask is not None:
                entry["mask_classes"] = list(stage.mask_classes)
                entry["mask_coverage_pct"] = round(
                    float(np.mean(mask > 0.5) * 100),
                    3,
                )
            elif stage.global_transform and should_run:
                entry["mask_scope"] = "full_frame_geometry"
            elif mask_fallback and should_run:
                entry["mask_scope"] = "full_frame_fallback_with_stage_pixel_guards"
                entry["mask_fallback_reason"] = "Segmentation masks unavailable; conservative stage-local pixel thresholds were used"
            if skip_reason:
                entry["skip_reason"] = skip_reason
                entry["no_change_reason"] = skip_reason
            elif not should_run:
                entry["no_change_reason"] = "Stage disabled by processing settings"
            elif changed_pixel_pct < 1.0:
                nonzero_strengths = [
                    value for value in strength.values()
                    if isinstance(value, (int, float)) and abs(float(value)) > 1e-9
                ]
                if not nonzero_strengths:
                    entry["no_change_reason"] = "Stage strengths are zero or unavailable"
                elif stage.name == "perspective":
                    entry["no_change_reason"] = "Perspective detection found too few reliable vertical lines or rejected a warp that would crop the frame"
                elif stage.name == "white_balance":
                    entry["no_change_reason"] = "The image did not contain enough neutral pixels for a reliable white-balance estimate"
                elif stage.name == "highlight_recovery":
                    entry["no_change_reason"] = "Few pixels crossed the highlight recovery luminance threshold"
                elif stage.name == "shadow_recovery":
                    entry["no_change_reason"] = "Few pixels crossed the shadow recovery luminance threshold"
                elif stage.name == "texture" and (quality.blur_score > 96 or quality.noise > 18):
                    entry["no_change_reason"] = "Texture enhancement was guarded because the source is already very sharp or has excessive noise"
                elif stage.name == "selective_sharpening":
                    entry["no_change_reason"] = "No edge detail exceeded the sharpening threshold"
                elif stage.name == "noise_reduction":
                    entry["no_change_reason"] = "Measured noise was below the denoising strength threshold"
                elif stage.name == "wood_tone":
                    entry["no_change_reason"] = "The stage-local wood hue and saturation mask matched fewer than 1% of pixels"
                else:
                    entry["no_change_reason"] = "Stage ran, but its pixel-level guards, thresholds, or integer rounding changed fewer than 1% of pixels"
            if stage_result is not None:
                entry["stage_result"] = stage_result
            result = output
        except Exception as exc:
            timing = finish_stage(
                stage.name,
                started,
                status="failed",
                engine="opencv",
                skipped=False,
            )
            entry = {
                "stage": stage.name,
                "enabled": enabled,
                "status": "failed",
                "execution_time_ms": timing["duration_ms"],
                "timing": timing,
                "input": before,
                "strength_applied": strength,
                "requested": bool(requested),
                "executed": bool(requested),
                "input_source": "pipeline_input" if stage_index == 1 else "previous_stage_output",
            }
            timings = [item["timing"] for item in diagnostics]
            timings.append(timing)
            try:
                setattr(exc, "stage_timings", timings)
            except Exception:
                pass
            log.exception(
                "image_enhancement_stage_failed",
                extra={
                    "stage": stage.name,
                    "enabled": enabled,
                    "input": before,
                    "execution_time_ms": timing["duration_ms"],
                    "timing": timing,
                    "strength_applied": strength,
                },
            )
            raise
        diagnostics.append(entry)
        log.info(
            "image_enhancement_stage",
            extra=entry,
        )
        if changed_pixel_pct < 1.0:
            log.warning(
                "image_enhancement_stage_low_pixel_coverage",
                extra={
                    "mean_pixel_difference": round(mean_pixel_difference, 6),
                    "changed_pixel_pct": round(changed_pixel_pct, 4),
                    "input_strength": strength,
                    "reason": entry.get("no_change_reason", "Stage ran and changed less than 1% of pixels"),
                    "input_source": entry["input_source"],
                },
            )
        if stage_observer is not None:
            stage_observer(stage.name, result, entry)
    pipeline_mean_difference = float(np.mean(cv2.absdiff(source_image, result)))
    profile["pipeline_mean_pixel_difference"] = round(pipeline_mean_difference, 6)
    profile["pipeline_no_change_threshold"] = PIXEL_CHANGE_THRESHOLD
    profile["unchanged_stage_count"] = sum(
        1 for item in diagnostics
        if item.get("mean_pixel_difference", 0) <= PIXEL_CHANGE_THRESHOLD
    )
    if pipeline_mean_difference <= PIXEL_CHANGE_THRESHOLD:
        unchanged = [
            {
                "stage": item["stage"],
                "executed": item.get("executed", False),
                "mean_pixel_difference": item.get("mean_pixel_difference", 0),
                "reason": item.get("no_change_reason"),
            }
            for item in diagnostics
            if item.get("mean_pixel_difference", 0) <= PIXEL_CHANGE_THRESHOLD
        ]
        log.warning(
            "image_enhancement_pipeline_no_change",
            extra={
                "mean_pixel_difference": round(pipeline_mean_difference, 6),
                "threshold": PIXEL_CHANGE_THRESHOLD,
                "unchanged_stages": unchanged,
            },
        )
    else:
        log.info(
            "image_enhancement_pipeline_pixel_change",
            extra={"mean_pixel_difference": round(pipeline_mean_difference, 6)},
        )
    return result, diagnostics
