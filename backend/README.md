# Backend

FastAPI + SQLAlchemy (SQLite) service for dataset normalization, annotation,
data quality, splitting, export, and lineage. See the root `README.md` for the
overall project and `normalization.md` for the design spec this implements.

## Run bare-metal

```bash
python -m venv .venv
./.venv/Scripts/python.exe -m pip install --index-url https://download.pytorch.org/whl/cpu torch
./.venv/Scripts/python.exe -m pip install -r requirements.txt
./.venv/Scripts/python.exe -m pip install --force-reinstall --no-deps opencv-python-headless

./.venv/Scripts/python.exe -m app.seed        # one-time: seed taxonomy + scan raw datasets
./.venv/Scripts/python.exe -m uvicorn app.main:app --reload
```

API docs (Swagger UI) at `http://localhost:8000/docs` once running.

CPU-only torch and the headless opencv swap keep the install light and avoid
needing X11/GL system libraries — see `Dockerfile` for the same steps
containerized, and its comments for why.

## Structure

```
app/
  main.py           FastAPI app, router registration, CORS
  config.py         Paths (RAW_DATASETS_DIR, DATA_DIR, ...), env var overrides
  models.py         SQLAlchemy models
  schemas.py        Pydantic request/response schemas
  db.py             Session/engine setup
  seed.py           One-time: seed canonical taxonomy v1, scan raw datasets
  generate_reports.py   Builds data_card.md / class_stats.json on demand

  adapters/         Per-source-format readers (yolo, coco, voc, folder_classification)
  routers/          One module per resource: projects, datasets, normalize,
                     runs, review_queue, annotate, quality, splits, exports, lineage
  services/         Business logic, kept independent of FastAPI/DB where possible:
    scanner.py         format auto-detection + dataset stats
    mapping_engine.py  applies a mapping table, writes canonical YOLO output
    validation.py      bbox sanity checks
    jobs.py            background job runner + progress polling
    paths.py           portable path resolution (bare-metal vs Docker)
    quality.py          duplicate/blur/exposure detection, class balance
    splitting.py        stratified + grouped dataset splitting
    export_ops.py       versioned export snapshots + lineage manifests
    annotate_ops.py     Annotation Studio file operations (see docstring — two
                         folder contracts: raw/unlabeled vs. structured/labeled)
    auto_label.py       YOLO26 auto-label suggestions (needs models/yolo26s-seg.pt)
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `RAW_DATASETS_DIR` | `../normalization datases` | Root the scanner and Annotation Studio read from |
| `DATA_DIR` | `../data` | Root for DB, normalized output, exports, etc. |
| `YOLO26_WEIGHTS` | `../models/yolo26s-seg.pt` | Path to auto-label model weights — see `models/README.md` |

All default to paths relative to the repo root when unset, which is what
bare-metal runs use; Docker sets them explicitly to the bind-mounted volume
paths (see root `docker-compose.yml`).

## Tests / verification

There's no automated test suite yet — verification so far has been end-to-end
smoke tests against real datasets (see root README's "Smoke-tested end-to-end"
section). If you add tests, `pytest` against a temp `DATA_DIR`/`RAW_DATASETS_DIR`
is the natural fit given how path resolution is already isolated in `config.py`.
