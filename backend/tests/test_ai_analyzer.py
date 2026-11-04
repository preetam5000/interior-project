import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import ai_analyzer  # noqa: E402


def test_complete_text_sends_text_and_image_to_selected_model(monkeypatch):
    calls = {}

    class FakeCompletions:
        async def create(self, **kwargs):
            calls.update(kwargs)
            return SimpleNamespace(
                choices=[SimpleNamespace(message=SimpleNamespace(content="analysis result"))]
            )

    class FakeClient:
        def __init__(self, **kwargs):
            calls["client_options"] = kwargs
            self.chat = SimpleNamespace(completions=FakeCompletions())

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return None

    monkeypatch.setattr(ai_analyzer, "AsyncOpenAI", FakeClient)
    monkeypatch.setattr(ai_analyzer, "_key", lambda _settings: "sk-test")

    response = asyncio.run(
        ai_analyzer.complete_text(
            {"openai_model": "gpt-test"},
            "System instructions",
            "Analyze this image",
            "encoded-image",
        )
    )

    assert response == "analysis result"
    assert calls["model"] == "gpt-test"
    assert calls["messages"][0] == {"role": "system", "content": "System instructions"}
    assert calls["messages"][1]["content"] == [
        {"type": "text", "text": "Analyze this image"},
        {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64,encoded-image"},
        },
    ]


def test_emergent_key_keeps_proxy_and_app_identifier(monkeypatch):
    monkeypatch.setattr(ai_analyzer, "_key", lambda _settings: "sk-emergent-test")
    monkeypatch.setenv("INTEGRATION_PROXY_URL", "https://proxy.example/")
    monkeypatch.setenv("APP_URL", "https://app.example")

    options = ai_analyzer._client_options({})

    assert options["base_url"] == "https://proxy.example/llm"
    assert options["default_headers"] == {"X-App-ID": "https://app.example"}
