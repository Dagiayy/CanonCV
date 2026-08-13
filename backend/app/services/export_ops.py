"""Export snapshots — §11/§12 of the platform roadmap. An export is an
immutable, versioned materialization of one or more normalization runs
(optionally split into train/val/test), with a manifest capturing the full
lineage a training run would need to be reproducible: source datasets,
mapping table versions, taxonomy version, split seed/ratios.

Never overwritten — a new export is always a new version. Re-running the same
split_plan_id + run set produces byte-identical output (source runs are
themselves immutable once successful), which is the whole point: any prior
export can be regenerated exactly since every input is versioned.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
from xml.dom import minidom

from PIL import Image

from app import models
from app.config import DATA_DIR
from app.services.paths import resolve_run_output

EXPORTS_DIR = DATA_DIR / "exports"


def _safe_name(name: str) -> str:
    return "".join(c for c in name if c not in '<>:"/\\|?*').strip()


class ExportError(Exception):
    pass


def build_manifest(
    export: models.Export,
    project: models.Project,
    split_plan: models.SplitPlan | None,
    runs: list[models.NormalizationRun],
    taxonomy: models.ClassTaxonomy | None,
) -> dict:
    return {
        "export_id": export.id,
        "project_name": project.name,
        "tag": export.tag,
        "version": export.version,
        "export_format": export.export_format,
        "yolo_variant": export.yolo_variant if export.export_format == "yolo" else None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "split_plan": (
            {
                "id": split_plan.id,
                "name": split_plan.name,
                "version": split_plan.version,
                "strategy": split_plan.strategy,
                "group_by": split_plan.group_by,
                "train_ratio": split_plan.train_ratio,
                "val_ratio": split_plan.val_ratio,
                "test_ratio": split_plan.test_ratio,
                "seed": split_plan.seed,
                "k_folds": split_plan.k_folds,
                "stats": split_plan.stats,
            }
            if split_plan
            else None
        ),
        "source_runs": [
            {
                "run_id": r.id,
                "dataset_id": r.dataset_id,
                "dataset_name": r.dataset.name,
                "mapping_table_id": r.mapping_table_id,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
                "stats": r.stats,
            }
            for r in runs
        ],
        "taxonomy_version": taxonomy.version if taxonomy else None,
        "classes": taxonomy.classes if taxonomy else [],
    }


def _collect_entries(split_plan: models.SplitPlan | None, runs: list[models.NormalizationRun]) -> list[dict]:
    """Unified (image_path, label_path, split, filename) list regardless of target
    export format — each format writer below consumes this the same way, so adding
    a format means adding one writer, not re-deriving source file resolution."""
    run_by_id = {r.id: r for r in runs}
    entries: list[dict] = []
    if split_plan:
        for a in split_plan.assignments:
            r = run_by_id.get(a["run_id"])
            if r is None or not r.output_path:
                continue
            src_img = resolve_run_output(r) / "images" / a["filename"]
            src_lbl = resolve_run_output(r) / "labels" / (Path(a["filename"]).stem + ".txt")
            if not src_img.exists():
                continue
            entries.append({"image_path": src_img, "label_path": src_lbl if src_lbl.exists() else None, "split": a["split"], "filename": a["filename"]})
    else:
        for r in runs:
            if not r.output_path:
                continue
            src_images = resolve_run_output(r) / "images"
            src_labels = resolve_run_output(r) / "labels"
            if not src_images.exists():
                continue
            for img in sorted(src_images.iterdir()):
                if not img.is_file():
                    continue
                lbl = src_labels / (img.stem + ".txt")
                entries.append({"image_path": img, "label_path": lbl if lbl.exists() else None, "split": "all", "filename": img.name})
    return entries


def _read_yolo_boxes(label_path: Path | None) -> list[tuple[int, float, float, float, float]]:
    if label_path is None or not label_path.exists():
        return []
    boxes = []
    for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) != 5:
            continue
        try:
            cls_id = int(float(parts[0]))
            xc, yc, w, h = (float(x) for x in parts[1:])
        except ValueError:
            continue
        boxes.append((cls_id, xc, yc, w, h))
    return boxes


def _write_yolo(out_dir: Path, entries: list[dict], class_names: list[str], split_plan: models.SplitPlan | None) -> int:
    images_written = 0
    for e in entries:
        split = e["split"]
        dst_img_dir = out_dir / "images" / split if split_plan else out_dir / "images"
        dst_lbl_dir = out_dir / "labels" / split if split_plan else out_dir / "labels"
        dst_img_dir.mkdir(parents=True, exist_ok=True)
        dst_lbl_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(e["image_path"], dst_img_dir / e["filename"])
        images_written += 1
        if e["label_path"] is not None:
            shutil.copy2(e["label_path"], dst_lbl_dir / (Path(e["filename"]).stem + ".txt"))

    if split_plan:
        splits_present = sorted({e["split"] for e in entries})
        yaml_lines = ["path: .", *[f"{s}: images/{s}" for s in splits_present], "", f"nc: {len(class_names)}", f"names: {class_names!r}"]
    else:
        yaml_lines = ["path: .", "train: images", "", f"nc: {len(class_names)}", f"names: {class_names!r}"]
    (out_dir / "data.yaml").write_text("\n".join(yaml_lines), encoding="utf-8")
    return images_written


def _write_coco_json(out_dir: Path, entries: list[dict], class_names: list[str]) -> int:
    """Re-serializes the normalized YOLO-format labels into standard COCO detection
    JSON (images/annotations/categories, pixel-space top-left xywh) — for tooling
    that consumes COCO rather than YOLO txt."""
    categories = [{"id": i, "name": name, "supercategory": "object"} for i, name in enumerate(class_names)]
    by_split: dict[str, list[dict]] = {}
    images_written = 0
    for e in entries:
        by_split.setdefault(e["split"], []).append(e)

    for split, split_entries in by_split.items():
        dst_img_dir = out_dir / "images" / split if split != "all" else out_dir / "images"
        dst_img_dir.mkdir(parents=True, exist_ok=True)
        images_json: list[dict] = []
        annotations_json: list[dict] = []
        next_ann_id = 1
        for img_id, e in enumerate(split_entries, start=1):
            shutil.copy2(e["image_path"], dst_img_dir / e["filename"])
            images_written += 1
            with Image.open(e["image_path"]) as im:
                w, h = im.width, im.height
            images_json.append({"id": img_id, "file_name": e["filename"], "width": w, "height": h})
            for cls_id, xc, yc, bw, bh in _read_yolo_boxes(e["label_path"]):
                px_w, px_h = bw * w, bh * h
                px_x, px_y = (xc * w) - px_w / 2, (yc * h) - px_h / 2
                annotations_json.append(
                    {
                        "id": next_ann_id,
                        "image_id": img_id,
                        "category_id": cls_id,
                        "bbox": [round(px_x, 2), round(px_y, 2), round(px_w, 2), round(px_h, 2)],
                        "area": round(px_w * px_h, 2),
                        "iscrowd": 0,
                    }
                )
                next_ann_id += 1
        doc = {"images": images_json, "annotations": annotations_json, "categories": categories}
        ann_dir = out_dir / "annotations"
        ann_dir.mkdir(parents=True, exist_ok=True)
        (ann_dir / f"instances_{split}.json").write_text(json.dumps(doc, indent=2), encoding="utf-8")
    return images_written


def _write_voc_xml(out_dir: Path, entries: list[dict], class_names: list[str]) -> int:
    """One Pascal-VOC XML annotation file per image, denormalized to pixel
    xmin/ymin/xmax/ymax — for tooling built around the VOC layout instead of COCO
    or YOLO txt."""
    images_written = 0
    for e in entries:
        split = e["split"]
        dst_img_dir = out_dir / "images" / split if split != "all" else out_dir / "images"
        dst_ann_dir = out_dir / "annotations" / split if split != "all" else out_dir / "annotations"
        dst_img_dir.mkdir(parents=True, exist_ok=True)
        dst_ann_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(e["image_path"], dst_img_dir / e["filename"])
        images_written += 1
        with Image.open(e["image_path"]) as im:
            w, h = im.width, im.height

        root = ET.Element("annotation")
        ET.SubElement(root, "filename").text = e["filename"]
        size_el = ET.SubElement(root, "size")
        ET.SubElement(size_el, "width").text = str(w)
        ET.SubElement(size_el, "height").text = str(h)
        ET.SubElement(size_el, "depth").text = "3"
        for cls_id, xc, yc, bw, bh in _read_yolo_boxes(e["label_path"]):
            name = class_names[cls_id] if 0 <= cls_id < len(class_names) else f"class_{cls_id}"
            xmin, ymin = (xc - bw / 2) * w, (yc - bh / 2) * h
            xmax, ymax = (xc + bw / 2) * w, (yc + bh / 2) * h
            obj = ET.SubElement(root, "object")
            ET.SubElement(obj, "name").text = name
            bnd = ET.SubElement(obj, "bndbox")
            ET.SubElement(bnd, "xmin").text = str(round(max(xmin, 0)))
            ET.SubElement(bnd, "ymin").text = str(round(max(ymin, 0)))
            ET.SubElement(bnd, "xmax").text = str(round(min(xmax, w)))
            ET.SubElement(bnd, "ymax").text = str(round(min(ymax, h)))
        pretty = minidom.parseString(ET.tostring(root)).toprettyxml(indent="  ")
        (dst_ann_dir / (Path(e["filename"]).stem + ".xml")).write_text(pretty, encoding="utf-8")
    return images_written


def run_export(
    db,
    export: models.Export,
    project: models.Project,
    split_plan: models.SplitPlan | None,
    runs: list[models.NormalizationRun],
    taxonomy: models.ClassTaxonomy | None,
) -> None:
    tag_part = f"{_safe_name(export.tag)}_" if export.tag else ""
    out_dir = EXPORTS_DIR / _safe_name(project.name) / f"{tag_part}v{export.version}"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    entries = _collect_entries(split_plan, runs)
    class_names = [c["name"] for c in (taxonomy.classes if taxonomy else []) if not c.get("deprecated")]

    if export.export_format == "coco_json":
        images_written = _write_coco_json(out_dir, entries, class_names)
    elif export.export_format == "voc_xml":
        images_written = _write_voc_xml(out_dir, entries, class_names)
    else:
        images_written = _write_yolo(out_dir, entries, class_names, split_plan)

    manifest = build_manifest(export, project, split_plan, runs, taxonomy)
    manifest["images_written"] = images_written
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    export.output_path = str(out_dir)
    export.manifest = manifest
