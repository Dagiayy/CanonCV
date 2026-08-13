from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers import annotate, datasets, exports, lineage, normalize, projects, quality, review_queue, runs, splits

app = FastAPI(title="CanonCV Dataset Normalization", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


app.include_router(projects.router)
app.include_router(datasets.router)
app.include_router(normalize.router)
# lineage.router declares literal paths like /runs/diff — it must be registered
# before runs.router, whose /runs/{run_id} would otherwise greedily match "diff"
# as a run_id and shadow it (FastAPI matches routes in registration order).
app.include_router(lineage.router)
app.include_router(runs.router)
app.include_router(review_queue.router)
app.include_router(annotate.router)
app.include_router(quality.router)
app.include_router(splits.router)
app.include_router(exports.router)


@app.get("/health")
def health():
    return {"status": "ok"}
