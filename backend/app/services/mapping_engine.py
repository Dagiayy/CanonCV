from __future__ import annotations

import json
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

from PIL import Image
from sqlalchemy.orm import Session

from app import models
from app.adapters import get_adapter
from app.adapters.base import Annotation, write_yolo_label
from app.config import REVIEW_CROPS_DIR
from app.services.paths import resolve_raw_path, to_portable_output_path
from app.services.validation import check_bbox

ProgressCallback = Callable[[int, int, str], None]


class MappingCoverageError(Exception):
    """Raised when a source label present in the dataset has no explicit mapping decision.
    Per the 'never guess silently' rule, this blocks the run entirely rather than defaulting."""


@dataclass
class _Entry:
    action: str  # map | drop | review
    target_class_id: int | None


def _entries_by_label(mapping_table: models.MappingTable) -> dict[str, _Entry]:
    out: dict[str, _Entry] = {}
    for e in mapping_table.entries:
        out[e["source_label"]] = _Entry(action=e["action"], target_class_id=e.get("target_class_id"))
    return out


def _class_name_by_id(taxonomy: models.ClassTaxonomy) -> dict[int, str]:
    return {c["id"]: c["name"] for c in taxonomy.classes}


def check_mapping_coverage(dataset: models.Dataset, mapping_table: models.MappingTable) -> list[str]:
    """Return every source label in the dataset scan that has no entry in the mapping table."""
    entries = _entries_by_label(mapping_table)
    return [lc["label"] for lc in dataset.source_classes if lc["label"] not in entries]


def _safe_output_name(split: str, image_path: Path) -> str:
    return f"{split}_{image_path.name}"


def run_normalization(
    db: Session,
    run: models.NormalizationRun,
    progress_cb: ProgressCallback | None = None,
) -> None:
    dataset: models.Dataset = run.dataset
    mapping_table: models.MappingTable = (
        db.query(models.MappingTable).filter_by(id=run.mapping_table_id).one()
    )
    taxonomy: models.ClassTaxonomy = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=run.project_id, version=mapping_table.taxonomy_version_used)
        .one()
    )
    project: models.Project = db.query(models.Project).filter_by(id=run.project_id).one()

    if mapping_table.status != "ready":
        raise ValueError("mapping table must be status=ready before a run can execute")

    missing = check_mapping_coverage(dataset, mapping_table)
    if missing:
        raise MappingCoverageError(
            f"{len(missing)} source label(s) have no mapping decision, run blocked: {sorted(missing)}"
        )

    entries = _entries_by_label(mapping_table)
    class_names = _class_name_by_id(taxonomy)
    adapter = get_adapter(dataset.source_format)

    # Saved as a sibling of the dataset's own raw folder — <dataset name>_normalized,
    # right next to <dataset name> — so the normalized result is easy to find without
    # digging through a separate output tree. Versioned/timestamped only on collision
    # (re-running the same mapping-table version, or a later version) so older runs
    # stay intact and traceable.
    dataset_dir = resolve_raw_path(dataset)
    dir_name = f"{_safe_name(dataset.name)}_normalized"
    run_dir = dataset_dir.parent / dir_name
    if run_dir.exists():
        run_dir = dataset_dir.parent / f"{dir_name}_v{mapping_table.version}"
    if run_dir.exists():
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        run_dir = dataset_dir.parent / f"{dir_name}_v{mapping_table.version}_{timestamp}"

    images_dir = run_dir / "images"
    labels_dir = run_dir / "labels"
    review_dir = run_dir / "review_queue"
    images_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    # Group annotations per image so each image gets one label file with all its boxes.
    by_image: dict[Path, list[Annotation]] = defaultdict(list)
    for ann in adapter.read_annotations(resolve_raw_path(dataset)):
        by_image[ann.image_path].append(ann)

    per_class_before: dict[str, int] = defaultdict(int)
    per_class_after: dict[str, int] = defaultdict(int)
    dropped_labels_breakdown: dict[str, int] = defaultdict(int)
    bbox_fatal_drops = 0
    bbox_warnings: list[dict] = []
    review_count = 0
    images_written = 0
    images_skipped_empty = 0
    annotations_processed = 0
    provenance_lines: list[str] = []

    total_images = len(by_image)
    for idx, (image_path, anns) in enumerate(sorted(by_image.items()), start=1):
        split = anns[0].split
        out_lines: list[str] = []
        for ann in anns:
            per_class_before[ann.source_label] += 1
            annotations_processed += 1
            entry = entries.get(ann.source_label)
            if entry is None:
                # Should not happen — coverage was checked above — but never guess silently.
                dropped_labels_breakdown[ann.source_label] += 1
                continue

            if entry.action == "drop":
                dropped_labels_breakdown[ann.source_label] += 1
                continue

            if entry.action == "review":
                review_count += 1
                _write_review_item(db, run, dataset, image_path, ann, entry.target_class_id)
                continue

            # action == map
            bbox_result = check_bbox(ann.bbox)
            if bbox_result.fatal:
                bbox_fatal_drops += 1
                bbox_warnings.append({"file": image_path.name, "issue": bbox_result.issue})
                continue
            if bbox_result.issue:
                bbox_warnings.append({"file": image_path.name, "issue": bbox_result.issue})

            class_name = class_names.get(entry.target_class_id, f"__unknown_class_{entry.target_class_id}")
            per_class_after[class_name] += 1
            xc, yc, w, h = ann.bbox
            out_lines.append(f"{entry.target_class_id} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")

        if out_lines:
            out_name = _safe_output_name(split, image_path)
            out_stem = Path(out_name).stem
            shutil.copy2(image_path, images_dir / out_name)
            write_yolo_label(out_lines, labels_dir / f"{out_stem}.txt")
            provenance_lines.append(
                json.dumps(
                    {
                        "output_image": out_name,
                        "source_dataset": dataset.name,
                        "source_split": split,
                        "original_filename": image_path.name,
                    }
                )
            )
            images_written += 1
        else:
            images_skipped_empty += 1

        if progress_cb and (idx % 10 == 0 or idx == total_images):
            progress_cb(idx, total_images, image_path.name)

    (run_dir / "provenance.jsonl").write_text("\n".join(provenance_lines) + "\n", encoding="utf-8")

    # per-class zero-instance warning (non-blocking, likely a mapping-table gap)
    for c in taxonomy.classes:
        if not c.get("deprecated") and per_class_after.get(c["name"], 0) == 0:
            bbox_warnings.append({"file": "*", "issue": f"canonical class '{c['name']}' ended run with 0 instances"})

    stats = {
        "per_class_count_before": dict(per_class_before),
        "per_class_count_after": dict(per_class_after),
        "dropped_label_count": sum(dropped_labels_breakdown.values()) + bbox_fatal_drops,
        "dropped_labels_breakdown": dict(dropped_labels_breakdown),
        "bbox_fatal_drops": bbox_fatal_drops,
        "bbox_warnings": bbox_warnings,
        "images_processed": total_images,
        "images_written": images_written,
        "images_skipped_empty_after_mapping": images_skipped_empty,
        "annotations_processed": annotations_processed,
        "review_queue_count": review_count,
    }

    manifest = {
        "run_id": run.id,
        "project_name": project.name,
        "dataset_id": dataset.id,
        "dataset_name": dataset.name,
        "mapping_table_id": mapping_table.id,
        "mapping_table_version": mapping_table.version,
        "taxonomy_version_used": mapping_table.taxonomy_version_used,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
    }
    (run_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    if review_count:
        review_dir.mkdir(parents=True, exist_ok=True)

    run.output_path = to_portable_output_path(run_dir)
    run.stats = stats


def _write_review_item(
    db: Session,
    run: models.NormalizationRun,
    dataset: models.Dataset,
    image_path: Path,
    ann: Annotation,
    suggested_class_id: int | None,
) -> None:
    crop_path = ""
    try:
        with Image.open(image_path) as im:
            xc, yc, w, h = ann.bbox
            px_x1 = max(0, int((xc - w / 2) * im.width))
            px_y1 = max(0, int((yc - h / 2) * im.height))
            px_x2 = min(im.width, int((xc + w / 2) * im.width))
            px_y2 = min(im.height, int((yc + h / 2) * im.height))
            crop = im.crop((px_x1, px_y1, px_x2, px_y2))
            crop_dir = REVIEW_CROPS_DIR / run.id
            crop_dir.mkdir(parents=True, exist_ok=True)
            crop_name = f"{image_path.stem}_{px_x1}_{px_y1}.jpg"
            crop.convert("RGB").save(crop_dir / crop_name, "JPEG")
            crop_path = str(crop_dir / crop_name)
    except Exception:
        crop_path = ""

    item = models.ReviewQueueItem(
        run_id=run.id,
        dataset_id=dataset.id,
        image_path=str(image_path),
        source_label=ann.source_label,
        bbox=list(ann.bbox),
        crop_thumbnail_path=crop_path,
        suggested_class_id=suggested_class_id,
        status="pending",
    )
    db.add(item)


def _safe_name(name: str) -> str:
    """Keep the original name (casing, spaces, dots) readable on disk — only strip
    characters that are invalid in a Windows/Linux path."""
    return "".join(c for c in name if c not in '<>:"/\\|?*').strip()
