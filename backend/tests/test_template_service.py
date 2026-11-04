import asyncio
import json
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import template_service  # noqa: E402
from services.template_renderer import TemplateRenderer  # noqa: E402


def test_recommend_template_generates_template_matched_content(monkeypatch):
    settings = {"brand_name": "Studio", "default_cta": "Discover more"}
    generated = {
        "enabled": True,
        "type": "WORK_IN_PROGRESS",
        "headline": "Craft in progress",
        "subtitle": "A bespoke kitchen taking shape",
        "cta": "Follow the progress",
        "badge": "On site",
        "story_sticker": "Details taking shape",
        "location_label": "",
        "progress_percentage": 55,
        "progress_is_estimate": True,
        "completion_stage": "Electrical",
    }

    async def get_settings():
        return settings

    async def complete_text(_settings, _system, _prompt):
        return json.dumps(generated)

    async def track_usage(*_args, **_kwargs):
        return None

    monkeypatch.setattr(template_service, "get_settings", get_settings)
    monkeypatch.setattr(template_service.ai_analyzer, "complete_text", complete_text)
    monkeypatch.setattr(template_service, "track_usage", track_usage)

    result = asyncio.run(template_service.TemplateService().recommend_template({
        "analysis": {"room_type": "Kitchen", "project_stage": "Electrical"}
    }))

    assert result == generated


def test_build_recommendation_preserves_generated_template_content():
    content = {
        "badge": "On site",
        "story_sticker": "Details taking shape",
        "location_label": "",
        "progress_percentage": 55,
        "progress_is_estimate": True,
        "completion_stage": "Electrical",
    }
    recommendation = template_service.TemplateService()._build_recommendation(
        {
            "analysis": {"project_stage": "Electrical"},
            "recommendation": {
                "enabled": True,
                "type": "WORK_IN_PROGRESS",
                "headline": "Craft in progress",
                "subtitle": "A bespoke kitchen taking shape",
                "cta": "Follow the progress",
                **content,
            },
        },
        {"default_cta": "Discover more"},
    )

    assert recommendation is not None
    assert {key: recommendation[key] for key in content} == content


def test_generate_template_uses_renderer_public_api(monkeypatch, tmp_path):
    source = tmp_path / "source.png"
    Image.new("RGB", (640, 800), color=(90, 110, 125)).save(source)
    monkeypatch.setattr(template_service, "get_settings_cached", lambda: {
        "default_cta": "Follow for more",
        "brand_name": "Studio",
        "brand_primary_color": "#e5c158",
        "brand_secondary_color": "#09090b",
        "logo_url": "",
    })
    monkeypatch.setattr(
        template_service,
        "TemplateRenderer",
        lambda: TemplateRenderer(output_dir=tmp_path / "templates"),
    )

    output = template_service.TemplateService().generate_template(
        str(source),
        {
            "analysis": {"room_type": "Kitchen"},
            "recommendation": {
                "enabled": True,
                "type": "TIP",
                "headline": "Designed to last",
                "subtitle": "A thoughtful kitchen",
                "cta": "Discover more",
            },
        },
    )

    assert output != str(source)
    assert Path(output).is_file()
    with Image.open(output) as rendered:
        assert rendered.format == "JPEG"
