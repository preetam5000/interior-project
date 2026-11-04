"""Optional local OpenCV DNN super-resolution; never fetches model weights."""
from __future__ import annotations

import os
import threading
from pathlib import Path

import cv2
import numpy as np

_lock = threading.Lock()
_engine = None
_loaded_model: tuple[str, str, int] | None = None


def upscale(image: np.ndarray) -> tuple[np.ndarray, dict]:
    """Apply a configured x2 DNN model, or return the input with a skip reason."""
    algorithm = os.environ.get("OPENCV_SUPERRES_ALGORITHM", "fsrcnn").strip().lower()
    scale = 2
    configured = os.environ.get("OPENCV_SUPERRES_MODEL", "").strip()
    model_filenames = {"fsrcnn": "FSRCNN_x2.pb", "edsr": "EDSR_x2.pb", "espcn": "ESPCN_x2.pb"}
    default_filename = model_filenames.get(algorithm, f"{algorithm}_x2.pb")
    model_path = Path(configured).expanduser() if configured else (
        Path(__file__).resolve().parents[1] / "models" / default_filename
    )
    base = {
        "stage": "super_resolution",
        "algorithm": algorithm,
        "scale": scale,
        "model_path": str(model_path),
        "input_dimensions": [int(image.shape[1]), int(image.shape[0])],
    }
    if not hasattr(cv2, "dnn_superres"):
        return image, {**base, "executed": False, "skip_reason": "OpenCV was installed without the dnn_superres module"}
    if not model_path.is_file():
        return image, {**base, "executed": False, "skip_reason": "No local OpenCV super-resolution model is configured"}
    pixel_cap = int(os.environ.get("OPENCV_SUPERRES_MAX_OUTPUT_PIXELS", "50000000"))
    output_pixels = image.shape[0] * image.shape[1] * scale * scale
    if output_pixels > pixel_cap:
        return image, {**base, "executed": False, "skip_reason": f"2x output exceeds the configured {pixel_cap:,}-pixel safety limit"}
    global _engine, _loaded_model
    cache_key = (str(model_path.resolve()), algorithm, scale)
    try:
        with _lock:
            if _engine is None or _loaded_model != cache_key:
                engine = cv2.dnn_superres.DnnSuperResImpl_create()
                engine.readModel(str(model_path))
                engine.setModel(algorithm, scale)
                _engine, _loaded_model = engine, cache_key
            output = _engine.upsample(image)
    except Exception as exc:
        return image, {**base, "executed": False, "skip_reason": f"Local super-resolution model failed: {exc.__class__.__name__}"}
    if not isinstance(output, np.ndarray) or output.dtype != np.uint8 or output.shape[:2] != (image.shape[0] * scale, image.shape[1] * scale):
        return image, {**base, "executed": False, "skip_reason": "Super-resolution model returned an invalid image size or format"}
    return output, {
        **base,
        "executed": True,
        "output_dimensions": [int(output.shape[1]), int(output.shape[0])],
        "skip_reason": None,
    }
