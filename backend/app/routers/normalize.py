from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.services.jobs import schedule_run
from app.services.mapping_engine import check_mapping_coverage

router = APIRouter(tags=["normalize"])


@router.post("/normalize/run")
def run_normalize(
    body: schemas.NormalizeRunRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    job_ids: list[str] = []
    errors: dict[str, str] = {}

    for dataset_id in body.dataset_ids:
        ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
        if ds is None:
            errors[dataset_id] = "dataset not found"
            continue
        mt = (
            db.query(models.MappingTable)
            .filter_by(dataset_id=dataset_id, status="ready")
            .order_by(models.MappingTable.version.desc())
            .first()
        )
        if mt is None:
            errors[dataset_id] = "no mapping table with status=ready for this dataset"
            continue
        missing = check_mapping_coverage(ds, mt)
        if missing:
            errors[dataset_id] = f"mapping table missing {len(missing)} label(s): {sorted(missing)}"
            continue

        run = models.NormalizationRun(
            project_id=ds.project_id,
            dataset_id=ds.id,
            mapping_table_id=mt.id,
            status="queued",
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        job_ids.append(run.id)
        background_tasks.add_task(_schedule, run.id)

    if not job_ids and errors:
        raise HTTPException(400, {"errors": errors})
    return {"job_ids": job_ids, "errors": errors}


async def _schedule(run_id: str) -> None:
    await schedule_run(run_id)


@router.get("/jobs/{job_id}", response_model=schemas.RunOut)
def get_job(job_id: str, db: Session = Depends(get_db)):
    run = db.query(models.NormalizationRun).filter_by(id=job_id).one_or_none()
    if run is None:
        raise HTTPException(404, "job not found")
    return run
