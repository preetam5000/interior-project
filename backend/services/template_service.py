"""Recommend and render branded social-media templates."""
import json
import logging
import re
from pathlib import Path
from typing import Any, TypedDict

from services import ai_analyzer
from services.notification_service import track_usage
from services.settings_service import get_settings, get_settings_cached
from services.template_renderer import TemplateRenderer

log = logging.getLogger("template")

# Template types the renderer knows how to draw. Unknown types fall back to the
# default luxury layout, but the service always selects one of these.
TEMPLATE_TYPES = (
    "WORK_IN_PROGRESS",
    "COMPLETED_PROJECT",
    "BEFORE_AFTER",
    "LUXURY_SHOWCASE",
    "PROMOTION",
    "QUOTE",
    "TIP",
    "PROJECT_UPDATE",
)

# Project stages that mean the space is still being built or dressed.
IN_PROGRESS_STAGES = {
    "Site Visit", "Construction", "Brick Work",
    "Electrical", "Painting", "Wood Work", "Furniture", "Styling",
}

# Words in the analysis that signal a before/after transformation story.
BEFORE_AFTER_HINTS = ("before and after", "before/after", "before after", "transformation", "restyled")


class TemplateGenerationError(RuntimeError):
    """Raised when a template could not be rendered."""


class TemplateRecommendation(TypedDict):
    enabled: bool
    type: str
    headline: str
    subtitle: str
    cta: str
    badge: str
    story_sticker: str
    location_label: str
    progress_percentage: int | None
    progress_is_estimate: bool
    completion_stage: str


class TemplateService:
    """Recommend a branded image template from image-analysis metadata."""

    async def recommend_template(self, metadata: dict[str, Any]) -> TemplateRecommendation:
        """Ask OpenAI whether to apply a template; return a safe disabled result on failure."""
        try:
            settings = await get_settings()
            system = (
                "You are a brand-aware creative director for an interior design studio. "
                "Choose the best template and generate copy that fits that template and the image analysis. "
                "Generate a concise headline, subtitle, CTA, badge, story sticker, location label, "
                "progress percentage, and completion stage. "
                "Never invent a real location; use an empty location label when none is provided. "
                "Progress is an estimate based on the analyzed project stage, not a verified project metric; "
                "set it to null when the project is not in progress or there is not enough evidence. "
                "Keep story stickers to 8 words or fewer and badges to 4 words or fewer. "
                "For ordinary polished imagery that does not need overlays, set enabled to false and type to NONE. "
                "Respond with exactly one valid JSON object and no markdown or surrounding text."
            )
            prompt = (
                f"Brand kit: {json.dumps({k: settings.get(k) for k in ('brand_name', 'brand_primary_color', 'brand_secondary_color', 'logo_url', 'default_cta')})}\n"
                f"Image analysis metadata: {json.dumps(metadata, ensure_ascii=False)}\n"
                'Return JSON with keys enabled (boolean), type (uppercase identifier or "NONE"), '
                'headline, subtitle, cta, badge, story_sticker, location_label, '
                'progress_percentage (integer 0-100 or null), progress_is_estimate (boolean), '
                'and completion_stage (string). Example: '
                '{"enabled":true,"type":"WORK_IN_PROGRESS","headline":"Work In Progress",'
                '"subtitle":"A considered wardrobe taking shape","cta":"Follow the progress",'
                '"badge":"In progress","story_sticker":"Details taking shape",'
                '"location_label":"","progress_percentage":55,"progress_is_estimate":true,'
                '"completion_stage":"Electrical"}. '
                'If no template is needed return {"enabled":false,"type":"NONE"}.'
            )
            response = await ai_analyzer.complete_text(settings, system, prompt)
            if not isinstance(response, str):
                raise ValueError("Template recommendation response was not text")
            result = json.loads(response.strip())
            if not isinstance(result, dict) or not isinstance(result.get("enabled"), bool):
                raise ValueError("Template recommendation must be a JSON object with a boolean enabled field")
            await track_usage("openai", "recommend_template", cost_usd=settings.get("gpt_text_cost_per_request_usd"))

            if not result["enabled"]:
                if result.get("type", "NONE") != "NONE":
                    raise ValueError("Disabled template recommendation must use type NONE")
                return self._disabled_recommendation()

            template_type = result.get("type")
            if not isinstance(template_type, str) or not re.fullmatch(r"[A-Z][A-Z0-9_]*", template_type) or template_type == "NONE":
                raise ValueError("Enabled template recommendation has an invalid type")
            fields = {
                key: result.get(key)
                for key in (
                    "headline",
                    "subtitle",
                    "cta",
                    "badge",
                    "story_sticker",
                    "location_label",
                    "completion_stage",
                )
            }
            if not all(isinstance(value, str) for value in fields.values()):
                raise ValueError("Enabled template recommendation must include all template content strings")

            percentage = result.get("progress_percentage")
            if percentage is not None and (
                isinstance(percentage, bool)
                or not isinstance(percentage, (int, float))
                or not 0 <= percentage <= 100
            ):
                raise ValueError("Progress percentage must be between 0 and 100 or null")
            progress_is_estimate = result.get("progress_is_estimate")
            if not isinstance(progress_is_estimate, bool):
                raise ValueError("Progress estimate flag must be a boolean")

            return {
                "enabled": True,
                "type": template_type,
                **{key: value.strip() for key, value in fields.items()},
                "progress_percentage": round(percentage) if percentage is not None else None,
                "progress_is_estimate": progress_is_estimate,
            }
        except Exception:
            log.exception("Template recommendation failed; continuing without a template")
            return self._disabled_recommendation()

    @staticmethod
    def _disabled_recommendation() -> TemplateRecommendation:
        return {
            "enabled": False,
            "type": "NONE",
            "headline": "",
            "subtitle": "",
            "cta": "",
            "badge": "",
            "story_sticker": "",
            "location_label": "",
            "progress_percentage": None,
            "progress_is_estimate": False,
            "completion_stage": "",
        }

    def generate_template(self, image_path: str, metadata: dict[str, Any]) -> str:
        """Render a branded template for `image_path` and return the output path.

        The template is chosen from the analyzer metadata (or from an explicit
        recommendation carried inside the metadata) and rendered with the brand
        settings. Settings are read from the cached snapshot because this method
        is synchronous and the database client is bound to the running loop.

        When no template applies, or when rendering fails for any reason, the
        failure is logged and the original `image_path` is returned unchanged so
        the caller can continue with the un-templated image.
        """
        try:
            source = Path(image_path)
            if not source.is_file():
                raise TemplateGenerationError(f"Template source image not found: {image_path}")

            metadata = metadata or {}
            settings = get_settings_cached()
            recommendation = self._build_recommendation(metadata, settings)
            if recommendation is None:
                log.info("No template applies to %s; keeping the source image", source.name)
                return image_path

            renderer = TemplateRenderer()
            output_path = renderer.render_template(str(source), recommendation, settings)
            log.info("Rendered %s template to %s", recommendation["type"], output_path)
            return output_path

        except Exception:
            log.exception("Template rendering failed for %s; returning the original image", image_path)
            return image_path

    # ------------------------------------------------------------- selection --
    @staticmethod
    def _analysis(metadata: dict[str, Any]) -> dict[str, Any]:
        """Return the analyzer output carried by the metadata (empty when absent)."""
        analysis = metadata.get("analysis")
        return analysis if isinstance(analysis, dict) else {}

    @staticmethod
    def _select_type(analysis: dict[str, Any]) -> str:
        """Map the analyzer output onto one of the supported template types."""
        stage = str(analysis.get("project_stage") or "").strip().title()
        if stage in IN_PROGRESS_STAGES:
            return "WORK_IN_PROGRESS"
        if stage == "Completed":
            return "COMPLETED_PROJECT"
        if str(analysis.get("content_type") or "").strip().lower() == "story":
            return "PROJECT_UPDATE"
        return "LUXURY_SHOWCASE"

    @staticmethod
    def _headline(metadata: dict[str, Any], analysis: dict[str, Any]) -> str:
        title = str(analysis.get("title") or "").strip()
        if title:
            return title
        room = str(analysis.get("room_type") or "").strip()
        if room:
            return f"{room} Project"
        project = str(metadata.get("project") or "").strip()
        return project or "Interior Project"

    @staticmethod
    def _subtitle(metadata: dict[str, Any], analysis: dict[str, Any]) -> str:
        for key in ("story_text", "editorial_description", "reason"):
            value = str(analysis.get(key) or "").strip()
            if value:
                return value
        parts = [str(analysis.get(key) or "").strip() for key in ("room_type", "design_style")]
        return " · ".join(part for part in parts if part)

    def _build_recommendation(self, metadata: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any] | None:
        """Build the renderer recommendation, or None when no template applies.

        An explicit recommendation (produced by `recommend_template`) wins over
        the values derived from the image analysis.
        """
        analysis = self._analysis(metadata)
        explicit = metadata.get("recommendation")

        if isinstance(explicit, dict):
            if not explicit.get("enabled"):
                return None
            template_type = str(explicit.get("type") or "").strip().upper()
            if template_type not in TEMPLATE_TYPES:
                template_type = self._select_type(analysis)
            recommendation = {
                "enabled": True,
                "type": template_type,
                "headline": str(explicit.get("headline") or "").strip(),
                "subtitle": str(explicit.get("subtitle") or "").strip(),
                "cta": str(explicit.get("cta") or "").strip(),
                "badge": str(explicit.get("badge") or "").strip(),
                "story_sticker": str(explicit.get("story_sticker") or "").strip(),
                "location_label": str(explicit.get("location_label") or "").strip(),
                "progress_percentage": explicit.get("progress_percentage"),
                "progress_is_estimate": bool(explicit.get("progress_is_estimate", False)),
                "completion_stage": str(explicit.get("completion_stage") or "").strip(),
            }
        else:
            if not analysis:
                raise TemplateGenerationError(
                    "Template metadata does not contain an image analysis")
            recommendation = {
                "enabled": True,
                "type": self._select_type(analysis),
                "headline": "",
                "subtitle": "",
                "cta": "",
                "badge": "",
                "story_sticker": "",
                "location_label": "",
                "progress_percentage": None,
                "progress_is_estimate": False,
                "completion_stage": "",
            }

        if not recommendation["headline"]:
            recommendation["headline"] = self._headline(metadata, analysis)
        if not recommendation["subtitle"]:
            recommendation["subtitle"] = self._subtitle(metadata, analysis)
        if not recommendation["cta"]:
            recommendation["cta"] = str(settings.get("default_cta") or "").strip()
        if not recommendation["story_sticker"]:
            recommendation["story_sticker"] = str(analysis.get("story_text") or "").strip()
        if not recommendation["completion_stage"]:
            recommendation["completion_stage"] = str(analysis.get("project_stage") or "").strip()
        return recommendation
