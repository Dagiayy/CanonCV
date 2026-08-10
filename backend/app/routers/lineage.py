from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models
from app.db import get_db

router = APIRouter(tags=["lineage"])


def _run_lineage(db: Session, run: models.NormalizationRun) -> dict:
    mapping_table = db.query(models.MappingTable).filter_by(id=run.mapping_table_id).one_or_none()
    taxonomy = None
    if mapping_table:
        taxonomy = (
            db.query(models.ClassTaxonomy)
            .filter_by(project_id=run.project_id, version=mapping_table.taxonomy_version_used)
            .one_or_none()
        )
    return {
        "run_id": run.id,
        "status": run.status,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "output_path": run.output_path,
        "dataset": {"id": run.dataset.id, "name": run.dataset.name, "raw_path": run.dataset.raw_path},
        "mapping_table": (
            {"id": mapping_table.id, "version": mapping_table.version, "status": mapping_table.status}
            if mapping_table
            else None
        ),
        "taxonomy_version": taxonomy.version if taxonomy else None,
    }


@router.get("/runs/{run_id}/lineage")
def run_lineage(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.NormalizationRun).filter_by(id=run_id).one_or_none()
    if run is None:
        raise HTTPException(404, "run not found")
    return _run_lineage(db, run)


@router.get("/exports/{export_id}/lineage")
def export_lineage(export_id: str, db: Session = Depends(get_db)):
    export = db.query(models.Export).filter_by(id=export_id).one_or_none()
    if export is None:
        raise HTTPException(404, "export not found")

    split_plan = None
    run_ids: list[str] = []
    if export.split_plan_id:
        split_plan = db.query(models.SplitPlan).filter_by(id=export.split_plan_id).one_or_none()
        if split_plan:
            run_ids = sorted({a["run_id"] for a in split_plan.assignments})
    elif export.manifest.get("source_runs"):
        run_ids = [r["run_id"] for r in export.manifest["source_runs"]]

    runs = db.query(models.NormalizationRun).filter(models.NormalizationRun.id.in_(run_ids)).all()
    return {
        "export_id": export.id,
        "tag": export.tag,
        "version": export.version,
        "output_path": export.output_path,
        "split_plan": (
            {
                "id": split_plan.id,
                "name": split_plan.name,
                "version": split_plan.version,
                "group_by": split_plan.group_by,
                "seed": split_plan.seed,
            }
            if split_plan
            else None
        ),
        "source_runs": [_run_lineage(db, r) for r in runs],
    }


@router.get("/runs/diff")
def diff_runs(run_a: str, run_b: str, db: Session = Depends(get_db)):
    a = db.query(models.NormalizationRun).filter_by(id=run_a).one_or_none()
    b = db.query(models.NormalizationRun).filter_by(id=run_b).one_or_none()
    if a is None or b is None:
        raise HTTPException(404, "one or both runs not found")

    counts_a = (a.stats or {}).get("per_class_count_after", {})
    counts_b = (b.stats or {}).get("per_class_count_after", {})
    classes = sorted(set(counts_a) | set(counts_b))
    diff = []
    for c in classes:
        ca, cb = counts_a.get(c, 0), counts_b.get(c, 0)
        if ca != cb:
            diff.append({"class": c, "run_a_count": ca, "run_b_count": cb, "delta": cb - ca})

    return {
        "run_a": {"id": a.id, "dataset_name": a.dataset.name, "completed_at": a.completed_at.isoformat() if a.completed_at else None},
        "run_b": {"id": b.id, "dataset_name": b.dataset.name, "completed_at": b.completed_at.isoformat() if b.completed_at else None},
        "changed_classes": diff,
        "unchanged_class_count": len(classes) - len(diff),
    }
