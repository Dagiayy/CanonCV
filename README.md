# CanonCV — Universal Computer Vision Dataset Engine & Annotation Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![YOLO26](https://img.shields.io/badge/AI_Assisted-YOLO26-blue?style=flat-square)](https://ultralytics.com)

**CanonCV** is a universal computer vision data preparation engine and interactive Annotation Studio designed to handle the complete dataset lifecycle before model training.

It solves the fundamental challenge of turning raw, multi-source, inconsistently-labeled object detection datasets into clean, canonically-mapped, quality-audited, and versioned datasets ready for high-performance AI training.

---

## Key Capabilities

### 🔄 1. Multi-Source Dataset Normalization & Merging
- **Pluggable Ingestion Adapters**: Ingest datasets in COCO JSON, YOLO txt, Pascal VOC XML, and folder-classification formats seamlessly.
- **Canonical Taxonomy Management**: Define, edit, and freeze custom project taxonomies dynamically through the UI.
- **Label Mapping Engine**: Build reviewed `source_label -> canonical_class_id` mapping tables with support for many-to-one remapping.
- **Zero-Guessing Review Queue**: Ambiguous source labels are automatically flagged for manual human review rather than silently guessed.
- **Unmapped Label Safety**: Unmapped labels default to logged drops to prevent dataset poisoning.

### 🎨 2. Interactive Annotation Studio & AI Assistance
- **Bounding Box Editor**: Interactive visual editor to draw, adjust, and delete bounding boxes on raw image folders or pre-labeled structured exports (`train/valid/test`).
- **Smart Label Translation**: Translates existing bounding boxes into the project's canonical taxonomy automatically when class names match, flagging mismatches for manual review.
- **YOLO26 Auto-Labeling**: Leverage YOLO26 backend integration for AI-assisted bounding box detection and auto-labeling.
- **Crop & Augmentation**: Interactive visual cropping, image processing, and data augmentation workflows.

### 🛡️ 3. Comprehensive Data Quality & Auditing
- **Near-Duplicate Detection**: Identify redundant images across datasets to avoid overfitting.
- **Bounding Box Sanity Checks**: Audit zero/negative-area boxes, out-of-bounds coordinates `[0,1]`, and aspect-ratio outliers.
- **Image Quality Scoring**: Automatic detection of blur, exposure anomalies, and corrupted files.
- **Class Balance Reporting**: Real-time per-class distribution stats pre- and post-normalization.

### ✂️ 4. Leakage-Free Dataset Splitting
- **Grouped & Stratified Splits**: Seed-reproducible train/val/test splitting algorithms that preserve rare-class balance and prevent data leakage across image variants.

### 📜 5. Immutable Versioning & Data Lineage
- **Traceable Provenance**: Every exported image and label is traceable back to its original source dataset, mapping version, and split assignment.
- **Versioned Snapshots**: Export standardized, immutable YOLO training snapshots (`data.yaml` + manifest) with complete historical audit trails.

---

## System Architecture

```
┌────────────────────────────────┐        ┌────────────────────────────────┐
│        Frontend Studio         │  REST  │         Backend Engine         │
│  React + Vite + Tailwind (SPA) │◄──────►│   FastAPI + SQLAlchemy (Py)    │
│                                │        │                                │
│  - Project & Taxonomy Manager  │        │  - Ingestion Adapters (COCO/   │
│  - Annotation Studio           │        │    YOLO/VOC/Classification)    │
│  - Mapping Builder & Review    │        │  - Mapping & Normalization ETL │
│  - Quality & Duplicate Dash    │        │  - YOLO26 Auto-Label & CV Ops │
│  - Splits & Lineage Explorer   │        │  - Quality Audit & BBox Sanity │
└────────────────────────────────┘        └────────────────────────────────┘
```

- **Backend**: FastAPI + SQLAlchemy + SQLite/PostgreSQL (ETL pipeline, image processing, mapping engine, quality checks).
- **Frontend**: React + Vite + Tailwind CSS SPA (Interactive Annotation Studio, Taxonomy Editor, Quality Dashboard, Lineage Explorer).
- **AI/CV Layer**: PyTorch / YOLO26 backend integration for automated inference and auto-labeling.

---

## Repo Structure

```
backend/                  FastAPI service & ETL engine — see backend/README.md
frontend/                 React + Vite SPA — see frontend/README.md
models/                   YOLO model weights — see models/README.md
data/                     Generated application database and state
normalization datases/    Raw source dataset storage directory
normalization.md          Complete architectural & design specification
docker-compose.yml        Multi-service orchestrator (backend :8000, frontend :5173)
```

---

## Quickstart

### Option A: Docker (Recommended)

1. **Download Model Weights** (for AI-assisted auto-labeling):
   ```bash
   python -c "from ultralytics import YOLO; YOLO('yolo26s-seg.pt')"
   mv yolo26s-seg.pt models/yolo26s-seg.pt
   ```

2. **Build and Run Services**:
   ```bash
   docker compose build
   docker compose up -d
   ```

3. **Initialize App State**:
   ```bash
   docker compose exec backend python -m app.seed
   ```

- **Frontend Studio**: http://localhost:5173
- **Backend API Docs**: http://localhost:8000/docs

---

### Option B: Bare-Metal Setup

#### Backend (FastAPI / Python)
```bash
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m app.seed
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

#### Frontend (React / Vite)
```bash
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

---

## Strict Normalization Rules

- **Zero Silent Assumptions**: Ambiguous source labels are routed to a human review queue.
- **Unmapped Labels Dropped Safely**: Unmapped class IDs are logged and dropped rather than forced into arbitrary fallback classes.
- **Mandatory Bounding Box Auditing**: Every normalized label undergoes strict coordinate check (`0 <= x, y, w, h <= 1`) and aspect ratio validation.
- **Immutable Raw Data**: Raw input datasets are strictly read-only; normalized exports are written as versioned output artifacts.

---

## License

This project is licensed under the [MIT License](LICENSE).
