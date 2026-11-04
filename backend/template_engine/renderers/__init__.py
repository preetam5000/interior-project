"""Output adapters; each renderer consumes the same normalized template contract."""

from typing import Protocol

from ..interfaces import RenderContext, RenderResult, TemplateConfig


class Renderer(Protocol):
    """Renderer adapter for a target output format."""

    def render(self, config: TemplateConfig, context: RenderContext) -> RenderResult:
        """Render a normalized template and return output metadata."""
        ...
