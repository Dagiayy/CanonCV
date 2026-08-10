from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.db import get_db

router = APIRouter(tags=["review-queue"])


@router.post("/review-queue/{item_id}/resolve", response_model=schemas.ReviewItemOut)
def resolve_item(item_id: str, body: schemas.ReviewResolveRequest, db: Session = Depends(get_db)):
    item = db.query(models.ReviewQueueItem).filter_by(id=item_id).one_or_none()
    if item is None:
        raise HTTPException(404, "review item not found")
    item.resolution_class_id = body.resolution_class_id
    item.status = "resolved"
    item.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.get("/media/review-crop/{item_id}")
def review_crop_image(item_id: str, db: Session = Depends(get_db)):
    item = db.query(models.ReviewQueueItem).filter_by(id=item_id).one_or_none()
    if item is None or not item.crop_thumbnail_path:
        raise HTTPException(404, "crop not found")
    p = Path(item.crop_thumbnail_path)
    if not p.exists():
        raise HTTPException(404, "crop file missing on disk")
    return FileResponse(p)
