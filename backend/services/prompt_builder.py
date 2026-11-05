"""Context-aware prompts for conservative architectural photo edits.

``BASE_EDIT_PROMPT`` is the canonical preservation contract inherited by every
mode and context-specific prompt: preserve the source scene, objects, materials,
construction state, framing, viewpoint, and proportions; apply photographic
adjustments only. Additional prompt sections may guide photographic style, but
must not authorize scene changes.
"""
from __future__ import annotations

import logging
import math
from collections.abc import Mapping
from typing import Any, Final

log = logging.getLogger("prompt_builder")

BASE_EDIT_PROMPT: Final = """You are a professional interior design photo editor.

Enhance this image for Instagram while preserving authenticity.

Requirements:
- Do not change the architecture.
- Do not add furniture that does not exist.
- Do not complete unfinished construction.
- Preserve measurements and proportions.
- Improve exposure.
- Improve white balance.
- Improve shadows and highlights.
- Increase texture and material clarity.
- Make wood grains look natural.
- Remove camera noise.
- Improve sharpness.
- Improve dynamic range.
- Improve color harmony.
- Make the image look premium and professionally photographed.
- Keep the result realistic.
- Output should be ready for Instagram posting.

Apply photographic adjustments only. Preserve the existing scene, materials, objects, construction state, framing, viewpoint, and proportions. Do not add, remove, replace, move, or reconstruct anything. Keep the final image natural and photorealistic."""

MODE_PROMPTS: Final = {
    "auto": (
        "Preset: Adaptive automatic. Use the restrained treatment most appropriate "
        "to the target photo while preserving its measured exposure and materials."
    ),
    "architectural": (
        "Preset: Architectural. Use neutral, editorial architectural-documentation color, "
        "natural daylight, accurate whites, and faithful material color. Keep the treatment "
        "restrained and consistent across projects."
    ),
    "luxury": (
        "Preset: Luxury. Add a refined, premium editorial polish through subtle tonal depth "
        "and elegant color separation only. Do not make the room, materials, fixtures, "
        "finishes, or lighting appear more expensive or different."
    ),
    "bright": (
        "Preset: Bright. Gently lift exposure and shadow detail while protecting highlights, "
        "keeping whites neutral, and preserving natural depth and the original light sources."
    ),
    "instagram ready": (
        "Preset: Instagram ready. Give the photograph a polished, balanced editorial finish "
        "with natural color, clear detail, and restrained contrast suitable for a premium "
        "interior-design social post."
    ),
    "construction progress": (
        "Preset: Construction progress. Prioritize faithful material texture, "
        "visible existing work details, neutral color, and documentary realism."
    ),
    "completed interior": (
        "Preset: Completed interior. Use refined editorial balance and natural "
        "material separation without changing finishes or furnishings."
    ),
    "minimal": (
        "Preset: Minimal. Keep the grade exceptionally restrained, whites neutral, "
        "and colors true to the source."
    ),
    "scandinavian": (
        "Preset: Scandinavian. Favor soft natural daylight, calm neutral whites, gentle "
        "warmth, pale-but-accurate wood tones, and airy tonal balance. Do not brighten "
        "shadows to the point of flattening depth."
    ),
    "modern": (
        "Preset: Modern. Use clean neutral color, controlled highlights, crisp but natural "
        "local contrast, and precise material separation without a stylized or synthetic look."
    ),
    "cinematic": (
        "Preset: Cinematic. Use only a very subtle editorial tonal curve and restrained "
        "color separation. Do not add dramatic lighting, colored light, atmosphere, deep "
        "crushed shadows, or alter real ambient conditions."
    ),
}

ROOM_TEMPLATES: Final = {
    "kitchen": (
        "Room context: kitchen. Preserve the exact cabinetry, counters, appliances, "
        "fittings, and unfinished details; only refine photographic tone and color."
    ),
    "wardrobe": (
        "Room context: wardrobe or closet. Preserve each cabinet panel, joint, handle, "
        "interior, and material exactly; keep wood and laminate colors realistic."
    ),
    "bathroom": (
        "Room context: bathroom. Preserve all tile, sanitaryware, fixtures, joints, "
        "and construction details; keep whites and reflective surfaces natural."
    ),
    "living room": (
        "Room context: living room. Preserve existing furniture, furnishings, finishes, "
        "and their exact positions; refine only the photographic rendering."
    ),
    "bedroom": (
        "Room context: bedroom. Preserve existing furniture, built-ins, textiles, "
        "and all object positions; refine only the photographic rendering."
    ),
    "dining": (
        "Room context: dining area. Preserve the existing table, chairs, finishes, "
        "and object positions exactly."
    ),
    "staircase": (
        "Room context: staircase. Preserve stair geometry, rails, edges, and visible "
        "construction details exactly; avoid altering vertical or diagonal lines."
    ),
}

STAGE_TEMPLATES: Final = {
    "construction": (
        "Project stage: construction or progress. Keep incomplete work incomplete and "
        "preserve tools, materials, temporary protections, and visible work marks."
    ),
    "completed": (
        "Project stage: completed interior. Preserve the finished state and all existing "
        "objects; do not add staging, decoration, or fixtures."
    ),
}

LIGHTING_TEMPLATES: Final = {
    "natural": (
        "Lighting: natural daylight is indicated. Refine its existing balance without "
        "inventing light sources or reconstructing clipped window views."
    ),
    "artificial": (
        "Lighting: artificial or indoor lighting is indicated. Correct color cast subtly "
        "while retaining the actual direction, character, and level of illumination."
    ),
    "mixed": (
        "Lighting: mixed illumination is indicated. Balance color casts gently while "
        "preserving the original light sources and realistic ambient conditions."
    ),
}

STYLE_TEMPLATES: Final = {
    "luxury": "Style: luxury. Use quiet tonal refinement only; do not change or upgrade any finish.",
    "minimal": "Style: minimal. Keep color and tonal treatment restrained and faithful to the source.",
    "scandinavian": (
        "Style: Scandinavian. Keep whites calm and neutral and wood pale only when it is "
        "already pale in the source."
    ),
    "modern": "Style: modern. Keep the finish clean and natural, without stylized color effects.",
}

STYLE_REFERENCE_PROMPT: Final = """A second input image is provided as a STYLE REFERENCE only. Use it only to guide photographic color grading, lighting balance, dynamic range, local contrast, clarity, and overall photographic finish. Do not copy, recreate, or transfer its room, architecture, layout, furniture, objects, materials, or composition. The first input is the TARGET and is the only source of scene content. Preserve the target's construction details and framing exactly."""

_AREA_THRESHOLDS: Final = {"window": 10.0, "wood": 15.0, "wall": 20.0}


def _prediction_value(source: Mapping[str, Any], name: str) -> Any:
    predictions = source.get("predictions")
    if isinstance(predictions, Mapping) and name in predictions:
        prediction = predictions[name]
        if isinstance(prediction, Mapping):
            return prediction.get("value")
        return prediction
    value = source.get(name)
    if isinstance(value, Mapping):
        return value.get("value")
    return value


def _first_value(sources: tuple[Mapping[str, Any], ...], *names: str) -> Any:
    for source in sources:
        for name in names:
            value = _prediction_value(source, name)
            if value is not None and str(value).strip():
                return value
    return None


def _number(sources: tuple[Mapping[str, Any], ...], *names: str) -> float | None:
    value = _first_value(sources, *names)
    if isinstance(value, bool):
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return numeric if math.isfinite(numeric) else None


def _normalized(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ").replace("-", " ")


def _area_template(
    name: str,
    area: float | None,
    threshold: float,
) -> str | None:
    if area is None or area < threshold:
        return None
    if name == "window":
        return (
            f"Window area is estimated at {area:.1f}%. Protect bright window regions "
            "and retain existing view detail; do not invent or replace scenery."
        )
    if name == "wood":
        return (
            f"Wood occupies an estimated {area:.1f}% of the image. Preserve its actual "
            "species, grain, and hue; refine texture subtly without orange saturation."
        )
    return (
        f"Wall area is estimated at {area:.1f}%. Keep wall color neutral only where "
        "the source indicates a neutral finish; preserve existing texture and paint color."
    )


def _quality_guidance(report: Mapping[str, Any]) -> str | None:
    quality_score = _number((report,), "quality_score", "overall")
    quality_grade = _first_value((report,), "quality_grade", "grade")
    breakdown = report.get("score_breakdown")
    weak_scores: list[str] = []
    if isinstance(breakdown, Mapping):
        for category, detail in breakdown.items():
            if not isinstance(detail, Mapping):
                continue
            try:
                score = float(detail.get("score"))
            except (TypeError, ValueError):
                continue
            if math.isfinite(score) and score < 65:
                weak_scores.append(str(category).replace("_", " "))

    actions = report.get("recommended_actions")
    selected_actions = (
        [str(action).strip() for action in actions if str(action).strip()][:3]
        if isinstance(actions, (list, tuple))
        else []
    )
    if all(
        (
            quality_score is None,
            quality_grade is None,
            not weak_scores,
            not selected_actions,
        )
    ):
        return None

    parts = ["Quality report guidance: address only measurable photographic weaknesses."]
    if quality_score is not None or quality_grade is not None:
        score_text = (
            f"{quality_score:.1f}/100"
            if quality_score is not None
            else "not scored"
        )
        grade_text = (
            f" (grade {quality_grade})"
            if quality_grade is not None
            else ""
        )
        parts.append(f"Overall measured image quality: {score_text}{grade_text}.")
    if weak_scores:
        parts.append(
            "Areas needing the most restraint-aware attention: "
            f"{', '.join(weak_scores)}."
        )
    if selected_actions:
        parts.append("Recommended photographic corrections: " + " ".join(selected_actions))
    parts.append("Do not use these corrections to alter scene content or construction state.")
    return " ".join(parts)


def build_prompt(
    editor_mode: str = "architectural",
    *,
    classification: Mapping[str, Any] | None = None,
    scene_analysis: Mapping[str, Any] | None = None,
    quality_report: Mapping[str, Any] | None = None,
    has_style_reference: bool = False,
    brand_style: str = "",
    brand_prompt_template: str = "",
) -> str:
    """Build and log a prompt from only the available, relevant image context."""
    mode = editor_mode.strip().lower().replace("_", " ")
    if mode not in MODE_PROMPTS:
        raise ValueError(f"Unsupported editor mode: {editor_mode}")

    classification_data = classification or {}
    scene_data = scene_analysis or {}
    report = quality_report or {}
    sources = (scene_data, classification_data, report)
    sections = [BASE_EDIT_PROMPT, MODE_PROMPTS[mode]]
    if brand_style.strip():
        sections.append(
            "Company photographic style guidance (apply only to the photographic "
            "finish, never scene content): " + brand_style.strip()[:1000]
        )
    if brand_prompt_template.strip():
        sections.append(
            "Company-specific photographic prompt guidance (preserve all original "
            "construction and scene details): " + brand_prompt_template.strip()[:3000]
        )

    room_type = _normalized(_first_value(sources, "room_type"))
    room_template = ROOM_TEMPLATES.get(room_type)
    if room_template:
        sections.append(room_template)

    project_stage = _normalized(
        _first_value(sources, "project_stage", "stage")
    )
    if any(token in project_stage for token in ("construct", "progress", "unfinished", "renovat")):
        sections.append(STAGE_TEMPLATES["construction"])
    elif any(token in project_stage for token in ("complete", "finished")):
        sections.append(STAGE_TEMPLATES["completed"])

    lighting = _normalized(
        _first_value(sources, "lighting_type", "lighting", "light_type")
    )
    for key, template in LIGHTING_TEMPLATES.items():
        if key in lighting:
            sections.append(template)
            break

    style = _normalized(
        _first_value(sources, "interior_style", "design_style", "style")
    )
    selected_style = next(
        (name for name in STYLE_TEMPLATES if name in style),
        None,
    )
    if selected_style:
        sections.append(STYLE_TEMPLATES[selected_style])

    luxury_score = _number(sources, "luxury_score")
    construction_score = _number(sources, "construction_score")
    if luxury_score is not None and luxury_score >= 60:
        sections.append(
            f"Estimated luxury score is {luxury_score:.1f}/100. Keep any premium finish "
            "strictly photographic and do not embellish the room."
        )
    if construction_score is not None and construction_score >= 40:
        sections.append(
            f"Estimated construction score is {construction_score:.1f}/100. Favor accurate "
            "documentary detail and preserve all work in progress."
        )

    for name in ("window", "wood", "wall"):
        area = _number(sources, f"{name}_area", f"{name}_coverage")
        template = _area_template(name, area, _AREA_THRESHOLDS[name])
        if template:
            sections.append(template)

    guidance = _quality_guidance(report)
    if guidance:
        sections.append(guidance)
    if has_style_reference:
        sections.append(STYLE_REFERENCE_PROMPT)
    sections.append(
        "Non-negotiable preservation: company style guidance never overrides scene "
        "preservation. Do not alter architecture, construction state, materials, "
        "object positions, framing, or any visible content."
    )

    prompt = "\n\n".join(sections)
    log.info(
        "Generated GPT Image prompt:\n%s",
        prompt,
        extra={
            "editor_mode": mode,
            "room_type": room_type or None,
            "project_stage": project_stage or None,
            "lighting": lighting or None,
            "style": style or None,
            "generated_prompt": prompt,
        },
    )
    return prompt
