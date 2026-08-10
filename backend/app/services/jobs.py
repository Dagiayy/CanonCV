from __future__ import annotations

import asyncio
import traceback
from datetime import datetime, timezone

from app.db import SessionLocal
from app.services.mapping_engine import run_normalization


def _run_job(run_id: str) -> None:
    from app import models  # local import avoids circulars at module load time

    db = SessionLocal()
    try:
        run = db.query(models.NormalizationRun).filter_by(id=run_id).one_or_none()
        if run is None:
            return
        run.status = "running"
        db.commit()

        def progress_cb(idx: int, total: int, current_file: str) -> None:
            run.progress_percent = round(100.0 * idx / total, 1) if total else 100.0
            run.current_file = current_file
            db.commit()

        try:
            run_normalization(db, run, progress_cb=progress_cb)
            run.status = "success"
        except Exception as e:  # noqa: BLE001
            run.status = "failed"
            run.log_excerpt = f"{type(e).__name__}: {e}\n{traceback.format_exc()[-4000:]}"
        run.completed_at = datetime.now(timezone.utc)
        run.progress_percent = 100.0
        db.commit()
    finally:
        db.close()


async def schedule_run(run_id: str) -> None:
    await asyncio.to_thread(_run_job, run_id)
