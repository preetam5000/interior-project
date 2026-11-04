import sys
from pathlib import Path

import pytest
from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import image_editor as ie  # noqa: E402


def test_enhancement_is_non_destructive_to_input_and_keeps_dimensions():
    img = Image.new("RGB", (96, 72), (118, 105, 91))
    draw = ImageDraw.Draw(img)
    for x in range(12, 84, 8):
        draw.line((x, 8, x, 64), fill=(165, 153, 137), width=1)
    original = img.copy()

    out = ie.enhance(img)

    assert out.mode == "RGB"
    assert out.size == img.size
    assert ImageChops.difference(img, original).getbbox() is None
    assert ImageChops.difference(out, original).getbbox() is not None


def test_extreme_manual_adjustments_are_bounded():
    img = Image.new("RGB", (32, 32), (120, 105, 90))

    out = ie.enhance(img, adj={
        "brightness": 100,
        "contrast": 100,
        "saturation": 100,
        "sharpness": 100,
        "warmth": 100,
        "shadows": 100,
        "highlights": 100,
        "clarity": 100,
    })

    assert out.size == img.size
    assert all(0 <= value <= 255 for value in out.getpixel((16, 16)))


def test_non_finite_adjustments_are_rejected():
    with pytest.raises(ValueError, match="finite number"):
        ie.enhance(Image.new("RGB", (8, 8)), adj={"warmth": float("nan")})


def test_variant_fits_full_photo_without_cropping():
    source = Image.new("RGB", (8, 8), (0, 0, 0))
    source.putpixel((0, 0), (255, 0, 0))
    source.putpixel((7, 0), (0, 255, 0))
    source.putpixel((0, 7), (0, 0, 255))
    source.putpixel((7, 7), (255, 255, 0))

    variant = ie.make_variant(source, (8, 12))

    assert variant.size == (8, 12)
    assert variant.crop((0, 2, 8, 10)).tobytes() == source.tobytes()
    assert variant.getpixel((4, 0)) == (244, 243, 240)
