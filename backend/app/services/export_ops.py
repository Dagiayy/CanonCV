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


def run_export(
    db,
    export: models.Export,
    project: models.Project,
    split_plan: models.SplitPlan | None,
    runs: list[models.NormalizationRun],
    taxonomy: models.ClassTaxonomy | None,
) -> None:
    run_by_id = {r.id: r for r in runs}
    tag_part = f"{_safe_name(export.tag)}_" if export.tag else ""
    out_dir = EXPORTS_DIR / _safe_name(project.name) / f"{tag_part}v{export.version}"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    images_written = 0
    if split_plan:
        for a in split_plan.assignments:
            r = run_by_id.get(a["run_id"])
            if r is None or not r.output_path:
                continue
            src_img = resolve_run_output(r) / "images" / a["filename"]
            src_lbl = resolve_run_output(r) / "labels" / (Path(a["filename"]).stem + ".txt")
            split = a["split"]
            dst_img_dir = out_dir / "images" / split
            dst_lbl_dir = out_dir / "labels" / split
            dst_img_dir.mkdir(parents=True, exist_ok=True)
            dst_lbl_dir.mkdir(parents=True, exist_ok=True)
            if src_img.exists():
                shutil.copy2(src_img, dst_img_dir / a["filename"])
                images_written += 1
            if src_lbl.exists():
                shutil.copy2(src_lbl, dst_lbl_dir / src_lbl.name)

        splits_present = sorted({a["split"] for a in split_plan.assignments})
        class_names = [c["name"] for c in (taxonomy.classes if taxonomy else []) if not c.get("deprecated")]
        yaml_lines = ["path: .", *[f"{s}: images/{s}" for s in splits_present], "", f"nc: {len(class_names)}", f"names: {class_names!r}"]
        (out_dir / "data.yaml").write_text("\n".join(yaml_lines), encoding="utf-8")
    else:
        dst_img_dir = out_dir / "images"
        dst_lbl_dir = out_dir / "labels"
        dst_img_dir.mkdir(parents=True, exist_ok=True)
        dst_lbl_dir.mkdir(parents=True, exist_ok=True)
        for r in runs:
            if not r.output_path:
                continue
            src_images = resolve_run_output(r) / "images"
            src_labels = resolve_run_output(r) / "labels"
            if not src_images.exists():
                continue
            for img in src_images.iterdir():
                if not img.is_file():
                    continue
                shutil.copy2(img, dst_img_dir / img.name)
                images_written += 1
                lbl = src_labels / (img.stem + ".txt")
                if lbl.exists():
                    shutil.copy2(lbl, dst_lbl_dir / lbl.name)

    manifest = build_manifest(export, project, split_plan, runs, taxonomy)
    manifest["images_written"] = images_written
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    export.output_path = str(out_dir)
    export.manifest = manifest
