from __future__ import annotations

from dataclasses import dataclass

# aspect ratio (w/h) outside this range gets flagged for spot review, but is kept —
# only zero/negative area or out-of-[0,1] boxes are hard-dropped as corrupt.
ASPECT_RATIO_OUTLIER_MIN = 1 / 20
ASPECT_RATIO_OUTLIER_MAX = 20


@dataclass
class BBoxCheck:
    ok: bool
    fatal: bool  # True => box must be dropped (corrupt), False => keep but flag
    issue: str | None


def check_bbox(bbox: tuple[float, float, float, float]) -> BBoxCheck:
    xc, yc, w, h = bbox

    if w <= 0 or h <= 0:
        return BBoxCheck(ok=False, fatal=True, issue=f"zero/negative area (w={w:.4f}, h={h:.4f})")

    x_min, x_max = xc - w / 2, xc + w / 2
    y_min, y_max = yc - h / 2, yc + h / 2
    if x_min < -1e-6 or y_min < -1e-6 or x_max > 1 + 1e-6 or y_max > 1 + 1e-6:
        return BBoxCheck(
            ok=False,
            fatal=True,
            issue=f"box outside [0,1] normalized range (x:[{x_min:.4f},{x_max:.4f}] y:[{y_min:.4f},{y_max:.4f}])",
        )

    ratio = w / h
    if ratio < ASPECT_RATIO_OUTLIER_MIN or ratio > ASPECT_RATIO_OUTLIER_MAX:
        return BBoxCheck(ok=True, fatal=False, issue=f"aspect-ratio outlier (w/h={ratio:.2f})")

    return BBoxCheck(ok=True, fatal=False, issue=None)
