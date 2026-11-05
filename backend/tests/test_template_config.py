"""Template Editor: config validation, presets and logo-URL safety."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import template_config as tc  # noqa: E402
from services.template_service import TEMPLATE_TYPES as PIPELINE_TYPES  # noqa: E402


def test_all_eight_template_types_have_presets():
    names = [p["name"] for p in tc.preset_list()]
    assert names == ["Luxury Showcase", "Work In Progress", "Before & After", "Project Update",
                     "Promotion", "Quote", "Tip", "Completed Project"]


def test_preset_types_match_the_pipeline_types():
    assert set(tc.TEMPLATE_TYPES) == set(PIPELINE_TYPES)


def test_every_preset_config_is_valid_and_stable():
    for preset in tc.preset_list():
        assert tc.sanitize_config(preset["config"]) == preset["config"]


def test_sanitize_drops_unknown_keys_and_normalises_values():
    cfg = tc.sanitize_config({"template_type": "quote", "headline": "  Hi\x00  ", "primary_color": "#ABC",
                              "evil": "x", "font": "SANS"})
    assert cfg["template_type"] == "QUOTE" and cfg["headline"] == "Hi"
    assert cfg["primary_color"] == "#aabbcc" and cfg["font"] == "sans"
    assert "evil" not in cfg


def test_sanitize_preserves_and_validates_the_optional_design_document():
    document = {
        "schemaVersion": 2,
        "canvas": {"width": 1080, "height": 1350},
        "elements": [{
            "id": "headline", "type": "Heading", "x": 0.2, "y": 0.3,
            "width": 0.6, "height": 0.15, "rotation": 15, "visible": True, "locked": False,
        }],
    }
    config = tc.sanitize_config({"template_type": "TIP", "headline": "Edited", "design_document": document})
    assert config["design_document"] == document
    assert tc.sanitize_config({"headline": "Saved again"}, base=config)["design_document"] == document


@pytest.mark.parametrize("document", [
    None,
    {"schemaVersion": 1, "canvas": {}, "elements": []},
    {"schemaVersion": 2, "canvas": {"width": 0, "height": 100}, "elements": []},
    {"schemaVersion": 2, "canvas": {"width": 100, "height": 100}, "elements": [
        {"id": "x", "x": 0, "y": 0, "width": 1, "height": 1, "rotation": float("nan"), "visible": True, "locked": False},
    ]},
])
def test_sanitize_rejects_invalid_design_document(document):
    with pytest.raises(tc.TemplateConfigError):
        tc.sanitize_config({"template_type": "TIP", "design_document": document})


@pytest.mark.parametrize("raw", [
    {"template_type": "NOPE"},
    {"template_type": "TIP", "font": "comic"},
    {"template_type": "TIP", "text_align": "justify"},
    {"template_type": "TIP", "cta_position": "middle"},
    {"template_type": "TIP", "logo_position": "center"},
    {"template_type": "TIP", "button_style": "pill"},
    {"template_type": "TIP", "overlay_opacity": 1.5},
    {"template_type": "TIP", "overlay_opacity": -0.1},
    {"template_type": "TIP", "overlay_opacity": "0.5"},
    {"template_type": "TIP", "overlay_opacity": True},
    {"template_type": "TIP", "show_badge": "yes"},
    {"template_type": "TIP", "primary_color": "red"},
    {"template_type": "TIP", "headline": "x" * 121},
    {"template_type": "TIP", "headline": 5},
])
def test_sanitize_rejects_invalid_values(raw):
    with pytest.raises(tc.TemplateConfigError):
        tc.sanitize_config(raw)


@pytest.mark.parametrize("url", [
    "C:\\Windows\\win.ini", "/etc/passwd", "file:///etc/passwd", "ftp://example.com/a.png",
    "http://localhost/a.png", "http://127.0.0.1/a.png", "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.5/logo.png", "http://[::1]/logo.png", "http://user:pw@example.com/a.png",
    "http://printer.local/a.png",
])
def test_logo_url_blocks_local_paths_and_private_hosts(url):
    with pytest.raises(tc.TemplateConfigError):
        tc.sanitize_config({"template_type": "TIP", "logo_url": url})


def test_logo_url_accepts_public_https():
    cfg = tc.sanitize_config({"template_type": "TIP", "logo_url": "https://cdn.example.com/logo.png"})
    assert cfg["logo_url"] == "https://cdn.example.com/logo.png"


def test_update_keeps_unspecified_fields_from_base():
    base = tc.sanitize_config({"template_type": "TIP", "headline": "Keep me", "text_align": "right"})
    merged = tc.sanitize_config({"cta": "New CTA"}, base=base)
    assert merged["headline"] == "Keep me" and merged["text_align"] == "right" and merged["cta"] == "New CTA"


def test_clean_name_requires_text():
    assert tc.clean_name("  My template ") == "My template"
    for bad in ("", "   ", None):
        with pytest.raises(tc.TemplateConfigError):
            tc.clean_name(bad)
