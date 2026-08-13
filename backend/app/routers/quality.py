from __future__ import annotations

from collections import defaultdict
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models
from app.adapters import get_adapter
from app.db import get_db
from app.services import quality
from app.services.paths import resolve_raw_path, resolve_run_output

router = APIRouter(tags=["quality"])


def _get_dataset(db: Session, dataset_id: str) -> models.Dataset:
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    if ds.scan_status != "scanned":
        raise HTTPException(400, "dataset has not been successfully scanned yet")
    return ds


def _annotations_by_image(ds: models.Dataset) -> dict[str, list[tuple[str, list[float]]]]:
    adapter = get_adapter(ds.source_format)
    by_image: dict[str, list[tuple[str, list[float]]]] = defaultdict(list)
    for ann in adapter.read_annotations(resolve_raw_path(ds)):
        by_image[str(ann.image_path)].append((ann.source_label, list(ann.bbox)))
    return by_image


def _image_paths(ds: models.Dataset) -> list[Path]:
    adapter = get_adapter(ds.source_format)
    seen: set[Path] = set()
    for ann in adapter.read_annotations(resolve_raw_path(ds)):
        seen.add(ann.image_path)
    return sorted(seen)


@router.get("/datasets/{dataset_id}/quality/duplicates")
def duplicates(dataset_id: str, max_images: int = Query(default=quality.DEFAULT_MAX_IMAGES_FOR_NEAR_DUP), db: Session = Depends(get_db)):
    ds = _get_dataset(db, dataset_id)
    report = quality.find_duplicates(_image_paths(ds), max_images_for_near_dup=max_images)
    return {
        "images_scanned": report.images_scanned,
        "exact_duplicate_groups": report.exact_groups,
        "exact_duplicate_group_count": len(report.exact_groups),
        "near_duplicate_pairs": report.near_duplicate_pairs,
        "near_dup_scan_skipped": report.near_dup_scan_skipped,
    }


@router.get("/datasets/{dataset_id}/quality/validation")
def validation(dataset_id: str, db: Session = Depends(get_db)):
    ds = _get_dataset(db, dataset_id)
    report = quality.validate_annotations(_annotations_by_image(ds))
    return {
        "images_checked": report.images_checked,
        "annotations_checked": report.annotations_checked,
        "bbox_warnings": report.bbox_warnings,
        "orphan_images": report.orphan_images,
        "orphan_image_count": len(report.orphan_images),
    }


@router.get("/datasets/{dataset_id}/quality/outliers")
def outliers(dataset_id: str, db: Session = Depends(get_db)):
    ds = _get_dataset(db, dataset_id)
    return quality.outlier_report(_annotations_by_image(ds))


@router.get("/datasets/{dataset_id}/quality/image-quality")
def image_quality(dataset_id: str, sample_size: int = Query(default=300, le=2000), db: Session = Depends(get_db)):
    ds = _get_dataset(db, dataset_id)
    return quality.image_quality_report(_image_paths(ds), sample_size=sample_size)


@router.get("/datasets/{dataset_id}/quality/summary")
def quality_summary(
    dataset_id: str,
    max_images_for_near_dup: int = Query(default=quality.DEFAULT_MAX_IMAGES_FOR_NEAR_DUP),
    image_quality_sample_size: int = Query(default=300, le=2000),
    db: Session = Depends(get_db),
):
    """Everything the Quality Audit page needs for one dataset, in a single call —
    duplicates, bbox validation, outliers, image quality, per-dataset source-label
    balance, and a rolled-up health score — so selecting a dataset shows the full
    picture immediately instead of requiring four separate manual audit runs."""
    ds = _get_dataset(db, dataset_id)
    image_paths = _image_paths(ds)
    by_image = _annotations_by_image(ds)

    dup_report = quality.find_duplicates(image_paths, max_images_for_near_dup=max_images_for_near_dup)
    val_report = quality.validate_annotations(by_image)
    outliers = quality.outlier_report(by_image)
    img_quality = quality.image_quality_report(image_paths, sample_size=image_quality_sample_size)
    class_balance = quality.class_balance_from_source_classes(ds.source_classes)
    health = quality.compute_health_score(ds.num_images, dup_report, val_report, outliers, img_quality, class_balance)

    return {
        "dataset_id": dataset_id,
        "num_images": ds.num_images,
        "num_annotations": ds.num_annotations,
        "health": health,
        "class_balance": class_balance,
        "duplicates": {
            "images_scanned": dup_report.images_scanned,
            "exact_duplicate_groups": dup_report.exact_groups,
            "exact_duplicate_group_count": len(dup_report.exact_groups),
            "near_duplicate_pairs": dup_report.near_duplicate_pairs,
            "near_dup_scan_skipped": dup_report.near_dup_scan_skipped,
        },
        "validation": {
            "images_checked": val_report.images_checked,
            "annotations_checked": val_report.annotations_checked,
            "bbox_warnings": val_report.bbox_warnings,
            "orphan_images": val_report.orphan_images,
            "orphan_image_count": len(val_report.orphan_images),
        },
        "outliers": outliers,
        "image_quality": img_quality,
    }


@router.get("/projects/{project_id}/quality/class-balance")
def class_balance(project_id: str, db: Session = Depends(get_db)):
    tax = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    class_by_id = {c["id"]: c for c in (tax.classes if tax else [])}

    runs = db.query(models.NormalizationRun).filter_by(project_id=project_id, status="success").all()
    combined: dict[str, dict] = defaultdict(lambda: {"instances": 0, "images": 0})
    for r in runs:
        if not r.output_path:
            continue
        labels_dir = resolve_run_output(r) / "labels"
        for name, counts in quality.class_balance_from_labels_dir(labels_dir, class_by_id).items():
            combined[name]["instances"] += counts["instances"]
            combined[name]["images"] += counts["images"]

    # zero-count classes still worth surfacing, per CLAUDE.md's "flag low/absent classes early"
    for c in class_by_id.values():
        if not c.get("deprecated"):
            combined.setdefault(c["name"], {"instances": 0, "images": 0})

    return {"classes": dict(combined), "runs_included": len(runs)}
