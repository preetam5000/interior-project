"""Template Editor: renderer style options and the rendering service."""
import sys
from io import BytesIO
from pathlib import Path

import pytest
from PIL import Image, ImageChops

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import template_config as tc  # noqa: E402
from services import template_editor_service as tes  # noqa: E402
from services.template_renderer import TemplateRenderer  # noqa: E402

BRAND = {"brand_name": "Atelier Studio", "brand_primary_color": "#E5C158",
         "brand_secondary_color": "#09090B", "logo_url": ""}


@pytest.fixture(scope="module")
def photo(tmp_path_factory) -> Path:
    path = tmp_path_factory.mktemp("photo") / "room.png"
    Image.open(tes.sample_image_path("portrait")).save(path)
    return path


def _render(photo: Path, **overrides) -> Image.Image:
    config = {**tc.default_config("LUXURY_SHOWCASE"), **overrides}
    data, _warning = tes.render_config(photo, tc.sanitize_config(config), BRAND)
    return Image.open(BytesIO(data)).convert("RGB")


def _differs(a: Image.Image, b: Image.Image, box=None) -> bool:
    if box:
        a, b = a.crop(box), b.crop(box)
    return ImageChops.difference(a, b).getbbox() is not None


def test_style_defaults_reproduce_the_original_output(photo):
    """An explicit default `style` block must not change a single pixel."""
    rec = {"type": "WORK_IN_PROGRESS", "headline": "Work In Progress", "subtitle": "Sub", "cta": "Follow"}
    styled = {**rec, "style": dict(tc.DEFAULT_STYLE)}
    with_style = Image.open(TemplateRenderer(output_dir=photo.parent / "a").render_template(
        str(photo), styled, BRAND)).convert("RGB")
    without = Image.open(TemplateRenderer(output_dir=photo.parent / "b").render_template(
        str(photo), rec, BRAND)).convert("RGB")
    assert not _differs(with_style, without)


def test_design_document_payload_controls_preview_and_export_render(photo):
    document = {
        "schemaVersion": 2,
        "canvas": {"width": 1080, "height": 1350},
        "background": {"color": "#ffffff"},
        "branding": {"palette": {}},
        "elements": [{
            "id": "headline", "type": "Heading", "x": 0.08, "y": 0.08,
            "width": 0.84, "height": 0.22, "rotation": 0, "opacity": 1,
            "visible": True, "locked": False, "content": "Original heading",
            "fontFamily": "Georgia", "fontSize": 56, "color": "#111111",
        }],
    }
    original_config = tc.sanitize_config({"template_type": "TIP", "design_document": document})
    edited_document = {
        **document,
        "elements": [{
            **document["elements"][0], "x": 0.36, "y": 0.62, "rotation": 15,
            "content": "Canvas edited heading",
        }],
    }
    edited_config = tc.sanitize_config({"template_type": "TIP", "headline": "Canvas edited heading",
                                        "design_document": edited_document})
    before, _ = tes.render_config(photo, original_config, BRAND, "portrait")
    after, _ = tes.render_config(photo, edited_config, BRAND, "portrait")
    assert _differs(Image.open(BytesIO(before)), Image.open(BytesIO(after)))


def test_overlay_opacity_changes_the_scrim(photo):
    assert _differs(_render(photo, overlay_opacity=1.0), _render(photo, overlay_opacity=0.0),
                    (0, 1000, 1080, 1350))


def test_text_alignment_moves_the_headline(photo):
    assert _differs(_render(photo, text_align="left"), _render(photo, text_align="right"), (0, 850, 1080, 1260))


def test_font_changes_the_headline(photo):
    assert _differs(_render(photo, font="serif"), _render(photo, font="sans"), (0, 850, 1080, 1260))


def test_badge_visibility_toggles_the_chip(photo):
    box = (0, 40, 600, 200)
    assert _differs(_render(photo, show_badge=True, show_logo=False),
                    _render(photo, show_badge=False, show_logo=False), box)


def test_generated_badge_copy_is_rendered(photo):
    renderer = TemplateRenderer(output_dir=photo.parent / "generated-badges")
    in_progress = Image.open(renderer.render_template(
        str(photo),
        {"type": "WORK_IN_PROGRESS", "headline": "Progress", "badge": "On site"},
        BRAND,
    )).convert("RGB")
    completed = Image.open(renderer.render_template(
        str(photo),
        {"type": "WORK_IN_PROGRESS", "headline": "Progress", "badge": "Nearly there"},
        BRAND,
    )).convert("RGB")
    assert _differs(in_progress, completed, (0, 40, 600, 200))


def test_logo_visibility_and_position(photo):
    shown = _render(photo, show_logo=True)
    assert _differs(shown, _render(photo, show_logo=False), (0, 0, 700, 140))
    assert _differs(shown, _render(photo, logo_position="top_right"), (500, 0, 1080, 140))
    assert _differs(shown, _render(photo, logo_position="bottom_center"), (0, 1200, 1080, 1350))


def test_cta_position_detaches_the_button(photo):
    stacked = _render(photo, cta_position="stack")
    for pos in ("top_right", "bottom_left", "bottom_center", "bottom_right"):
        assert _differs(stacked, _render(photo, cta_position=pos)), pos


def test_invalid_style_values_fall_back_safely(photo):
    rec = {"type": "TIP", "headline": "H", "style": {"font": "zzz", "text_align": "up", "overlay_opacity": "x",
                                                      "cta_position": 7, "logo_position": None}}
    out = TemplateRenderer(output_dir=photo.parent / "c").render_template(str(photo), rec, BRAND)
    assert Path(out).is_file()


def test_every_type_renders_on_portrait_and_story():
    for variant in ("portrait", "story"):
        src = tes.sample_image_path(variant)
        for template_type in tc.TEMPLATE_TYPES:
            data, warning = tes.render_config(src, tc.default_config(template_type), BRAND)
            assert Image.open(BytesIO(data)).size == tes.SAMPLE_SIZES[variant] and warning is None


def test_long_text_and_every_position_combination_stay_on_canvas():
    src = tes.sample_image_path("story")
    for cta in tc.CTA_POSITIONS:
        for logo in tc.LOGO_POSITIONS:
            for text_position in ("top", "middle", "bottom"):
                for button_style in ("rounded", "square", "outline"):
                    cfg = tc.sanitize_config({**tc.default_config("PROMOTION"), "headline": "W" * 120,
                                              "subtitle": "word " * 40, "cta": "C" * 40, "cta_position": cta,
                                              "logo_position": logo, "text_align": "center", "text_position": text_position, "button_style": button_style})
                    data, _ = tes.render_config(src, cfg, BRAND)
                    assert Image.open(BytesIO(data)).size == (1080, 1920)



def test_button_styles_produce_different_renders(photo):
    rounded_img = _render(photo, button_style="rounded")
    square_img = _render(photo, button_style="square")
    outline_img = _render(photo, button_style="outline")

    assert _differs(rounded_img, square_img), "Rounded and Square styles should differ visually"
    assert _differs(square_img, outline_img), "Square and Outline styles should differ visually"
    assert _differs(rounded_img, outline_img), "Rounded and Outline styles should differ visually"


def test_default_button_style_is_rounded(photo):
    rec = {"type": "TIP", "headline": "Example", "cta": "Click Me"}
    out_default = TemplateRenderer(output_dir=photo.parent / "default").render_template(str(photo), rec, BRAND)
    rec_rounded = {**rec, "style": {"button_style": "rounded"}}
    out_rounded = TemplateRenderer(output_dir=photo.parent / "rounded").render_template(str(photo), rec_rounded, BRAND)
    assert Image.open(out_default).tobytes() == Image.open(out_rounded).tobytes(), "Default style should match explicit rounded"





def test_build_recommendation_carries_style():
    rec = tes.build_recommendation(tc.default_config("QUOTE"))
    assert rec["type"] == "QUOTE" and rec["style"]["text_align"] == "center" and rec["enabled"] is True


def test_template_colours_override_brand_colours():
    cfg = tc.sanitize_config({**tc.default_config("TIP"), "primary_color": "#112233"})
    settings = tes.build_settings(cfg, BRAND)
    assert settings["brand_primary_color"] == "#112233"
    assert settings["brand_secondary_color"] == "#09090B"


def test_primary_colour_changes_the_accent(photo):
    assert _differs(_render(photo, primary_color="#ff0000"), _render(photo, primary_color="#0000ff"))


def test_shrink_preview_width():
    buffer = BytesIO()
    Image.new("RGB", (1080, 1350), (10, 20, 30)).save(buffer, "JPEG")
    small = Image.open(BytesIO(tes.shrink_preview(buffer.getvalue())))
    assert small.size == (tes.PREVIEW_WIDTH, 675)


def test_normalize_logo_image_validates_and_bounds():
    buffer = BytesIO()
    Image.new("RGBA", (3000, 1000), (255, 0, 0, 255)).save(buffer, "PNG")
    out = Image.open(BytesIO(tes.normalize_logo_image(buffer.getvalue())))
    assert max(out.size) == tes.MAX_LOGO_EDGE
    for bad in (b"not an image", b"", b"0" * (tes.MAX_LOGO_BYTES + 1)):
        with pytest.raises(tes.TemplateRenderError):
            tes.normalize_logo_image(bad)


def test_resolve_logo_refuses_private_targets():
    for url in ("http://127.0.0.1/a.png", "http://localhost/a.png", "file:///etc/passwd"):
        with pytest.raises(tes.TemplateRenderError):
            tes.resolve_logo(url)


def test_unreachable_logo_degrades_to_a_warning(photo, monkeypatch):
    def boom(url):
        raise tes.TemplateRenderError("Logo could not be downloaded")
    monkeypatch.setattr(tes, "resolve_logo", boom)
    cfg = tc.sanitize_config({**tc.default_config("TIP"), "logo_url": "https://example.com/l.png"})
    data, warning = tes.render_config(photo, cfg, BRAND)
    assert warning == "Logo could not be downloaded" and Image.open(BytesIO(data)).size == (1080, 1350)
