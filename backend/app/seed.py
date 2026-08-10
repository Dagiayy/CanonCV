"""Idempotent seed script: creates Project #1 (AATB Bicycle Counting) with its
canonical 13-class taxonomy, and registers+scans every raw dataset folder found
under RAW_DATASETS_DIR. Safe to re-run.

Usage:
    .venv/Scripts/python.exe -m app.seed
"""
from __future__ import annotations

from app.config import RAW_DATASETS_DIR
from app.db import SessionLocal, init_db
from app import models
from app.services.scanner import scan_dataset

PROJECT_NAME = "AATB Bicycle Counting"

TAXONOMY = [
    {"id": 0, "name": "bicycle", "description": "Standard pedal or manual bicycle, single rider, no cargo structure", "color_hex": "#22c55e", "category": "primary"},
    {"id": 1, "name": "cargo_bike", "description": "Bicycle (pedal or e-assist) with an attached cargo structure", "color_hex": "#16a34a", "category": "primary"},
    {"id": 2, "name": "e_bike", "description": "Bicycle with visible electric motor/battery pack", "color_hex": "#15803d", "category": "primary"},
    {"id": 3, "name": "e_scooter", "description": "Standing electric scooter, rider standing", "color_hex": "#166534", "category": "primary"},
    {"id": 4, "name": "pedestrian", "description": "Person on foot along the corridor", "color_hex": "#14532d", "category": "primary"},
    {"id": 5, "name": "moped", "description": "Small motorized two-wheeler, pedal-less", "color_hex": "#f59e0b", "category": "secondary"},
    {"id": 6, "name": "motorcycle", "description": "Standard motorcycle, two-wheeled, no cargo/passenger cabin", "color_hex": "#d97706", "category": "secondary"},
    {"id": 7, "name": "car", "description": "Standard passenger car / sedan / hatchback / SUV", "color_hex": "#2563eb", "category": "secondary"},
    {"id": 8, "name": "minibus", "description": "Local shared-taxi minibus (Addis Ababa's dominant public transit vehicle)", "color_hex": "#7c3aed", "category": "secondary"},
    {"id": 9, "name": "mid_bus", "description": "Mid-sized bus, larger than a minibus, smaller than a full-size bus", "color_hex": "#9333ea", "category": "secondary"},
    {"id": 10, "name": "large_bus", "description": "Full-size public transit bus", "color_hex": "#a21caf", "category": "secondary"},
    {"id": 11, "name": "truck", "description": "Goods/cargo truck of any size, including pickup trucks", "color_hex": "#b91c1c", "category": "secondary"},
    {"id": 12, "name": "bajaj", "description": "Three-wheeled auto-rickshaw (Bajaj) — Addis Ababa vehicle profile", "color_hex": "#ea580c", "category": "secondary"},
]


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        project = db.query(models.Project).filter_by(name=PROJECT_NAME).one_or_none()
        if project is None:
            project = models.Project(
                name=PROJECT_NAME,
                description="Camera + Radar Based Bicycle Counting System for the Addis Ababa Transport Bureau (AATB).",
            )
            db.add(project)
            db.commit()
            db.refresh(project)
            print(f"created project {project.id} ({project.name})")
        else:
            print(f"project already exists: {project.id}")

        taxonomy = (
            db.query(models.ClassTaxonomy)
            .filter_by(project_id=project.id, is_active=True)
            .order_by(models.ClassTaxonomy.version.desc())
            .first()
        )
        if taxonomy is None:
            taxonomy = models.ClassTaxonomy(project_id=project.id, version=1, is_active=True, classes=TAXONOMY)
            db.add(taxonomy)
            db.commit()
            print(f"created taxonomy v1 with {len(TAXONOMY)} classes")
        else:
            print(f"taxonomy already exists: v{taxonomy.version} ({len(taxonomy.classes)} classes)")

        if not RAW_DATASETS_DIR.exists():
            print(f"WARNING: raw datasets dir not found: {RAW_DATASETS_DIR}")
            return

        existing_paths = {d.raw_path for d in db.query(models.Dataset).filter_by(project_id=project.id).all()}
        for entry in sorted(RAW_DATASETS_DIR.iterdir()):
            if not entry.is_dir():
                continue
            if "_normalized" in entry.name:
                # our own normalization output lands as a sibling of the raw dataset
                # it came from — never re-register it as if it were a new raw dataset
                continue
            # Stored relative to RAW_DATASETS_DIR (not resolved to an absolute host
            # path) so the same DB works whether the backend runs bare-metal or in
            # Docker — the two environments point RAW_DATASETS_DIR at different roots.
            raw_path = entry.name
            if raw_path in existing_paths:
                print(f"skip (already registered): {entry.name}")
                continue
            ds = models.Dataset(
                project_id=project.id,
                name=entry.name,
                raw_path=raw_path,
                source_format="custom",  # auto-detected during scan
                added_by_note="seeded from normalization datases/",
            )
            db.add(ds)
            db.commit()
            db.refresh(ds)
            scan_dataset(db, ds)
            print(
                f"registered + scanned: {ds.name} -> format={ds.source_format} "
                f"status={ds.scan_status} images={ds.num_images} annotations={ds.num_annotations} "
                f"labels={len(ds.source_classes)}"
            )
            if ds.scan_status == "error":
                print(f"    scan error: {ds.scan_error}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
