"""Generates the two project-level artifacts CLAUDE.md section 4.1 asks for:
data_card.md (provenance/license per source dataset) and class_stats.json
(per-canonical-class instance counts, pre- and post-mapping, across every
successful normalization run). Re-run any time after adding/normalizing datasets.

Usage:
    .venv/Scripts/python.exe -m app.generate_reports
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone

from app import models
from app.config import CLASS_STATS_PATH, DATA_CARD_PATH
from app.db import SessionLocal


def generate() -> None:
    db = SessionLocal()
    try:
        for project in db.query(models.Project).all():
            _write_data_card(db, project)
            _write_class_stats(db, project)
    finally:
        db.close()


def _write_data_card(db, project: models.Project) -> None:
    datasets = db.query(models.Dataset).filter_by(project_id=project.id).order_by(models.Dataset.name).all()
    lines = [
        f"# Data Card — {project.name}",
        "",
        f"Generated {datetime.now(timezone.utc).isoformat()}",
        "",
        "| Dataset | Format | Images | Annotations | License | Collection notes | Added |",
        "|---|---|---|---|---|---|---|",
    ]
    for d in datasets:
        lines.append(
            f"| {d.name} | {d.source_format} | {d.num_images} | {d.num_annotations} | "
            f"{d.license_note or '_unspecified_'} | {d.collection_note or '_unspecified_'} | "
            f"{d.added_at.date().isoformat()} |"
        )
    DATA_CARD_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_class_stats(db, project: models.Project) -> None:
    taxonomy = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project.id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    runs = db.query(models.NormalizationRun).filter_by(project_id=project.id, status="success").all()

    totals_after: dict[str, int] = defaultdict(int)
    totals_before: dict[str, int] = defaultdict(int)
    per_dataset: dict[str, dict] = {}
    for r in runs:
        stats = r.stats or {}
        for k, v in stats.get("per_class_count_after", {}).items():
            totals_after[k] += v
        for k, v in stats.get("per_class_count_before", {}).items():
            totals_before[k] += v
        per_dataset[r.dataset_id] = {
            "run_id": r.id,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "per_class_count_after": stats.get("per_class_count_after", {}),
        }

    low_instance_classes = []
    if taxonomy:
        for c in taxonomy.classes:
            if not c.get("deprecated") and totals_after.get(c["name"], 0) < 50:
                low_instance_classes.append(c["name"])

    doc = {
        "project": project.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "runs_included": len(runs),
        "per_class_count_before_mapping": dict(totals_before),
        "per_class_count_after_mapping": dict(totals_after),
        "low_instance_classes_flagged_below_50": low_instance_classes,
        "per_dataset_latest_contribution": per_dataset,
    }
    CLASS_STATS_PATH.write_text(json.dumps(doc, indent=2), encoding="utf-8")


if __name__ == "__main__":
    generate()
