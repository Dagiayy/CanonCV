from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Project ----
class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectOut(ORMModel):
    id: str
    name: str
    description: str
    created_at: datetime


# ---- Taxonomy ----
class TaxonomyClass(BaseModel):
    id: int
    name: str
    description: str = ""
    color_hex: str = "#64748b"
    category: str = ""
    deprecated: bool = False


class TaxonomyCreate(BaseModel):
    classes: list[TaxonomyClass]
    created_by_note: str = ""


class TaxonomyOut(ORMModel):
    id: str
    project_id: str
    version: int
    created_at: datetime
    is_active: bool
    classes: list[TaxonomyClass]


# ---- Dataset ----
class DatasetCreate(BaseModel):
    name: str
    raw_path: str
    source_format: str = "custom"  # coco_json | yolo | voc_xml | folder_classification | custom (auto-detect if custom)
    added_by_note: str = ""
    license_note: str = ""
    collection_note: str = ""


class DatasetFromFolderCreate(BaseModel):
    folder_name: str  # must be a direct child of RAW_DATASETS_DIR
    name: str | None = None  # defaults to folder_name
    added_by_note: str = ""
    license_note: str = ""
    collection_note: str = ""


class AvailableRawFolder(BaseModel):
    folder_name: str
    already_registered: bool


class LabelCountOut(BaseModel):
    label: str
    count: int


class DatasetOut(ORMModel):
    id: str
    project_id: str
    name: str
    raw_path: str
    source_format: str
    added_at: datetime
    added_by_note: str
    scan_status: str
    scan_error: str
    num_images: int
    num_annotations: int
    source_classes: list[LabelCountOut]
    image_stats: dict
    warnings: list[str]
    license_note: str
    collection_note: str


class DatasetNoteUpdate(BaseModel):
    license_note: str | None = None
    collection_note: str | None = None


# ---- Mapping ----
class MappingEntry(BaseModel):
    source_label: str
    action: str  # map | drop | review
    target_class_id: int | None = None


class MappingTableSave(BaseModel):
    entries: list[MappingEntry]
    notes: str = ""
    created_by_note: str = ""
    mark_ready: bool = False


class MappingTableOut(ORMModel):
    id: str
    dataset_id: str
    version: int
    taxonomy_version_used: int
    created_at: datetime
    created_by_note: str
    status: str
    entries: list[MappingEntry]
    notes: str


# ---- Runs / Jobs ----
class NormalizeRunRequest(BaseModel):
    dataset_ids: list[str]


class RunOut(ORMModel):
    id: str
    project_id: str
    dataset_id: str
    mapping_table_id: str
    started_at: datetime
    completed_at: datetime | None
    status: str
    output_path: str
    progress_percent: float
    current_file: str
    stats: dict
    log_excerpt: str


# ---- Review Queue ----
class ReviewItemOut(ORMModel):
    id: str
    run_id: str
    dataset_id: str
    image_path: str
    source_label: str
    bbox: list[float] | None
    crop_thumbnail_path: str
    suggested_class_id: int | None
    status: str
    resolution_class_id: int | None
    resolved_at: datetime | None
    created_at: datetime


class ReviewResolveRequest(BaseModel):
    resolution_class_id: int | None = None  # None => confirm-drop


# ---- Annotation Studio ----
class AnnotateBox(BaseModel):
    class_id: int
    bbox: list[float]  # [xc, yc, w, h], normalized


class AnnotateSaveRequest(BaseModel):
    boxes: list[AnnotateBox]


class AnnotateCropRequest(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class AnnotateCopyRequest(BaseModel):
    target_folder: str


class AnnotateAugmentRequest(BaseModel):
    ops: list[str]


# ---- Splitting ----
class SplitPlanCreate(BaseModel):
    name: str
    source_run_ids: list[str]
    strategy: str = "stratified"
    group_by: str = "none"  # none | source_dataset
    train_ratio: float = 0.8
    val_ratio: float = 0.1
    test_ratio: float = 0.1
    seed: int = 42
    k_folds: int | None = None
    created_by_note: str = ""


class SplitPlanOut(ORMModel):
    id: str
    project_id: str
    name: str
    version: int
    created_at: datetime
    created_by_note: str
    source_run_ids: list[str]
    strategy: str
    group_by: str
    train_ratio: float
    val_ratio: float
    test_ratio: float
    seed: int
    k_folds: int | None
    status: str
    assignments: list[dict]
    stats: dict


# ---- Export ----
class ExportCreate(BaseModel):
    split_plan_id: str | None = None
    run_ids: list[str] | None = None  # used when split_plan_id is None: export without splitting
    tag: str = ""
    export_format: str = "yolo"  # yolo | coco_json | voc_xml
    yolo_variant: str = "yolo26"  # e.g. yolo26 | yolo11 | yolov8 | custom free text — only used when export_format == "yolo"


class ExportOut(ORMModel):
    id: str
    project_id: str
    split_plan_id: str | None
    version: int
    tag: str
    export_format: str
    yolo_variant: str
    created_at: datetime
    status: str
    output_path: str
    manifest: dict
    log_excerpt: str
