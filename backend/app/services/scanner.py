from __future__ import annotations

from dataclasses import asdict

from sqlalchemy.orm import Session

from app import models
from app.adapters import detect_adapter, get_adapter
from app.services.paths import resolve_raw_path


def scan_dataset(db: Session, dataset: models.Dataset) -> models.Dataset:
    raw_path = resolve_raw_path(dataset)
    if not raw_path.exists():
        dataset.scan_status = "error"
        dataset.scan_error = f"raw_path does not exist: {raw_path}"
        db.commit()
        return dataset

    try:
        if dataset.source_format and dataset.source_format != "custom":
            adapter = get_adapter(dataset.source_format)
        else:
            adapter = detect_adapter(raw_path)
            if adapter is None:
                dataset.source_format = "custom"
                dataset.scan_status = "error"
                dataset.scan_error = (
                    "Could not auto-detect a known format (yolo/voc_xml/coco_json/"
                    "folder_classification). This dataset needs a custom adapter or "
                    "a manual parser hint before it can be scanned."
                )
                db.commit()
                return dataset

        result = adapter.scan(raw_path)
        dataset.source_format = result.source_format
        dataset.num_images = result.num_images
        dataset.num_annotations = result.num_annotations
        dataset.source_classes = [asdict(lc) for lc in result.source_classes]
        dataset.image_stats = result.image_stats
        dataset.warnings = result.warnings
        dataset.scan_status = "scanned"
        dataset.scan_error = ""
    except Exception as e:  # noqa: BLE001 — surface any adapter failure to the UI, never crash silently
        dataset.scan_status = "error"
        dataset.scan_error = f"{type(e).__name__}: {e}"

    db.commit()
    db.refresh(dataset)
    return dataset
