"""Small monotonic timing helpers shared by image processing stages."""
from __future__ import annotations

import time
from typing import Any


def start_stage() -> float:
    return time.perf_counter()


def finish_stage(
    name: str,
    started: float,
    *,
    status: str,
    engine: str,
    **metadata: Any,
) -> dict[str, Any]:
    ended = time.perf_counter()
    return {
        "stage": name,
        "start_time": started,
        "end_time": ended,
        "time_source": "perf_counter",
        "duration_ms": (ended - started) * 1000.0,
        "status": status,
        "engine": engine,
        **metadata,
    }


def attach_stage_timings(error: BaseException, timings: list[dict[str, Any]]) -> None:
    """Carry completed timings through async/thread boundaries on an error."""
    try:
        setattr(error, "stage_timings", list(timings))
    except Exception:
        pass

