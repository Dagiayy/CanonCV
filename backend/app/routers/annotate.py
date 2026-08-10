from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.config import RAW_DATASETS_DIR
from app.db import get_db
from app.services import annotate_ops
from app.services.annotate_ops import AnnotateError

router = APIRouter(tags=["annotate"])


def _active_taxonomy_classes(db: Session, project_id: str) -> list[dict]:
    tax = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=project_id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    return tax.classes if tax else []


def _class_by_id(db: Session, project_id: str) -> dict:
    return {c["id"]: c for c in _active_taxonomy_classes(db, project_id)}


def _canonical_by_name(db: Session, project_id: str) -> dict:
    return {c["name"].lower(): c for c in _active_taxonomy_classes(db, project_id)}


@router.get("/projects/{project_id}/annotate/folders")
def list_annotate_folders(project_id: str, db: Session = Depends(get_db)):
    return annotate_ops.list_folders()


@router.get("/projects/{project_id}/annotate/{folder_name}/images")
def list_annotate_images(
    project_id: str,
    folder_name: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=40, le=200),
    db: Session = Depends(get_db),
):
    try:
        folder = annotate_ops.resolve_folder(folder_name)
        items, has_more, total = annotate_ops.list_images(
            folder, offset, limit, _class_by_id(db, project_id), _canonical_by_name(db, project_id)
        )
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    for it in items:
        it["image_url"] = f"/media/annotate-image?folder={folder_name}&file={it['filename']}"
    return {"items": items, "offset": offset, "limit": limit, "has_more": has_more, "total": total}


@router.post("/projects/{project_id}/annotate/{folder_name}/images/{filename:path}/save")
def save_annotation(project_id: str, folder_name: str, filename: str, body: schemas.AnnotateSaveRequest, db: Session = Depends(get_db)):
    class_ids = set(_class_by_id(db, project_id))
    for b in body.boxes:
        if b.class_id not in class_ids:
            raise HTTPException(400, f"class_id {b.class_id} not in active taxonomy")
        if len(b.bbox) != 4:
            raise HTTPException(400, "bbox must be [xc, yc, w, h]")
    try:
        folder = annotate_ops.resolve_folder(folder_name)
        annotate_ops.save_annotation(folder, filename, [b.model_dump() for b in body.boxes])
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.post("/projects/{project_id}/annotate/{folder_name}/images/{filename:path}/crop")
def crop_annotation(project_id: str, folder_name: str, filename: str, body: schemas.AnnotateCropRequest, db: Session = Depends(get_db)):
    try:
        folder = annotate_ops.resolve_folder(folder_name)
        result = annotate_ops.crop_image(folder, filename, body.x1, body.y1, body.x2, body.y2, _canonical_by_name(db, project_id))
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    return result


@router.post("/projects/{project_id}/annotate/{folder_name}/images/{filename:path}/exclude")
def exclude_annotation(project_id: str, folder_name: str, filename: str, db: Session = Depends(get_db)):
    try:
        folder = annotate_ops.resolve_folder(folder_name)
        annotate_ops.exclude_image(folder, filename)
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.post("/projects/{project_id}/annotate/{folder_name}/images/{filename:path}/copy")
def copy_annotation(project_id: str, folder_name: str, filename: str, body: schemas.AnnotateCopyRequest, db: Session = Depends(get_db)):
    try:
        folder = annotate_ops.resolve_folder(folder_name)
        annotate_ops.copy_to_folder(folder, filename, body.target_folder)
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    return {"ok": True}


@router.post("/projects/{project_id}/annotate/{folder_name}/images/{filename:path}/augment")
def augment_annotation(project_id: str, folder_name: str, filename: str, body: schemas.AnnotateAugmentRequest, db: Session = Depends(get_db)):
    class_by_id = _class_by_id(db, project_id)
    try:
        folder = annotate_ops.resolve_folder(folder_name)
        result = annotate_ops.augment_image(folder, filename, body.ops, _canonical_by_name(db, project_id))
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    result["boxes"] = [
        {
            "class_id": b["class_id"],
            "label": class_by_id.get(b["class_id"], {}).get("name", f"class_{b['class_id']}"),
            "color_hex": class_by_id.get(b["class_id"], {}).get("color_hex", "#8e8e93"),
            "bbox": b["bbox"],
        }
        for b in result["boxes"]
    ]
    result["image_url"] = f"/media/annotate-image?folder={folder_name}&file={result['filename']}"
    return result


@router.post("/projects/{project_id}/annotate/{folder_name}/images/{filename:path}/auto-label")
def auto_label(project_id: str, folder_name: str, filename: str, db: Session = Depends(get_db)):
    from app.services.auto_label import suggest_boxes

    try:
        folder = annotate_ops.resolve_folder(folder_name)
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    img_path = annotate_ops.find_image(folder, filename)
    if img_path is None:
        raise HTTPException(404, "image not found")
    taxonomy_classes = _active_taxonomy_classes(db, project_id)
    try:
        suggestions = suggest_boxes(img_path, taxonomy_classes)
    except Exception as e:  # noqa: BLE001 — surface model/runtime errors to the UI, never crash silently
        raise HTTPException(500, f"auto-label failed: {type(e).__name__}: {e}")
    return {"boxes": suggestions}


@router.get("/media/annotate-image")
def annotate_image(folder: str, file: str):
    try:
        folder_path = annotate_ops.resolve_folder(folder)
    except AnnotateError as e:
        raise HTTPException(400, str(e))
    root = folder_path.resolve()
    found = annotate_ops.find_image(folder_path, file)
    candidates = [found] if found else []
    candidates.append(folder_path / "_excluded" / file)
    for c in candidates:
        target = c.resolve()
        if root not in target.parents and target != root:
            continue
        if target.exists():
            return FileResponse(target)
    raise HTTPException(404, "image not found")
