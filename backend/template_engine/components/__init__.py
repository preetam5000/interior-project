"""Reusable visual primitives that can be composed by any template."""

from typing import Protocol

from ..interfaces import TemplateConfig


class Component(Protocol):
    """A reusable layer primitive, independent of any particular template."""

    component_type: str

    def validate(self, config: TemplateConfig) -> None:
        """Validate this component's configuration against the template contract."""
        ...
