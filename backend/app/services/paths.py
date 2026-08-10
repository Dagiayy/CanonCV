from __future__ import annotations

from pathlib import Path

from app import models
from app.config import RAW_DATASETS_DIR


def resolve_raw_path(dataset: models.Dataset) -> Path:
    """Dataset.raw_path may be stored relative to RAW_DATASETS_DIR (portable across
    bare-metal/Docker, since RAW_DATASETS_DIR itself differs per environment via env
    var) or as an absolute path (for datasets registered from an arbitrary location
    on whichever filesystem the backend process is running on — only portable within
    that same environment)."""
    p = Path(dataset.raw_path)
    return p if p.is_absolute() else (RAW_DATASETS_DIR / p)


def resolve_run_output(run: models.NormalizationRun) -> Path:
    """Same portability concern as resolve_raw_path: normalized output always lives
    as a sibling of its dataset's raw folder (under RAW_DATASETS_DIR), so store and
    resolve it the same way rather than as an environment-specific absolute path."""
    p = Path(run.output_path)
    return p if p.is_absolute() else (RAW_DATASETS_DIR / p)


def to_portable_output_path(absolute_path: Path) -> str:
    try:
        return str(absolute_path.relative_to(RAW_DATASETS_DIR.resolve()))
    except ValueError:
        return str(absolute_path)
