from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(tags=["projects"])


@router.get("/projects", response_model=list[schemas.ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(models.Project).order_by(models.Project.created_at).all()


@router.post("/projects", response_model=schemas.ProjectOut)
def create_project(body: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = models.Project(name=body.name, description=body.description)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}/taxonomy", response_model=schemas.TaxonomyOut)
def get_active_taxonomy(project_id: str, db: Session = Depends(get_db)):
    tax = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    if tax is None:
        raise HTTPException(404, "no taxonomy defined for this project yet")
    return tax


@router.get("/projects/{project_id}/taxonomy/history", response_model=list[schemas.TaxonomyOut])
def get_taxonomy_history(project_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id)
        .order_by(models.ClassTaxonomy.version.desc())
        .all()
    )


@router.post("/projects/{project_id}/taxonomy", response_model=schemas.TaxonomyOut)
def create_taxonomy_version(project_id: str, body: schemas.TaxonomyCreate, db: Session = Depends(get_db)):
    ids = [c.id for c in body.classes]
    if len(ids) != len(set(ids)):
        raise HTTPException(400, "duplicate class ids in taxonomy")

    prev = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    if prev is not None:
        prev_ids = {c["id"] for c in prev.classes if not c.get("deprecated")}
        new_ids = {c.id for c in body.classes}
        removed = prev_ids - new_ids
        if removed:
            raise HTTPException(
                400,
                f"class ids {sorted(removed)} were removed instead of marked deprecated — "
                f"existing mapping tables reference them by id, they must stay in the list "
                f"with deprecated=true instead of being deleted",
            )
        prev.is_active = False

    version = (prev.version + 1) if prev else 1
    tax = models.ClassTaxonomy(
        project_id=project_id,
        version=version,
        is_active=True,
        classes=[c.model_dump() for c in body.classes],
    )
    db.add(tax)
    db.commit()
    db.refresh(tax)
    return tax


@router.get("/projects/{project_id}/datasets", response_model=list[schemas.DatasetOut])
def list_datasets(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.Dataset).filter_by(project_id=project_id).order_by(models.Dataset.added_at).all()


@router.get("/projects/{project_id}/runs", response_model=list[schemas.RunOut])
def list_runs(project_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.NormalizationRun)
        .filter_by(project_id=project_id)
        .order_by(models.NormalizationRun.started_at.desc())
        .all()
    )


@router.get("/projects/{project_id}/review-queue", response_model=list[schemas.ReviewItemOut])
def project_review_queue(project_id: str, status: str | None = None, db: Session = Depends(get_db)):
    dataset_ids = [d.id for d in db.query(models.Dataset.id).filter_by(project_id=project_id).all()]
    q = db.query(models.ReviewQueueItem).filter(models.ReviewQueueItem.dataset_id.in_(dataset_ids))
    if status:
        q = q.filter(models.ReviewQueueItem.status == status)
    return q.order_by(models.ReviewQueueItem.created_at.desc()).all()


@router.get("/projects/{project_id}/class-stats")
def project_class_stats(project_id: str, db: Session = Depends(get_db)):
    """Aggregate per-canonical-class instance counts across every successful run so far."""
    runs = (
        db.query(models.NormalizationRun)
        .filter_by(project_id=project_id, status="success")
        .all()
    )
    totals: dict[str, int] = {}
    for r in runs:
        for cls_name, count in (r.stats or {}).get("per_class_count_after", {}).items():
            totals[cls_name] = totals.get(cls_name, 0) + count
    return {"totals": totals, "runs_included": len(runs)}
