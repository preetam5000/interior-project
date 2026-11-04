"""OpenAI GPT Image editing for conservative architectural-photo retouching."""
from __future__ import annotations

import base64
import binascii
import io
import logging
import os
import tempfile
from contextlib import ExitStack
from pathlib import Path
from typing import Final

from openai import OpenAI, OpenAIError
from PIL import Image, UnidentifiedImageError

from services import prompt_builder as _prompt_builder
from services.prompt_builder import build_prompt

log = logging.getLogger("ai_image_editor")

BASE_EDIT_PROMPT = _prompt_builder.BASE_EDIT_PROMPT
MODE_PROMPTS = _prompt_builder.MODE_PROMPTS
STYLE_REFERENCE_PROMPT = _prompt_builder.STYLE_REFERENCE_PROMPT
MODEL: Final = "gpt-image-2.5-sunburst"
MAX_INPUT_BYTES: Final = 50 * 1024 * 1024
SUPPORTED_FORMATS: Final = frozenset({"JPEG", "PNG", "WEBP"})
EDITOR_MODES: Final = frozenset(
    {
        "auto",
        "architectural",
        "luxury",
        "construction progress",
        "completed interior",
        "minimal",
        "scandinavian",
        "modern",
        "cinematic",
    }
)


def prompt_for_mode(
    editor_mode: str = "architectural",
    *,
    has_style_reference: bool = False,
    classification: dict | None = None,
    scene_analysis: dict | None = None,
    quality_report: dict | None = None,
    brand_style: str = "",
    brand_prompt_template: str = "",
) -> str:
    """Build a mode- and image-context-specific prompt."""
    return build_prompt(
        editor_mode,
        classification=classification,
        scene_analysis=scene_analysis,
        quality_report=quality_report,
        has_style_reference=has_style_reference,
        brand_style=brand_style,
        brand_prompt_template=brand_prompt_template,
    )


class AIImageEditError(RuntimeError):
    """Raised when an image cannot be edited or validated."""


def _validate_input(path: Path) -> None:
    try:
        if not path.is_file():
            raise AIImageEditError(f"Input image does not exist: {path}")
        size = path.stat().st_size
        if size <= 0:
            raise AIImageEditError(f"Input image is empty: {path}")
        if size >= MAX_INPUT_BYTES:
            raise AIImageEditError("OpenAI Images API requires input images smaller than 50 MB")
        with Image.open(path) as img:
            if img.format not in SUPPORTED_FORMATS:
                raise AIImageEditError(f"Unsupported input image format: {img.format or 'unknown'}")
            img.verify()
    except AIImageEditError:
        raise
    except UnidentifiedImageError as exc:
        raise AIImageEditError(f"Input is not a readable image: {path}") from exc
    except OSError as exc:
        raise AIImageEditError(f"Could not read input image: {path}") from exc


def _save_image(encoded_image: str, output_path: Path) -> None:
    try:
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise AIImageEditError("OpenAI returned invalid base64 image data") from exc
    if not image_bytes:
        raise AIImageEditError("OpenAI returned an empty image")

    try:
        with Image.open(io.BytesIO(image_bytes)) as image:
            if image.format != "PNG":
                raise AIImageEditError("OpenAI returned an image that is not PNG")
            image.verify()
    except AIImageEditError:
        raise
    except UnidentifiedImageError as exc:
        raise AIImageEditError("OpenAI returned an unreadable image") from exc
    except OSError as exc:
        raise AIImageEditError("OpenAI returned a corrupt image") from exc

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{output_path.stem}.",
            suffix=".tmp",
            dir=output_path.parent,
            delete=False,
        ) as temporary_file:
            temporary_file.write(image_bytes)
            temporary_path = Path(temporary_file.name)
        temporary_path.replace(output_path)
    except OSError as exc:
        log.exception("Unable to save edited image to %s", output_path)
        raise AIImageEditError(f"Could not save edited image to: {output_path}") from exc
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)


def edit_image(
    input_path: str,
    output_path: str,
    editor_mode: str = "architectural",
    style_reference_path: str | None = None,
    classification: dict | None = None,
    scene_analysis: dict | None = None,
    quality_report: dict | None = None,
    generated_prompt: str | None = None,
    api_key: str | None = None,
) -> dict[str, str | None]:
    """Edit one construction photo using the OpenAI Images Edit API.

    If supplied, ``style_reference_path`` is sent after the target image and
    used only for photographic style. The output is a high-quality PNG written
    atomically. Generative output cannot guarantee exact scene preservation.
    """
    source = Path(input_path)
    destination = Path(output_path)
    style_reference = Path(style_reference_path) if style_reference_path else None

    try:
        if source.resolve() == destination.resolve():
            raise AIImageEditError("Input and output paths must be different")
    except OSError as exc:
        raise AIImageEditError("Could not resolve input and output image paths") from exc

    prompt = generated_prompt or prompt_for_mode(
        editor_mode,
        has_style_reference=style_reference is not None,
        classification=classification,
        scene_analysis=scene_analysis,
        quality_report=quality_report,
    )
    api_key = (api_key or os.environ.get("OPENAI_API_KEY", "")).strip()
    if not api_key:
        raise AIImageEditError("OPENAI_API_KEY is required for GPT Image editing")
    _validate_input(source)
    if style_reference is not None:
        if source.resolve() == style_reference.resolve():
            raise AIImageEditError("Target and style-reference images must be different")
        _validate_input(style_reference)

    log.info(
        "Submitting %s to OpenAI image model %s in %s mode%s",
        source.name,
        MODEL,
        editor_mode,
        " with a style reference" if style_reference else "",
    )
    # The media pipeline owns the one explicit retry, so one edit call is one
    # network attempt and its request ID can be logged accurately.
    client = OpenAI(api_key=api_key, timeout=180.0, max_retries=0)
    try:
        with ExitStack() as stack:
            target_file = stack.enter_context(source.open("rb"))
            images = [target_file]
            if style_reference is not None:
                images.append(stack.enter_context(style_reference.open("rb")))
            response = client.images.edit(
                model=MODEL,
                image=images if style_reference is not None else target_file,
                prompt=prompt,
                quality="high",
                size="auto",
                output_format="png",
            )
        if not response.data or not response.data[0].b64_json:
            raise AIImageEditError("OpenAI image edit response did not include image data")
        _save_image(response.data[0].b64_json, destination)
    except AIImageEditError:
        log.exception("OpenAI image edit returned an invalid result for %s", source.name)
        raise
    except OpenAIError as exc:
        log.exception("OpenAI image edit failed for %s", source.name)
        status = f" (HTTP {exc.status_code})" if getattr(exc, "status_code", None) else ""
        raise AIImageEditError(f"OpenAI image editing request failed{status}: {exc}") from exc
    except OSError as exc:
        log.exception("Could not access an image for editing: %s", source.name)
        raise AIImageEditError("Could not open an image for editing") from exc
    finally:
        client.close()

    log.info("Saved OpenAI-edited PNG to %s", destination)
    request_id = getattr(response, "_request_id", None)
    log.info(
        "OpenAI image edit response received",
        extra={"request_id": request_id, "output": destination.name},
    )
    return {"request_id": request_id}
