from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db
from app.services.paths import resolve_run_output

router = APIRouter(tags=["runs"])


@router.get("/runs/{run_id}", response_model=schemas.RunOut)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(models.NormalizationRun).filter_by(id=run_id).one_or_none()
    if run is None:
        raise HTTPException(404, "run not found")
    return run


@router.get("/datasets/{dataset_id}/runs", response_model=list[schemas.RunOut])
def dataset_run_history(dataset_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.NormalizationRun)
        .filter_by(dataset_id=dataset_id)
        .order_by(models.NormalizationRun.started_at.desc())
        .all()
    )


@router.get("/runs/{run_id}/images")
def browse_normalized_images(
    run_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=24, le=100),
    db: Session = Depends(get_db),
):
    """Paginated browse of a completed run's normalized output — canonical-class
    boxes, in taxonomy colors, so a mapping decision can be visually verified
    against the actual result rather than trusted blind."""
    run = db.query(models.NormalizationRun).filter_by(id=run_id).one_or_none()
    if run is None:
        raise HTTPException(404, "run not found")
    if run.status != "success" or not run.output_path:
        raise HTTPException(400, "run has no normalized output (status must be success)")

    mapping_table = db.query(models.MappingTable).filter_by(id=run.mapping_table_id).one()
    taxonomy = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=run.project_id, version=mapping_table.taxonomy_version_used)
        .one_or_none()
    )
    class_by_id = {c["id"]: c for c in (taxonomy.classes if taxonomy else [])}

    images_dir = resolve_run_output(run) / "images"
    labels_dir = resolve_run_output(run) / "labels"
    if not images_dir.exists():
        raise HTTPException(404, "output images directory missing on disk")

    all_files = sorted(p.name for p in images_dir.iterdir() if p.is_file())
    page = all_files[offset : offset + limit]
    has_more = len(all_files) > offset + limit

    items = []
    for fname in page:
        label_path = labels_dir / (Path(fname).stem + ".txt")
        boxes = []
        if label_path.exists():
            for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                parts = line.split()
                if len(parts) != 5:
                    continue
                cls_id = int(float(parts[0]))
                xc, yc, w, h = (float(x) for x in parts[1:])
                cls = class_by_id.get(cls_id, {})
                boxes.append(
                    {
                        "class_id": cls_id,
                        "label": cls.get("name", f"class_{cls_id}"),
                        "color_hex": cls.get("color_hex", "#64748b"),
                        "bbox": [xc, yc, w, h],
                    }
                )
        items.append(
            {
                "file": fname,
                "boxes": boxes,
                "image_url": f"/media/normalized-image?run_id={run_id}&file={fname}",
            }
        )

    return {"items": items, "offset": offset, "limit": limit, "has_more": has_more, "total": len(all_files)}


@router.get("/media/normalized-image")
def normalized_image(run_id: str, file: str, db: Session = Depends(get_db)):
    run = db.query(models.NormalizationRun).filter_by(id=run_id).one_or_none()
    if run is None or not run.output_path:
        raise HTTPException(404, "run not found")
    images_dir = (resolve_run_output(run) / "images").resolve()
    target = (images_dir / file).resolve()
    if images_dir not in target.parents:
        raise HTTPException(403, "path escapes run output directory")
    if not target.exists():
        raise HTTPException(404, "image not found")
    return FileResponse(target)
