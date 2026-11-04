"""Asset resolution interfaces and storage adapters."""

from typing import Protocol


class AssetResolver(Protocol):
    """Resolve a logical asset reference without embedding paths in templates."""

    def resolve(self, asset_ref: str) -> str:
        """Return a local, renderable asset path or raise a resolution error."""
        ...
