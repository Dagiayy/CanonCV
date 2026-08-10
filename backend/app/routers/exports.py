from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.services import export_ops

router = APIRouter(tags=["exports"])


def _active_taxonomy(db: Session, project_id: str) -> models.ClassTaxonomy | None:
    return (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )


@router.post("/projects/{project_id}/exports", response_model=schemas.ExportOut)
def create_export(project_id: str, body: schemas.ExportCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).one_or_none()
    if project is None:
        raise HTTPException(404, "project not found")

    split_plan = None
    if body.split_plan_id:
        split_plan = db.query(models.SplitPlan).filter_by(id=body.split_plan_id, project_id=project_id).one_or_none()
        if split_plan is None:
            raise HTTPException(404, "split plan not found")
        run_ids = list({a["run_id"] for a in split_plan.assignments})
    elif body.run_ids:
        run_ids = body.run_ids
    else:
        raise HTTPException(400, "either split_plan_id or run_ids is required")

    runs = db.query(models.NormalizationRun).filter(models.NormalizationRun.id.in_(run_ids)).all()
    if len(runs) != len(run_ids):
        raise HTTPException(400, "one or more runs not found")
    bad = [r.id for r in runs if r.status != "success"]
    if bad:
        raise HTTPException(400, f"runs must be status=success to export: {bad}")

    taxonomy = _active_taxonomy(db, project_id)

    latest = (
        db.query(models.Export)
        .filter_by(project_id=project_id)
        .order_by(models.Export.version.desc())
        .first()
    )
    version = (latest.version + 1) if latest else 1

    export = models.Export(project_id=project_id, split_plan_id=body.split_plan_id, version=version, tag=body.tag, status="running")
    db.add(export)
    db.commit()
    db.refresh(export)

    try:
        export_ops.run_export(db, export, project, split_plan, runs, taxonomy)
        export.status = "success"
    except Exception as e:  # noqa: BLE001
        export.status = "failed"
        export.log_excerpt = f"{type(e).__name__}: {e}"
    db.commit()
    db.refresh(export)
    return export


@router.get("/projects/{project_id}/exports", response_model=list[schemas.ExportOut])
def list_exports(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.Export).filter_by(project_id=project_id).order_by(models.Export.created_at.desc()).all()


@router.get("/exports/{export_id}", response_model=schemas.ExportOut)
def get_export(export_id: str, db: Session = Depends(get_db)):
    export = db.query(models.Export).filter_by(id=export_id).one_or_none()
    if export is None:
        raise HTTPException(404, "export not found")
    return export
