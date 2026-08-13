from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app import models, schemas
from app.adapters import get_adapter
from app.config import MAX_SAMPLES_PER_LABEL, RAW_DATASETS_DIR
from app.db import get_db
from app.services.paths import resolve_raw_path
from app.services.scanner import scan_dataset

router = APIRouter(tags=["datasets"])


@router.post("/projects/{project_id}/datasets", response_model=schemas.DatasetOut)
def register_dataset(project_id: str, body: schemas.DatasetCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).one_or_none()
    if project is None:
        raise HTTPException(404, "project not found")
    raw_path = Path(body.raw_path)
    if not raw_path.exists():
        raise HTTPException(400, f"raw_path does not exist: {raw_path}")

    # Store relative to RAW_DATASETS_DIR when possible so the DB stays portable
    # across environments (bare-metal vs. Docker resolve RAW_DATASETS_DIR differently)
    # — an arbitrary path outside it only works in the environment it was registered from.
    try:
        stored_path = str(raw_path.resolve().relative_to(RAW_DATASETS_DIR.resolve()))
    except ValueError:
        stored_path = str(raw_path.resolve())

    dataset = models.Dataset(
        project_id=project_id,
        name=body.name,
        raw_path=stored_path,
        source_format=body.source_format,
        added_by_note=body.added_by_note,
        license_note=body.license_note,
        collection_note=body.collection_note,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return scan_dataset(db, dataset)


@router.get("/projects/{project_id}/available-raw-folders", response_model=list[schemas.AvailableRawFolder])
def available_raw_folders(project_id: str, db: Session = Depends(get_db)):
    """Every immediate subfolder of RAW_DATASETS_DIR, for a folder-structure-based
    import UI instead of hand-typing a path — the normal case for this system."""
    if not RAW_DATASETS_DIR.exists():
        return []
    registered = set()
    for d in db.query(models.Dataset).filter_by(project_id=project_id).all():
        try:
            registered.add(str(resolve_raw_path(d).resolve()))
        except Exception:
            pass
    out = []
    for entry in sorted(RAW_DATASETS_DIR.iterdir()):
        if not entry.is_dir():
            continue
        if "_normalized" in entry.name:
            # our own normalization output lands as a sibling of the raw dataset it
            # came from — never offer it back as if it were a new raw dataset to import
            continue
        out.append({"folder_name": entry.name, "already_registered": str(entry.resolve()) in registered})
    return out


@router.post("/projects/{project_id}/datasets/upload-batch")
async def upload_dataset_batch(
    project_id: str,
    folder_name: str = Form(...),
    relative_paths: list[str] = Form(...),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """Receives one batch of files from a browser-native folder picker
    (webkitdirectory — opens the OS's own folder browser, same as any file/image
    upload dialog) and writes them into RAW_DATASETS_DIR/<folder_name>/,
    preserving the picked folder's internal structure exactly. The frontend
    calls this repeatedly in batches for large datasets, then registers the
    finished folder via the existing /datasets/from-folder endpoint. Works
    identically whether the backend is bare-metal or in a container, since
    files travel over HTTP rather than needing a path the backend can already
    see on its own filesystem."""
    project = db.query(models.Project).filter_by(id=project_id).one_or_none()
    if project is None:
        raise HTTPException(404, "project not found")
    if folder_name != Path(folder_name).name:
        raise HTTPException(400, "folder_name must be a direct child of the raw datasets root")
    if len(relative_paths) != len(files):
        raise HTTPException(400, "relative_paths and files must be the same length")

    target_root = (RAW_DATASETS_DIR / folder_name).resolve()
    written = 0
    for rel_path, upload in zip(relative_paths, files):
        rel = Path(rel_path)
        if rel.is_absolute() or ".." in rel.parts:
            raise HTTPException(400, f"invalid relative path: {rel_path}")
        dest = (target_root / rel).resolve()
        if target_root not in dest.parents:
            raise HTTPException(400, f"path escapes target folder: {rel_path}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        content = await upload.read()
        dest.write_bytes(content)
        written += 1
    return {"written": written, "folder_name": folder_name}


@router.post("/projects/{project_id}/datasets/from-folder", response_model=schemas.DatasetOut)
def register_dataset_from_folder(project_id: str, body: schemas.DatasetFromFolderCreate, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter_by(id=project_id).one_or_none()
    if project is None:
        raise HTTPException(404, "project not found")

    # folder_name must be a direct child of RAW_DATASETS_DIR — reject anything that
    # could escape it (path separators, "..", or an absolute path).
    if body.folder_name != Path(body.folder_name).name:
        raise HTTPException(400, "folder_name must be a direct child of the raw datasets root, not a path")
    folder = RAW_DATASETS_DIR / body.folder_name
    if not folder.is_dir():
        raise HTTPException(400, f"no such folder under the raw datasets root: {body.folder_name}")

    dataset = models.Dataset(
        project_id=project_id,
        name=body.name or body.folder_name,
        raw_path=body.folder_name,  # stored relative — portable across environments
        source_format="custom",  # auto-detected during scan
        added_by_note=body.added_by_note,
        license_note=body.license_note,
        collection_note=body.collection_note,
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)
    return scan_dataset(db, dataset)


@router.get("/datasets/{dataset_id}", response_model=schemas.DatasetOut)
def get_dataset(dataset_id: str, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    return ds


@router.patch("/datasets/{dataset_id}/notes", response_model=schemas.DatasetOut)
def update_notes(dataset_id: str, body: schemas.DatasetNoteUpdate, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    if body.license_note is not None:
        ds.license_note = body.license_note
    if body.collection_note is not None:
        ds.collection_note = body.collection_note
    db.commit()
    db.refresh(ds)
    return ds


@router.post("/datasets/{dataset_id}/rescan", response_model=schemas.DatasetOut)
def rescan_dataset(dataset_id: str, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    return scan_dataset(db, ds)


@router.get("/datasets/{dataset_id}/samples")
def get_samples(
    dataset_id: str,
    label: str | None = Query(default=None),
    limit: int = Query(default=MAX_SAMPLES_PER_LABEL, le=30),
    db: Session = Depends(get_db),
):
    """Sample images + original boxes for visual spot-checking a source label before mapping it."""
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    if ds.scan_status != "scanned":
        raise HTTPException(400, "dataset has not been successfully scanned yet")

    adapter = get_adapter(ds.source_format)
    by_image: dict[str, dict] = {}
    for ann in adapter.read_annotations(resolve_raw_path(ds)):
        if label and ann.source_label != label:
            continue
        key = str(ann.image_path)
        entry = by_image.setdefault(
            key,
            {"image_path": key, "width": ann.image_width, "height": ann.image_height, "boxes": []},
        )
        entry["boxes"].append({"label": ann.source_label, "bbox": list(ann.bbox)})
        if len(by_image) >= limit and key in by_image:
            # once we have enough distinct images, stop scanning further (still finish this image's boxes)
            if len(by_image) > limit:
                break

    samples = list(by_image.values())[:limit]
    for s in samples:
        s["image_url"] = f"/media/raw-image?dataset_id={dataset_id}&path={s['image_path']}"
    return samples


@router.get("/datasets/{dataset_id}/images")
def browse_images(
    dataset_id: str,
    label: str | None = Query(default=None),
    split: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=24, le=100),
    db: Session = Depends(get_db),
):
    """Paginated browse of every image in the dataset with its original annotations
    rendered — full inspection, not just a handful of mapping-decision samples."""
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    if ds.scan_status != "scanned":
        raise HTTPException(400, "dataset has not been successfully scanned yet")

    # Deliberately a full scan, not an early-exit once "enough" distinct images are
    # seen: some source formats (COCO JSON in particular) list annotations in one
    # flat array, not grouped by image, so stopping early could truncate the boxes
    # of the last image on a page if that image's remaining boxes appear later in
    # the stream — a silent, hard-to-spot corruption exactly like the one CLAUDE.md
    # ยง4.3 warns about. Use GET .../images/count for cheap pagination totals instead
    # of trying to derive them from a truncated scan here.
    adapter = get_adapter(ds.source_format)
    by_image: dict[str, dict] = {}
    order: list[str] = []
    for ann in adapter.read_annotations(resolve_raw_path(ds)):
        if label and ann.source_label != label:
            continue
        if split and ann.split != split:
            continue
        key = str(ann.image_path)
        if key not in by_image:
            order.append(key)
            by_image[key] = {
                "image_path": key,
                "width": ann.image_width,
                "height": ann.image_height,
                "split": ann.split,
                "boxes": [],
            }
        by_image[key]["boxes"].append({"label": ann.source_label, "bbox": list(ann.bbox)})

    page_keys = order[offset : offset + limit]
    has_more = len(order) > offset + limit
    items = [by_image[k] for k in page_keys]
    for it in items:
        it["image_url"] = f"/media/raw-image?dataset_id={dataset_id}&path={it['image_path']}"
    return {"items": items, "offset": offset, "limit": limit, "has_more": has_more}


@router.get("/datasets/{dataset_id}/images/count")
def count_images(
    dataset_id: str,
    label: str | None = Query(default=None),
    split: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """Cheap companion to /images: single pass over annotations tracking only
    distinct image keys (no box lists retained), so the frontend can render a
    real "Page X of Y" instead of an unbounded "Load more" — a dataset can run
    into the thousands of images, and unpaginated browsing was the actual
    complaint (see CLAUDE.md working conventions on scaling to new sites)."""
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    if ds.scan_status != "scanned":
        raise HTTPException(400, "dataset has not been successfully scanned yet")

    adapter = get_adapter(ds.source_format)
    seen: set[str] = set()
    for ann in adapter.read_annotations(resolve_raw_path(ds)):
        if label and ann.source_label != label:
            continue
        if split and ann.split != split:
            continue
        seen.add(str(ann.image_path))
    return {"total": len(seen)}


@router.get("/media/raw-image")
def raw_image(dataset_id: str, path: str, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")
    raw_root = resolve_raw_path(ds).resolve()
    target = Path(path).resolve()
    if raw_root not in target.parents and target != raw_root:
        raise HTTPException(403, "path escapes dataset raw_path")
    if not target.exists():
        raise HTTPException(404, "image not found")
    return FileResponse(target)


# ---- Mapping tables ----


@router.get("/datasets/{dataset_id}/mapping", response_model=schemas.MappingTableOut | None)
def get_latest_mapping(dataset_id: str, db: Session = Depends(get_db)):
    mt = (
        db.query(models.MappingTable)
        .filter_by(dataset_id=dataset_id)
        .order_by(models.MappingTable.version.desc())
        .first()
    )
    return mt


@router.get("/datasets/{dataset_id}/mapping/history", response_model=list[schemas.MappingTableOut])
def get_mapping_history(dataset_id: str, db: Session = Depends(get_db)):
    return (
        db.query(models.MappingTable)
        .filter_by(dataset_id=dataset_id)
        .order_by(models.MappingTable.version.desc())
        .all()
    )


@router.post("/datasets/{dataset_id}/mapping", response_model=schemas.MappingTableOut)
def save_mapping(dataset_id: str, body: schemas.MappingTableSave, db: Session = Depends(get_db)):
    ds = db.query(models.Dataset).filter_by(id=dataset_id).one_or_none()
    if ds is None:
        raise HTTPException(404, "dataset not found")

    taxonomy = (
        db.query(models.ClassTaxonomy)
        .filter_by(project_id=ds.project_id, is_active=True)
        .order_by(models.ClassTaxonomy.version.desc())
        .first()
    )
    if taxonomy is None:
        raise HTTPException(400, "project has no active taxonomy yet")
    valid_ids = {c["id"] for c in taxonomy.classes}
    for e in body.entries:
        if e.action == "map" and e.target_class_id not in valid_ids:
            raise HTTPException(400, f"entry '{e.source_label}': target_class_id {e.target_class_id} not in active taxonomy")
        if e.action not in ("map", "drop", "review"):
            raise HTTPException(400, f"entry '{e.source_label}': invalid action '{e.action}'")

    latest = (
        db.query(models.MappingTable)
        .filter_by(dataset_id=dataset_id)
        .order_by(models.MappingTable.version.desc())
        .first()
    )
    # Editing an existing draft in place is fine; marking ready or editing a ready/archived
    # table always creates a new version so historical runs stay traceable.
    if latest is not None and latest.status == "draft" and not body.mark_ready:
        latest.entries = [e.model_dump() for e in body.entries]
        latest.notes = body.notes
        latest.created_by_note = body.created_by_note or latest.created_by_note
        mt = latest
    else:
        if latest is not None and latest.status == "draft":
            latest.status = "archived"
        version = (latest.version + 1) if latest else 1
        mt = models.MappingTable(
            dataset_id=dataset_id,
            version=version,
            taxonomy_version_used=taxonomy.version,
            entries=[e.model_dump() for e in body.entries],
            notes=body.notes,
            created_by_note=body.created_by_note,
            status="draft",
        )
        db.add(mt)

    if body.mark_ready:
        source_labels = {lc["label"] for lc in ds.source_classes}
        mapped_labels = {e.source_label for e in body.entries}
        missing = source_labels - mapped_labels
        if missing:
            raise HTTPException(400, f"cannot mark ready: {len(missing)} label(s) still unmapped: {sorted(missing)}")
        mt.status = "ready"

    db.commit()
    db.refresh(mt)

    if mt.status == "ready":
        _export_mapping_table_yaml(ds, mt)

    return mt


def _export_mapping_table_yaml(dataset: models.Dataset, mt: models.MappingTable) -> None:
    import yaml

    from app.config import MAPPING_TABLES_EXPORT_DIR

    doc = {
        "source_dataset": dataset.name,
        "source_format": dataset.source_format,
        "mapping_table_version": mt.version,
        "taxonomy_version_used": mt.taxonomy_version_used,
        "entries": [
            {"source_label": e["source_label"], "action": e["action"], "target_class_id": e.get("target_class_id")}
            for e in mt.entries
        ],
        "notes": mt.notes,
    }
    out_path = MAPPING_TABLES_EXPORT_DIR / f"{_slug(dataset.name)}_v{mt.version}.yaml"
    out_path.write_text(yaml.safe_dump(doc, sort_keys=False, allow_unicode=True), encoding="utf-8")


def _slug(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name).strip("_").lower()
