"""Transport-independent feature adapter. A BLE adapter needs real firmware first."""
from typing import Protocol, Any


class FeatureAdapter(Protocol):
    def read(self, device: dict[str, Any], sequence: int, elapsed: float) -> dict[str, Any] | None:
        """Return a versioned ingestion packet, or None when the source has no sample."""
        ...
