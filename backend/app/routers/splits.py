from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.services import splitting

router = APIRouter(tags=["splits"])


@router.post("/projects/{project_id}/splits", response_model=schemas.SplitPlanOut)
def create_split(project_id: str, body: schemas.SplitPlanCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).one_or_none()
    if project is None:
        raise HTTPException(404, "project not found")

    if abs(body.train_ratio + body.val_ratio + body.test_ratio - 1.0) > 1e-6 and not body.k_folds:
        raise HTTPException(400, "train_ratio + val_ratio + test_ratio must sum to 1.0")
    if body.group_by not in ("none", "source_dataset"):
        raise HTTPException(400, "group_by must be 'none' or 'source_dataset'")

    runs = db.query(models.NormalizationRun).filter(models.NormalizationRun.id.in_(body.source_run_ids)).all()
    if len(runs) != len(body.source_run_ids):
        raise HTTPException(400, "one or more source_run_ids not found")
    bad = [r.id for r in runs if r.status != "success"]
    if bad:
        raise HTTPException(400, f"runs must be status=success to split from: {bad}")

    tax = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    class_by_id = {c["id"]: c for c in (tax.classes if tax else [])}

    assignments, stats = splitting.build_split(
        runs,
        class_by_id,
        group_by=body.group_by,
        train_ratio=body.train_ratio,
        val_ratio=body.val_ratio,
        test_ratio=body.test_ratio,
        seed=body.seed,
        k_folds=body.k_folds,
    )
    if not assignments:
        raise HTTPException(400, "no images found across the given runs")

    latest = (
        db.query(models.SplitPlan)
        .filter_by(project_id=project_id, name=body.name)
        .order_by(models.SplitPlan.version.desc())
        .first()
    )
    version = (latest.version + 1) if latest else 1

    plan = models.SplitPlan(
        project_id=project_id,
        name=body.name,
        version=version,
        created_by_note=body.created_by_note,
        source_run_ids=body.source_run_ids,
        strategy=body.strategy,
        group_by=body.group_by,
        train_ratio=body.train_ratio,
        val_ratio=body.val_ratio,
        test_ratio=body.test_ratio,
        seed=body.seed,
        k_folds=body.k_folds,
        status="ready",
        assignments=assignments,
        stats=stats,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/projects/{project_id}/splits", response_model=list[schemas.SplitPlanOut])
def list_splits(project_id: str, db: Session = Depends(get_db)):
    return db.query(models.SplitPlan).filter_by(project_id=project_id).order_by(models.SplitPlan.created_at.desc()).all()


@router.get("/splits/{split_id}", response_model=schemas.SplitPlanOut)
def get_split(split_id: str, db: Session = Depends(get_db)):
    plan = db.query(models.SplitPlan).filter_by(id=split_id).one_or_none()
    if plan is None:
        raise HTTPException(404, "split plan not found")
    return plan
