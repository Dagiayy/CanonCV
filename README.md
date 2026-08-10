# CanonCV — Universal Computer Vision Dataset Engine & Annotation Studio

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![YOLO26](https://img.shields.io/badge/AI_Assisted-YOLO26-blue?style=flat-square)](https://ultralytics.com)

**CanonCV** is an end-to-end computer vision data engine for dataset ETL, canonical label taxonomy normalization, data quality auditing, AI-assisted annotation, and versioned data lineage. 

While designed to handle dataset workflows for **any computer vision project and custom taxonomy**, this repository includes a full production-tested implementation seeded for multimodal urban traffic & NMT (Non-Motorized Transport) detection (developed under an ITS modernization pilot for the Addis Ababa Transport Bureau).

Model training itself is out of scope here; see [`normalization.md`](file:///d:/GREEN/AATB%20CV/normalization.md) for the full design rationale.

## What's in here

- **Dataset normalization** — scan any of several source formats, build a
  reviewed source-label → canonical-class mapping table per dataset, run the
  remap, get canonical YOLO-format output with full provenance.
- **Annotation Studio** — draw, edit, and delete bounding boxes by hand on any
  image folder; works on raw/unlabeled folders (label from scratch) *and*
  already-labeled structured exports (e.g. Roboflow-style `train/valid/test`)
  — existing labels get safely translated to the canonical taxonomy where the
  class name matches exactly, and flagged for manual review otherwise (never
  guessed). Includes YOLO26-assisted auto-labeling, crop, and augmentation.
- **Data quality** — near-duplicate detection, bbox sanity checks, blur/exposure
  scoring, per-class balance reporting.
- **Splitting** — stratified + grouped train/val/test splits, reproducible by
  seed, with rare-class-aware balancing.
- **Export & lineage** — immutable versioned export snapshots (`data.yaml` +
  manifest) that trace every image back through its split, mapping table
  version, and source dataset.

## Canonical class taxonomy

Frozen 13-class taxonomy (SoR's 12 + `bajaj`, added for Addis Ababa's traffic
mix). Class IDs are fixed — don't renumber once mapping work has started on a
dataset.

| ID | Class | ID | Class | ID | Class |
|---|---|---|---|---|---|
| 0 | bicycle | 5 | moped | 10 | large_bus |
| 1 | cargo_bike | 6 | motorcycle | 11 | truck |
| 2 | e_bike | 7 | car | 12 | bajaj |
| 3 | e_scooter | 8 | minibus | | |
| 4 | pedestrian | 9 | mid_bus | | |

Primary classes (0–4, NMT focus) target ≥95% accuracy / ≤5% false positives;
secondary classes (5–12, mixed traffic) target ≥90%. The taxonomy is editable
per-project through the UI (Taxonomy page) — this table is the seeded default.

## Repo structure

```
backend/                  FastAPI + SQLAlchemy service — see backend/README.md
frontend/                 React + Vite + Tailwind SPA  — see frontend/README.md
models/                   YOLO26 weights (gitignored)  — see models/README.md
normalization datases/    Raw source datasets (gitignored) — see its README.md
data/                     Generated app state (gitignored) — see data/README.md
normalization.md          Design spec for the normalization system
docker-compose.yml        Two services: backend (:8000), frontend (:5173)
```

Each of the gitignored data directories has its own `README.md` that *is*
tracked, explaining what belongs there and how to (re)populate it.

## Quickstart (Docker, recommended)

```bash
# 1. Get the model weights (only needed for auto-label — see models/README.md)
python -c "from ultralytics import YOLO; YOLO('yolo26s-seg.pt')"
mv yolo26s-seg.pt models/yolo26s-seg.pt

# 2. Put your raw datasets under normalization datases/<name>/ (see its README.md)

# 3. Build and run
docker compose build
docker compose up -d

# 4. First-time only: seed Project #1's taxonomy + register/scan the raw datasets
docker compose exec backend python -m app.seed
```

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

`./normalization datases` is mounted **read-write** (normalized output is
written as a sibling folder next to each raw dataset, so the container needs
write access there — raw files themselves are never modified); `./data` holds
the SQLite DB and all other generated state; `./models` is mounted read-only-
in-spirit at `/app/models`.

### Where normalized output goes

A completed run writes `<dataset folder>_normalized/{images,labels,manifest.json,provenance.jsonl}`
as a **sibling of the raw dataset's own folder** — e.g. next to
`normalization datases/Smart Street Lighting.v7i.yolov11/` you'll find
`normalization datases/Smart Street Lighting.v7i.yolov11_normalized/`.
Re-running a later mapping-table version appends `_v<version>` (and a
timestamp on further collision) so earlier runs are never overwritten.

## Quickstart (bare-metal)

```bash
# backend
cd backend
python -m venv .venv
./.venv/Scripts/python.exe -m pip install --index-url https://download.pytorch.org/whl/cpu torch
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m pip install --force-reinstall --no-deps opencv-python-headless
./.venv/Scripts/python.exe -m app.seed        # one-time: seed taxonomy + scan datasets
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload

# frontend (separate shell)
cd frontend
npm install
npm run dev   # http://localhost:5173, proxies /api to localhost:8000
```

See `backend/README.md` and `frontend/README.md` for structure, env vars, and
more detail.

## Dataset normalization rules (summary)

- **Never guess silently.** Ambiguous source labels (e.g. a generic "van" or
  "bus" that could map to more than one canonical class) go to a review queue,
  never an auto-assigned best-guess.
- **Many-to-one mapping is fine** ("bike"/"cyclist"/"pedal_cycle" → `bicycle`).
  One-to-many is not possible from a label string alone — route those to
  review or exclude that class distinction from training.
- **Unmapped labels default to drop**, not a silent catch-all class. Every
  drop is logged with a count.
- **Bounding box sanity checks are mandatory** post-conversion: no zero/negative-
  area boxes, nothing outside `[0,1]`, aspect-ratio outliers flagged for review.
- **Every image is traceable** back to its source dataset and original filename.

Full rationale in `normalization.md`.

## Status

Normalization pipeline, Annotation Studio (manual + AI-assisted labeling),
data quality checks, splitting, and export/lineage are implemented and
smoke-tested end-to-end against real datasets. Model training is a later
phase, not covered by this repo.
