"""Draft box suggestions from pretrained YOLO26-seg, for human review inside the
Annotation Studio. Nothing here writes to disk — it only returns suggestions;
saving them is a separate, explicit human action (annotate_ops.save_annotation).

Only the traffic-relevant COCO classes are surfaced. A canonical class is
pre-filled only when the COCO category maps unambiguously (bicycle, person,
motorcycle, car, truck); "bus" gets a drawn box but no pre-filled class, since a
generic COCO "bus" detection can't distinguish minibus/mid_bus/large_bus — same
never-guess-on-ambiguous-mapping rule used everywhere else in this app.
"""
from __future__ import annotations

import os
from pathlib import Path

from app.config import PROJECT_ROOT

MODEL_PATH = Path(os.environ.get("YOLO26_WEIGHTS", PROJECT_ROOT / "models" / "yolo26s-seg.pt"))

COCO_TO_CANONICAL = {
    "bicycle": "bicycle",
    "person": "pedestrian",
    "motorcycle": "motorcycle",
    "car": "car",
    "truck": "truck",
}
COCO_UNMAPPED_BUT_RELEVANT = {"bus"}
RELEVANT_COCO = set(COCO_TO_CANONICAL) | COCO_UNMAPPED_BUT_RELEVANT

_model = None


def _get_model():
    global _model
    if _model is None:
        from ultralytics import YOLO

        if not MODEL_PATH.exists():
            raise RuntimeError(f"YOLO26 weights not found at {MODEL_PATH}")
        _model = YOLO(str(MODEL_PATH))
    return _model


def suggest_boxes(image_path: Path, taxonomy_classes: list[dict], confidence: float = 0.35) -> list[dict]:
    model = _get_model()
    results = model.predict(str(image_path), verbose=False, conf=confidence)
    by_name = {c["name"]: c for c in taxonomy_classes if not c.get("deprecated")}

    r = results[0]
    if r.boxes is None or len(r.boxes) == 0:
        return []

    names = model.names
    out = []
    for box in r.boxes:
        coco_name = names.get(int(box.cls[0]), "")
        if coco_name not in RELEVANT_COCO:
            continue
        xc, yc, w, h = (float(v) for v in box.xywhn[0])
        canonical_name = COCO_TO_CANONICAL.get(coco_name)
        cls = by_name.get(canonical_name) if canonical_name else None
        out.append(
            {
                "class_id": cls["id"] if cls else None,
                "label": cls["name"] if cls else None,
                "color_hex": cls["color_hex"] if cls else "#8e8e93",
                "bbox": [xc, yc, w, h],
                "confidence": round(float(box.conf[0]), 3),
                "coco_label": coco_name,
                "suggested": True,
            }
        )
    return out
