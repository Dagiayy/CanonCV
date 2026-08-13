import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    taxonomies: Mapped[list["ClassTaxonomy"]] = relationship(back_populates="project", cascade="all, delete-orphan")
    datasets: Mapped[list["Dataset"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class ClassTaxonomy(Base):
    __tablename__ = "class_taxonomies"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    is_active: Mapped[bool] = mapped_column(default=True)
    # [{ id, name, description, color_hex, category, deprecated }]
    classes: Mapped[list] = mapped_column(JSON, default=list)

    project: Mapped["Project"] = relationship(back_populates="taxonomies")


class Dataset(Base):
    __tablename__ = "datasets"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    raw_path: Mapped[str] = mapped_column(String, nullable=False)
    source_format: Mapped[str] = mapped_column(String, nullable=False)  # coco_json|yolo|voc_xml|folder_classification|custom
    added_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    added_by_note: Mapped[str] = mapped_column(Text, default="")

    scan_status: Mapped[str] = mapped_column(String, default="pending")  # pending|scanned|error
    scan_error: Mapped[str] = mapped_column(Text, default="")
    num_images: Mapped[int] = mapped_column(Integer, default=0)
    num_annotations: Mapped[int] = mapped_column(Integer, default=0)
    source_classes: Mapped[list] = mapped_column(JSON, default=list)  # [{label, count}]
    image_stats: Mapped[dict] = mapped_column(JSON, default=dict)
    warnings: Mapped[list] = mapped_column(JSON, default=list)  # corruption / pairing warnings from scan

    license_note: Mapped[str] = mapped_column(Text, default="")
    collection_note: Mapped[str] = mapped_column(Text, default="")

    project: Mapped["Project"] = relationship(back_populates="datasets")
    mapping_tables: Mapped[list["MappingTable"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")
    runs: Mapped[list["NormalizationRun"]] = relationship(back_populates="dataset", cascade="all, delete-orphan")


class MappingTable(Base):
    __tablename__ = "mapping_tables"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    taxonomy_version_used: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    created_by_note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String, default="draft")  # draft|ready|archived
    # [{ source_label, action: map|drop|review, target_class_id }]
    entries: Mapped[list] = mapped_column(JSON, default=list)
    notes: Mapped[str] = mapped_column(Text, default="")

    dataset: Mapped["Dataset"] = relationship(back_populates="mapping_tables")


class NormalizationRun(Base):
    __tablename__ = "normalization_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    mapping_table_id: Mapped[str] = mapped_column(ForeignKey("mapping_tables.id"), nullable=False)

    started_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|running|success|failed|cancelled
    output_path: Mapped[str] = mapped_column(String, default="")

    progress_percent: Mapped[float] = mapped_column(default=0.0)
    current_file: Mapped[str] = mapped_column(String, default="")

    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    log_excerpt: Mapped[str] = mapped_column(Text, default="")

    dataset: Mapped["Dataset"] = relationship(back_populates="runs")


class SplitPlan(Base):
    __tablename__ = "split_plans"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    created_by_note: Mapped[str] = mapped_column(Text, default="")

    source_run_ids: Mapped[list] = mapped_column(JSON, default=list)
    strategy: Mapped[str] = mapped_column(String, default="stratified")  # stratified | random
    group_by: Mapped[str] = mapped_column(String, default="none")  # none | source_dataset
    train_ratio: Mapped[float] = mapped_column(default=0.8)
    val_ratio: Mapped[float] = mapped_column(default=0.1)
    test_ratio: Mapped[float] = mapped_column(default=0.1)
    seed: Mapped[int] = mapped_column(Integer, default=42)
    k_folds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, default="ready")  # draft | ready

    # [{ run_id, filename, split (train|val|test, or fold_<n> for k-fold) }]
    assignments: Mapped[list] = mapped_column(JSON, default=list)
    # { split_name: { class_name: {instances, images} } }
    stats: Mapped[dict] = mapped_column(JSON, default=dict)


class Export(Base):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False)
    split_plan_id: Mapped[str | None] = mapped_column(ForeignKey("split_plans.id"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    tag: Mapped[str] = mapped_column(String, default="")  # optional semantic tag, e.g. "bicycle-dataset-v2.3"
    export_format: Mapped[str] = mapped_column(String, default="yolo")  # yolo | coco_json | voc_xml
    yolo_variant: Mapped[str] = mapped_column(String, default="yolo26")  # only meaningful when export_format == "yolo"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    status: Mapped[str] = mapped_column(String, default="queued")  # queued|running|success|failed
    output_path: Mapped[str] = mapped_column(String, default="")
    manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    log_excerpt: Mapped[str] = mapped_column(Text, default="")


class ReviewQueueItem(Base):
    __tablename__ = "review_queue_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("normalization_runs.id"), nullable=False)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False)
    image_path: Mapped[str] = mapped_column(String, nullable=False)
    source_label: Mapped[str] = mapped_column(String, nullable=False)
    bbox: Mapped[list | None] = mapped_column(JSON, nullable=True)  # [x,y,w,h] normalized, nullable for whole-image
    crop_thumbnail_path: Mapped[str] = mapped_column(String, default="")
    suggested_class_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")  # pending|resolved
    resolution_class_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
