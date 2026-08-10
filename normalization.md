# normalization.md — Dataset Normalization System (Design Spec)

This describes the Python backend + web frontend for **dataset normalization**, the first tool in the pipeline before any model training. It is written to be a **general-purpose, reusable system**, not a one-off script for the bicycle-counting project — the bicycle taxonomy is *configuration*, not code, so the same tool can be pointed at a different project (a future pedestrian-only system, a different city's traffic system, etc.) without modification.

---

## 1. Purpose

Given a pile of externally-sourced object-detection datasets with inconsistent label taxonomies and formats, this system:
1. **Scans and catalogs** every raw dataset (format, size, classes present, image stats) automatically.
2. Lets a human define a **canonical class taxonomy** per project, through the UI.
3. Lets a human build a **mapping table** per source dataset (source label → canonical class, or drop/review) through the UI, with visual spot-checking.
4. Runs the actual **normalization job**: remaps every annotation to canonical class IDs, writes output preserving original filenames, into a new per-dataset output folder.
5. Keeps a full **history/audit trail** of every dataset added and every normalization run, queryable in the UI — this is not a script you run once and forget; it's a system of record for "what data went into this model."

---

## 2. Design Principles

- **Taxonomy is data, not code.** The canonical class list (bicycle/car/etc.) lives in a project config record, editable via UI. Nothing in the backend hardcodes "12 classes" — a different project can define its own taxonomy.
- **Raw datasets are immutable.** Nothing in this system ever writes into the `raw/` folder. All output goes to a new location, keyed by dataset + mapping-table version, so a raw dataset can always be re-normalized from scratch if the mapping changes.
- **Mapping tables are versioned, never overwritten.** Editing a mapping and re-running creates a new version; old runs and their outputs stay intact and traceable. This matters because "why did model v3 perform worse on cargo_bike" needs to be answerable months later.
- **Format handling is pluggable.** COCO JSON, YOLO txt, Pascal VOC XML, and "custom/unknown" are implemented as interchangeable **adapters** behind one interface, so adding a new source format later (e.g., a proprietary vendor export) means writing one adapter, not touching the rest of the system.
- **Nothing is silently guessed.** Any source label without an explicit mapping decision is either dropped (with a logged count) or routed to a review queue — never auto-assigned.
- **The UI is the source of truth for human decisions; the filesystem/DB is the source of truth for data.** Every mapping decision made in the UI is persisted immediately, not just held in browser state.
- **Multi-project from day one.** Project selector at the top level; everything below (taxonomy, datasets, mappings, runs, history) is scoped to a project. The bicycle-counting system is Project #1.

---

## 3. System Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│         Frontend            │  REST  │           Backend             │
│  React + Tailwind (SPA)     │◄──────►│  FastAPI (Python)             │
│                              │  poll  │                                │
│  - Project switcher          │        │  ┌──────────────────────────┐ │
│  - Dashboard                 │        │  │ Dataset Scanner           │ │
│  - Taxonomy Editor           │        │  │ (format adapters)         │ │
│  - Mapping Builder           │        │  └──────────────────────────┘ │
│  - Run / Normalize           │        │  ┌──────────────────────────┐ │
│  - History & Reports         │        │  │ Mapping Engine            │ │
│  - Review Queue              │        │  │ + Validation (bbox checks)│ │
└─────────────────────────────┘        │  └──────────────────────────┘ │
                                        │  ┌──────────────────────────┐ │
                                        │  │ Job Runner (async/bg)     │ │
                                        │  └──────────────────────────┘ │
                                        │  ┌──────────────────────────┐ │
                                        │  │ SQLite/Postgres (metadata)│ │
                                        │  │ + local filesystem (data) │ │
                                        │  └──────────────────────────┘ │
                                        └──────────────────────────────┘
```

- **Backend:** Python, FastAPI for the REST API, SQLAlchemy + SQLite (Postgres if this ever needs multi-user concurrent access) for all metadata/history — raw image/label files stay on disk, only metadata and mapping tables go in the DB.
- **Frontend:** React SPA (Vite + Tailwind), talks to the backend purely over REST + polling for job progress (a websocket progress channel is a nice-to-have, not required for v1).
- **Job execution:** normalization runs happen as background tasks (Python `asyncio` background tasks or a lightweight queue like `rq`/`arq` if datasets are large enough that this matters) — the UI submits a run and polls a job-status endpoint rather than blocking on an HTTP request, since a large dataset conversion can take minutes.

---

## 4. Data Model

```
Project
  id, name, description, created_at

ClassTaxonomy (belongs to Project, versioned)
  id, project_id, version, created_at, is_active
  classes: [ { id, name, description, color_hex, category } ]
     # category = free text grouping, e.g. "primary" / "secondary" — for UI grouping only, not logic

Dataset (belongs to Project)
  id, project_id, name, raw_path, source_format   # coco_json | yolo | voc_xml | custom
  added_at, added_by_note
  scan_status                                      # pending | scanned | error
  num_images, num_annotations
  source_classes: [ { label, count } ]             # auto-discovered on scan
  image_stats: { avg_width, avg_height, min/max res, formats_found }
  license_note, collection_note                    # free text, filled manually in UI

MappingTable (belongs to Dataset, versioned — never overwritten)
  id, dataset_id, version, taxonomy_version_used
  created_at, created_by_note, status              # draft | ready | archived
  entries: [ { source_label, action: map|drop|review, target_class_id (nullable) } ]
  notes  (free text)

NormalizationRun
  id, project_id, started_at, completed_at, status  # queued|running|success|failed
  dataset_id, mapping_table_id
  output_path
  stats: {
    per_class_count_before: {...}, per_class_count_after: {...},
    dropped_label_count: n, dropped_labels_breakdown: {...},
    bbox_warnings: [ {file, issue} ],
    images_processed, annotations_processed
  }
  log_excerpt

ReviewQueueItem
  id, run_id, dataset_id, image_path, source_label
  bbox (if applicable), crop_thumbnail_path
  suggested_class_id (nullable), status   # pending | resolved
  resolution_class_id (nullable), resolved_at
```

---

## 5. Backend Modules

### 5.1 Dataset Scanner
- Point it at a folder; it auto-detects format (looks for `*.json` in COCO layout, `*.txt` + `classes.txt`/`data.yaml` for YOLO, `*.xml` for VOC, otherwise flags `custom` and asks the user to supply a small parser hint or map fields manually).
- Extracts: total image count, total annotation count, **distinct source label strings and their per-label instance counts**, image resolution stats, basic corruption checks (unreadable images, annotation files with no matching image and vice versa).
- Writes results into the `Dataset` record. This is what powers the Dashboard cards and is the input to the Mapping Builder (it needs to know every distinct source label before a human can map them).
- Runs are idempotent/re-runnable (a "rescan" button) if the source folder changes.

### 5.2 Format Adapters (pluggable interface)
Each adapter implements:
```python
class DatasetAdapter(Protocol):
    def scan(self, path: Path) -> DatasetScanResult: ...
    def read_annotations(self, path: Path) -> Iterator[Annotation]: ...
    def write_annotations(self, annotations: Iterator[Annotation], out_path: Path) -> None: ...
```
Built-in adapters at launch: `CocoJsonAdapter`, `YoloTxtAdapter`, `VocXmlAdapter`. `CustomAdapter` is a stub with a clear extension point — adding a new source format later means implementing this interface once, nothing else in the system changes.

Output is always written via a canonical **YOLO writer** (`class_id x_center y_center width height`, normalized), matching the target training format, regardless of source format — but the writer itself is also behind the same interface so a future project could target a different output format without a rewrite.

### 5.3 Mapping Engine
- Takes a `Dataset` + a `MappingTable` (must be `status: ready`).
- For every annotation: look up `source_label` in the mapping entries.
  - `map` → rewrite with `target_class_id`.
  - `drop` → discard, increment drop counter for that label.
  - `review` → discard from the main output, but write a crop thumbnail + record into `ReviewQueueItem` for manual resolution later.
- **No fallback/default mapping.** A source label with no entry in the table at all is treated as an error and blocks the run (surfaced clearly in the UI) — this forces every label to be an explicit decision before a run can execute, per the "never guess silently" principle.

### 5.4 Validation
Runs automatically as part of every normalization job, before it's marked successful:
- Bounding box sanity: no zero/negative area, all coordinates within `[0,1]` after normalization, aspect-ratio outlier flags.
- Cross-check image ↔ label file pairing (every output label file has a matching image and vice versa).
- Per-class count sanity: warns (does not block) if any canonical class ends this run with zero instances, since that usually signals a mapping table gap rather than a genuinely absent class.
- All warnings/errors attach to the `NormalizationRun.stats` and are visible in the History UI, not just logged to a file no one reads.

### 5.5 Job Runner
- Normalization run = background job. API returns a `job_id` immediately; frontend polls `GET /jobs/{id}` for progress (`% complete`, current file, live counts) and final status.
- Jobs are cancellable and resumable-on-retry (re-running an identical dataset+mapping-table-version combination should be safe/idempotent — same output, not appended/duplicated).

### 5.6 Output Convention
Per the requirement to **keep original filenames and keep each source dataset's output separate** (not merged) at this stage:
```
normalized/
  <project_name>/
    <dataset_name>/
      run_<mapping_version>_<timestamp>/
        images/            # copied or symlinked, original filenames preserved
          <original_filename>.jpg
        labels/            # remapped YOLO txt, same base filename as image
          <original_filename>.txt
        manifest.json      # per-run stats, mapping table version, source dataset version, warnings
        review_queue/       # crops routed for manual review, if any
```
Merging multiple normalized datasets into a single train/val/test split is a **separate, later step** (not part of this tool) — this tool's job ends at "every source dataset, cleanly remapped to canonical classes, individually traceable."

---

## 6. Frontend — Pages & UI Spec

### 6.1 Project Switcher (top bar, always visible)
Dropdown of existing projects + "New Project" — every other page is scoped to the selected project. Creating a project prompts for name/description only; taxonomy is defined in its own page next.

### 6.2 Dashboard (landing page per project)
- Grid of **dataset cards**, one per registered dataset. Each card shows: name, source format badge, image count, annotation count, number of distinct source labels, scan date, and a status chip: `Unscanned` / `Scanned — mapping needed` / `Mapping ready` / `Normalized (vN)`.
- "Add Dataset" button → prompts for a folder path (or upload for smaller sets) → triggers scan → card appears once scan completes.
- Clicking a card opens **Dataset Detail**.
- A summary strip at the top: total datasets, total images across project, total annotations, aggregate per-canonical-class instance count *across all normalized runs so far* — this is the fastest way to see "are we still starved on `cargo_bike`" without digging into individual datasets.

### 6.3 Dataset Detail
- Metadata panel: format, path, license/collection notes (editable free text fields), image resolution stats.
- **Source label table**: every distinct label found in this dataset, its raw instance count, and (once a mapping table exists) its current mapping decision inline.
- **Sample viewer**: a small gallery of sample images with their original annotations rendered as boxes, so a human can visually sanity-check "does this dataset's 'van' label actually look like our minibus?" before deciding the mapping — this is the single most useful UI element for avoiding silent mapping mistakes.
- Tabs: `Overview` / `Mapping` / `Run History` (history scoped to just this dataset).

### 6.4 Taxonomy Editor (per project)
- Editable table: canonical class ID (locked once any mapping table references it), name, description, color swatch (used consistently for box-rendering everywhere else in the UI), category (free-text grouping like "primary"/"secondary" for display only).
- Add-class button appends the next available ID — **existing IDs are never renumbered**, since mapping tables reference them by ID; if a class must be removed, it's marked `deprecated` rather than deleted, so historical runs remain interpretable.
- Save creates a new `ClassTaxonomy` version and marks it active; prior versions remain viewable (a `MappingTable` records which taxonomy version it was built against, so you can tell if a mapping table predates a taxonomy change).
- This page is literally the UI form the user asked for — "input the base class labels like 0: bicycle, 1: car…" — implemented as a structured table rather than freeform text, so IDs can't collide and every class has a place for a description/color that the rest of the UI reuses.

### 6.5 Mapping Builder (per dataset)
This is the core human-in-the-loop screen:
- Left column: every distinct source label for this dataset (from the scan), with its raw instance count.
- For each source label, an inline control: dropdown of canonical classes (from the active taxonomy) **or** `Drop` **or** `Send to review`.
- A "show samples" icon per row opens a small modal with a few example crops for that source label — critical for ambiguous cases like "van" or generic "bus".
- A free-text notes field per mapping table (not per row) for recording rationale on tricky decisions.
- Autosaves as a `draft`. A `Mark as Ready` button flips it to `ready`, which is the precondition for running normalization — you cannot run a job against a `draft` mapping table, forcing a deliberate "I'm done deciding" step.
- If any source label has no decision yet, the `Mark as Ready` button stays disabled with a visible count of "3 labels still unmapped."

### 6.6 Run / Normalize
- Select one or more datasets whose mapping tables are `ready`.
- Single **"Run Normalization"** button per selection (matches the user's request: pick base labels, click one button, it maps everything).
- On click: submits jobs (one per dataset, run in parallel or queued depending on backend capacity), shows a progress panel per dataset (live % / current file / running per-class counts).
- On completion: results summary per dataset — before/after per-class counts (bar chart), dropped-label breakdown, bbox warning count, link to output folder, link to any items routed to the review queue.

### 6.7 History
- Full table of every `NormalizationRun` ever executed, across all datasets in the project: dataset name, mapping table version, timestamp, status, output path, quick stats (images/annotations processed, warnings count).
- Filterable by dataset, date range, status.
- Row expands to the same detailed report shown at run completion (Section 6.6) — this is what makes the history feature actually useful later ("which run produced the data in model v3's training set").
- Every dataset's own `Run History` tab (Section 6.3) is just this same table pre-filtered to that dataset.

### 6.8 Review Queue
- Table of every `ReviewQueueItem` across the project (or filterable per dataset), each showing the crop thumbnail, source label, and a dropdown to resolve it into a canonical class (or confirm-drop).
- Resolving an item here does **not** retroactively rewrite the original run's output — it's queued for inclusion the *next* time that dataset is normalized (keeps runs reproducible/immutable), or optionally exported as a small standalone "resolved review items" mini-dataset that can be merged in downstream.

---

## 7. API Contract (summary)

```
GET    /projects
POST   /projects
GET    /projects/{id}/taxonomy
POST   /projects/{id}/taxonomy                # creates new version, sets active

POST   /projects/{id}/datasets                # register + trigger scan
GET    /projects/{id}/datasets
GET    /datasets/{id}
POST   /datasets/{id}/rescan
GET    /datasets/{id}/samples                 # sample images + rendered original boxes

GET    /datasets/{id}/mapping                 # latest mapping table (draft or ready)
POST   /datasets/{id}/mapping                 # save/update draft, or mark ready
GET    /datasets/{id}/mapping/history          # all past versions

POST   /normalize/run                          # { dataset_ids: [...] } -> { job_ids: [...] }
GET    /jobs/{id}                               # poll status/progress

GET    /projects/{id}/runs                      # history, filterable
GET    /runs/{id}                               # full report

GET    /projects/{id}/review-queue
POST   /review-queue/{id}/resolve
```

---

## 8. Tech Stack Summary

| Layer | Choice | Why |
|---|---|---|
| Backend framework | FastAPI | async-friendly for background jobs, auto OpenAPI docs, matches Python-only requirement |
| DB | SQLite (upgrade path to Postgres) | metadata/history only, low concurrency needs for an internal tool |
| Job execution | `asyncio` background tasks (or `arq`/`rq` if datasets are large) | simple polling model, no need for full Celery infra at this scale |
| Frontend | React + Vite + Tailwind | fast SPA, component-driven, matches the multi-page/interactive spec above |
| Image serving | Static file mount for thumbnails/samples via FastAPI | avoids a separate media server for an internal tool |

---

## 9. Why This Is Built as a Reusable System, Not a One-Off Script

Every taxonomy-specific detail (the 12/13 bicycle-project classes) lives only inside a `ClassTaxonomy` record for Project #1. Nothing in the scanner, adapters, mapping engine, validation, or frontend components references bicycle-specific class names or counts. Starting a second project (e.g., a future pedestrian-flow system, or a different city's vehicle-classification pipeline) means:
1. Create a new Project.
2. Define its taxonomy in the Taxonomy Editor.
3. Register its raw datasets and build mapping tables in the same UI.

No backend or frontend code changes required for a new project — this is the concrete meaning of "full system, not only for now."
