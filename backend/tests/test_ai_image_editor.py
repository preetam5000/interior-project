import base64
import io
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import ai_image_editor as editor  # noqa: E402


def _png_bytes(size=(12, 10), color=(120, 110, 100)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def test_edit_image_uses_images_edit_api_and_saves_returned_png(tmp_path, monkeypatch):
    source = tmp_path / "source.png"
    destination = tmp_path / "edited.png"
    source.write_bytes(_png_bytes())
    result_bytes = _png_bytes(size=(20, 16), color=(80, 90, 100))
    calls = {}

    class FakeImages:
        def edit(self, **kwargs):
            calls.update(kwargs)
            assert kwargs["image"].read() == source.read_bytes()
            return SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(result_bytes).decode())])

    class FakeClient:
        def __init__(self, **kwargs):
            calls["client_options"] = kwargs
            self.images = FakeImages()

        def close(self):
            calls["closed"] = True

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(editor, "OpenAI", FakeClient)

    editor.edit_image(str(source), str(destination))

    assert destination.read_bytes() == result_bytes
    assert calls["model"] == editor.MODEL
    assert calls["prompt"] == editor.prompt_for_mode("architectural")
    assert "input_fidelity" not in calls
    assert calls["output_format"] == "png"
    assert calls["quality"] == "high"
    assert calls["size"] == "auto"
    assert calls["client_options"]["api_key"] == "test-key"
    assert calls["closed"] is True
    assert not list(tmp_path.glob(".edited.*.tmp"))


@pytest.mark.parametrize(
    "mode", ["architectural", "luxury", "scandinavian", "modern", "cinematic"]
)
def test_prompt_modes_keep_scene_preservation_rules_and_add_style(mode):
    prompt = editor.prompt_for_mode(mode).lower()

    assert "preserve its exact scene" in prompt
    assert "never add, remove, replace, clean up, complete, or move anything" in prompt
    assert "do not crop, extend, reframe, or change composition" in prompt
    assert "never redesign the room" in prompt
    assert "complete unfinished construction" in prompt
    assert "remove construction materials or tools" in prompt
    assert "add furniture or fixtures" in prompt
    assert "alter architecture" in prompt
    assert "photographic realism" in prompt
    assert editor.MODE_PROMPTS[mode].lower() in prompt


def test_prompt_mode_defaults_to_architectural():
    assert editor.prompt_for_mode() == editor.prompt_for_mode("architectural")


@pytest.mark.parametrize(
    "mode",
    [
        "auto",
        "architectural",
        "luxury",
        "construction progress",
        "completed interior",
        "minimal",
        "scandinavian",
        "modern",
    ],
)
def test_adaptive_preset_prompts_preserve_scene_rules(mode):
    prompt = editor.prompt_for_mode(mode).lower()

    assert "preserve every construction detail exactly" in prompt
    assert "do not crop, extend, reframe, or change composition" in prompt
    assert editor.MODE_PROMPTS[mode] in editor.prompt_for_mode(mode)


def test_prompt_rejects_unknown_mode():
    with pytest.raises(ValueError, match="Unsupported editor mode"):
        editor.prompt_for_mode("fantasy")


@pytest.mark.parametrize(
    "mode", ["architectural", "luxury", "scandinavian", "modern", "cinematic"]
)
def test_edit_image_sends_selected_mode_prompt(tmp_path, monkeypatch, mode):
    source = tmp_path / "source.png"
    destination = tmp_path / "edited.png"
    source.write_bytes(_png_bytes())
    request = {}

    class FakeImages:
        def edit(self, **kwargs):
            request.update(kwargs)
            return SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(_png_bytes()).decode())])

    class FakeClient:
        def __init__(self, **_kwargs):
            self.images = FakeImages()

        def close(self):
            pass

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(editor, "OpenAI", FakeClient)

    editor.edit_image(str(source), str(destination), mode)

    assert request["prompt"] == editor.prompt_for_mode(mode)


def test_edit_image_uses_reference_only_for_style(tmp_path, monkeypatch):
    source = tmp_path / "target.png"
    reference = tmp_path / "style.png"
    destination = tmp_path / "edited.png"
    source_bytes = _png_bytes(color=(120, 110, 100))
    reference_bytes = _png_bytes(color=(200, 190, 180))
    source.write_bytes(source_bytes)
    reference.write_bytes(reference_bytes)
    request = {}

    class FakeImages:
        def edit(self, **kwargs):
            request.update(kwargs)
            assert [image.read() for image in kwargs["image"]] == [source_bytes, reference_bytes]
            return SimpleNamespace(data=[SimpleNamespace(b64_json=base64.b64encode(_png_bytes()).decode())])

    class FakeClient:
        def __init__(self, **_kwargs):
            self.images = FakeImages()

        def close(self):
            pass

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(editor, "OpenAI", FakeClient)

    editor.edit_image(str(source), str(destination), style_reference_path=str(reference))

    assert "style reference only" in request["prompt"].lower()
    assert "first input is the target" in request["prompt"].lower()


def test_edit_image_requires_api_key(tmp_path, monkeypatch):
    source = tmp_path / "source.png"
    source.write_bytes(_png_bytes())
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(editor.AIImageEditError, match="OPENAI_API_KEY"):
        editor.edit_image(str(source), str(tmp_path / "edited.png"))


def test_edit_image_rejects_unsupported_input_format(tmp_path, monkeypatch):
    source = tmp_path / "source.gif"
    Image.new("RGB", (4, 4)).save(source, format="GIF")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    with pytest.raises(editor.AIImageEditError, match="Unsupported input image format"):
        editor.edit_image(str(source), str(tmp_path / "edited.png"))


def test_edit_image_rejects_invalid_response_data(tmp_path, monkeypatch):
    source = tmp_path / "source.png"
    destination = tmp_path / "edited.png"
    source.write_bytes(_png_bytes())

    class FakeImages:
        def edit(self, **_kwargs):
            return SimpleNamespace(data=[SimpleNamespace(b64_json="not valid base64!")])

    class FakeClient:
        def __init__(self, **_kwargs):
            self.images = FakeImages()

        def close(self):
            pass

    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setattr(editor, "OpenAI", FakeClient)

    with pytest.raises(editor.AIImageEditError, match="invalid base64"):
        editor.edit_image(str(source), str(destination))
    assert not destination.exists()
