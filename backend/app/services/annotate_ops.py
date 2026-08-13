"""File-level operations for the standalone Annotation Studio. Works directly on
folders under RAW_DATASETS_DIR, independent of the Dataset/MappingTable machinery.

Two kinds of folders are supported:

  Raw/unlabeled folders (e.g. imported via "Import folder"): labeled straight
  into canonical taxonomy classes as you go. Contract:
    images/       organized images (created on first save)
    labels/       canonical-class YOLO labels (created on first save)
    _excluded/    images removed via data cleaning (reversible)
    <loose files> raw images before the first save, if images/ doesn't exist yet

  Structured, already-labeled external datasets (Roboflow-style exports with
  train/valid/test/{images,labels} and a data.yaml naming their own classes):
  discovered recursively. Their original label files are never written to —
  RAW_DATASETS_DIR is "never written to by this system" (see config.py) — so
  edits go to a parallel _annotate_labels/<same relative path>.txt overlay.
  Existing boxes are shown by translating the source class name to a canonical
  class by exact name match, or via a short list of unambiguous synonyms (see
  label_aliases.py, e.g. "person" -> pedestrian); anything that still doesn't
  match is flagged needs_review rather than guessed (never map silently, see
  CLAUDE.md ยง4.3).
"""
from __future__ import annotations

import shutil
import time
from pathlib import Path

import yaml
from PIL import Image, ImageEnhance, ImageOps

from app.config import IMAGE_EXTENSIONS, RAW_DATASETS_DIR
from app.services.label_aliases import resolve_canonical_name

_SKIP_DIR_NAMES = {"_excluded", "_annotate_labels", "labels"}


class AnnotateError(Exception):
    pass


def resolve_folder(folder_name: str, must_exist: bool = True) -> Path:
    if folder_name != Path(folder_name).name:
        raise AnnotateError("folder_name must be a direct child of the raw datasets root")
    folder = RAW_DATASETS_DIR / folder_name
    if must_exist and not folder.is_dir():
        raise AnnotateError(f"no such folder under the raw datasets root: {folder_name}")
    return folder


def _loose_images(folder: Path) -> list[Path]:
    return [p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]


def _discover_images(folder: Path) -> list[Path]:
    """Every image anywhere under folder, however it's organized: loose at the
    root, in a flat images/, or nested inside train/valid/test/images/ splits."""
    out = []
    for p in folder.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        if any(part in _SKIP_DIR_NAMES for part in p.relative_to(folder).parts[:-1]):
            continue
        out.append(p)
    return sorted(out, key=lambda p: p.relative_to(folder).as_posix())


def find_image(folder: Path, rel_path: str) -> Path | None:
    """rel_path may be a bare filename (loose/flat case) or a nested relative
    path like "train/images/x.jpg" (structured case)."""
    folder_resolved = folder.resolve()
    direct = folder / rel_path
    try:
        direct_resolved = direct.resolve()
        direct_resolved.relative_to(folder_resolved)
    except (ValueError, OSError):
        return None
    if direct_resolved.is_file():
        return direct_resolved
    # Legacy fallback: a bare filename that's already been organized into images/.
    organized = folder / "images" / rel_path
    if organized.is_file():
        return organized
    return None


# A folder-list badge doesn't need an exact count of a 30k+ image dataset —
# and a full recursive stat of one is genuinely slow over a Docker Desktop
# bind mount on Windows (each file stat has real per-call latency, and this
# runs once per folder, on every page load). Cap the walk and cache the
# result so the common case (repeat loads, small/medium folders) stays fast.
_COUNT_CAP = 500
_COUNT_CACHE_TTL = 300  # seconds
_count_cache: dict[str, tuple[float, int, bool]] = {}  # folder_name -> (cached_at, count, capped)


def _count_images_capped(folder: Path, cap: int = _COUNT_CAP) -> tuple[int, bool]:
    n = 0
    for p in folder.rglob("*"):
        if not p.is_file() or p.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        if any(part in _SKIP_DIR_NAMES for part in p.relative_to(folder).parts[:-1]):
            continue
        n += 1
        if n >= cap:
            return n, True
    return n, False


def list_folders() -> list[dict]:
    if not RAW_DATASETS_DIR.exists():
        return []
    out = []
    now = time.time()
    for entry in sorted(RAW_DATASETS_DIR.iterdir()):
        if not entry.is_dir() or "_normalized" in entry.name:
            continue
        cached = _count_cache.get(entry.name)
        if cached and now - cached[0] < _COUNT_CACHE_TTL:
            _, n, capped = cached
        else:
            try:
                n, capped = _count_images_capped(entry)
            except OSError:
                n, capped = 0, False
            _count_cache[entry.name] = (now, n, capped)
        out.append({"folder_name": entry.name, "image_count": n, "image_count_capped": capped, "organized": (entry / "images").exists()})
    return out


def _load_source_class_names(folder: Path) -> dict[int, str]:
    """Class id -> name, as declared by the dataset's OWN taxonomy (data.yaml /
    classes.txt). Empty if this isn't a structured external export."""
    for name in ("data.yaml", "data.yml"):
        candidate = folder / name
        if not candidate.exists():
            continue
        try:
            data = yaml.safe_load(candidate.read_text(encoding="utf-8", errors="ignore")) or {}
        except yaml.YAMLError:
            continue
        names = data.get("names")
        if isinstance(names, list):
            return {i: str(n) for i, n in enumerate(names)}
        if isinstance(names, dict):
            try:
                return {int(k): str(v) for k, v in names.items()}
            except (TypeError, ValueError):
                continue

    classes_txt = folder / "classes.txt"
    if classes_txt.exists():
        lines = [ln.strip() for ln in classes_txt.read_text(encoding="utf-8", errors="ignore").splitlines() if ln.strip()]
        if lines:
            return dict(enumerate(lines))
    return {}


def _label_path_for_image(folder: Path, image_path: Path, structured: bool) -> Path:
    """Where THIS system reads/writes canonical-class labels for image_path.
    Structured datasets get a parallel overlay tree so their original label
    files (foreign taxonomy) are never touched."""
    rel = image_path.relative_to(folder)
    if structured:
        return (folder / "_annotate_labels" / rel).with_suffix(".txt")
    parts = list(rel.parts)
    if "images" in parts:
        idx = len(parts) - 1 - parts[::-1].index("images")
        parts[idx] = "labels"
        return folder / Path(*parts).with_suffix(".txt")
    return folder / "labels" / (image_path.stem + ".txt")


def _source_label_path(folder: Path, image_path: Path) -> Path:
    """Where the dataset's OWN (foreign-taxonomy) label file lives, mirroring
    an images/ path segment to labels/ per the standard YOLO export convention.
    Read-only — never written to."""
    rel = image_path.relative_to(folder)
    parts = list(rel.parts)
    if "images" in parts:
        idx = len(parts) - 1 - parts[::-1].index("images")
        parts[idx] = "labels"
        return folder / Path(*parts).with_suffix(".txt")
    return folder / "labels" / (image_path.stem + ".txt")


def _parse_yolo_txt(label_path: Path) -> list[dict]:
    boxes = []
    if not label_path.exists():
        return boxes
    for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) != 5:
            continue
        try:
            cls_id = int(float(parts[0]))
            xc, yc, w, h = (float(x) for x in parts[1:])
        except ValueError:
            continue
        boxes.append({"class_id": cls_id, "bbox": [xc, yc, w, h]})
    return boxes


def read_boxes(folder: Path, image_path: Path, source_names: dict[int, str], canonical_by_name: dict[str, dict]) -> list[dict]:
    """Single source of truth for "what boxes does this image currently have".
    A canonical (Annotate-Studio-saved) label always wins if present — it's
    already resolved, no translation needed. Otherwise, for a structured
    external dataset, fall back to its original label file and translate by
    exact class-name match (or a known unambiguous synonym, see
    label_aliases.py); anything that still doesn't match is flagged
    needs_review with class_id=None rather than guessed."""
    structured = bool(source_names)
    canonical_path = _label_path_for_image(folder, image_path, structured)
    if canonical_path.exists():
        return [{"class_id": b["class_id"], "bbox": b["bbox"], "needs_review": False, "source_label": None} for b in _parse_yolo_txt(canonical_path)]

    if not structured:
        return []

    out = []
    for b in _parse_yolo_txt(_source_label_path(folder, image_path)):
        src_name = source_names.get(b["class_id"])
        canon = canonical_by_name.get(resolve_canonical_name(src_name)) if src_name else None
        if canon:
            out.append({"class_id": canon["id"], "bbox": b["bbox"], "needs_review": False, "source_label": src_name})
        else:
            out.append({"class_id": None, "bbox": b["bbox"], "needs_review": True, "source_label": src_name or f"class_{b['class_id']}"})
    return out


def list_images(folder: Path, offset: int, limit: int, class_by_id: dict, canonical_by_name: dict) -> tuple[list[dict], bool, int]:
    source_names = _load_source_class_names(folder)
    files = _discover_images(folder)
    total = len(files)
    page = files[offset : offset + limit]
    has_more = total > offset + limit

    items = []
    for f in page:
        boxes = []
        for b in read_boxes(folder, f, source_names, canonical_by_name):
            if b["class_id"] is not None:
                cls = class_by_id.get(b["class_id"], {})
                boxes.append(
                    {
                        "class_id": b["class_id"],
                        "label": cls.get("name", f"class_{b['class_id']}"),
                        "color_hex": cls.get("color_hex", "#8e8e93"),
                        "bbox": b["bbox"],
                        "needs_review": False,
                    }
                )
            else:
                boxes.append(
                    {
                        "class_id": None,
                        "label": b["source_label"],
                        "color_hex": "#8e8e93",
                        "bbox": b["bbox"],
                        "needs_review": True,
                    }
                )
        items.append({"filename": f.relative_to(folder).as_posix(), "boxes": boxes})
    return items, has_more, total


def save_annotation(folder: Path, filename: str, boxes: list[dict]) -> None:
    from app.services.validation import check_bbox

    src = find_image(folder, filename)
    if src is None:
        raise AnnotateError(f"image not found: {filename}")

    structured = bool(_load_source_class_names(folder))
    if structured or "images" in src.relative_to(folder).parts:
        label_path = _label_path_for_image(folder, src, structured)
        label_path.parent.mkdir(parents=True, exist_ok=True)
    else:
        organized_images = folder / "images"
        organized_labels = folder / "labels"
        organized_images.mkdir(exist_ok=True)
        organized_labels.mkdir(exist_ok=True)
        dest = organized_images / src.name
        if src != dest:
            shutil.move(str(src), str(dest))
            src = dest
        label_path = organized_labels / (src.stem + ".txt")

    lines = []
    for b in boxes:
        check = check_bbox(tuple(b["bbox"]))
        if check.fatal:
            continue  # silently dropped: corrupt box, not something a human drew intentionally
        xc, yc, w, h = b["bbox"]
        lines.append(f"{b['class_id']} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}")
    label_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def exclude_image(folder: Path, filename: str) -> None:
    src = find_image(folder, filename)
    if src is None:
        raise AnnotateError(f"image not found: {filename}")

    structured = bool(_load_source_class_names(folder))
    label_path = _label_path_for_image(folder, src, structured)

    rel = src.relative_to(folder)
    dest = folder / "_excluded" / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dest))

    if label_path.exists():
        label_dest = folder / "_excluded" / label_path.relative_to(folder)
        label_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(label_path), str(label_dest))


def copy_to_folder(folder: Path, filename: str, target_folder_name: str) -> None:
    target = resolve_folder(target_folder_name, must_exist=False)
    target.mkdir(parents=True, exist_ok=True)
    src = find_image(folder, filename)
    if src is None:
        raise AnnotateError(f"image not found: {filename}")
    shutil.copy2(src, target / src.name)

    structured = bool(_load_source_class_names(folder))
    label_path = _label_path_for_image(folder, src, structured)
    if label_path.exists():
        (target / "labels").mkdir(exist_ok=True)
        shutil.copy2(label_path, target / "labels" / label_path.name)


def crop_image(folder: Path, filename: str, x1: float, y1: float, x2: float, y2: float, canonical_by_name: dict) -> dict:
    """Destructive, in-place crop (that's the point of a cleaning step). Existing
    boxes are clipped to the new frame; boxes fully outside the crop, or still
    unresolved (needs_review), are dropped rather than carried through."""
    path = find_image(folder, filename)
    if path is None:
        raise AnnotateError(f"image not found: {filename}")

    source_names = _load_source_class_names(folder)
    existing = [b for b in read_boxes(folder, path, source_names, canonical_by_name) if b["class_id"] is not None]

    with Image.open(path) as im:
        old_w, old_h = im.width, im.height
        px1, py1 = max(0, int(x1 * old_w)), max(0, int(y1 * old_h))
        px2, py2 = min(old_w, int(x2 * old_w)), min(old_h, int(y2 * old_h))
        if px2 <= px1 or py2 <= py1:
            raise AnnotateError("crop region is empty")
        cropped = im.convert("RGB").crop((px1, py1, px2, py2))
        new_w, new_h = cropped.width, cropped.height
        cropped.save(path)

    kept = []
    for b in existing:
        xc, yc, w, h = b["bbox"]
        bx1, by1 = (xc - w / 2) * old_w, (yc - h / 2) * old_h
        bx2, by2 = (xc + w / 2) * old_w, (yc + h / 2) * old_h
        ix1, iy1 = max(bx1, px1), max(by1, py1)
        ix2, iy2 = min(bx2, px2), min(by2, py2)
        if ix2 <= ix1 or iy2 <= iy1:
            continue
        nx1, ny1, nx2, ny2 = ix1 - px1, iy1 - py1, ix2 - px1, iy2 - py1
        kept.append(
            {
                "class_id": b["class_id"],
                "bbox": [(nx1 + nx2) / 2 / new_w, (ny1 + ny2) / 2 / new_h, (nx2 - nx1) / new_w, (ny2 - ny1) / new_h],
            }
        )

    structured = bool(source_names)
    label_path = _label_path_for_image(folder, path, structured)
    if label_path.exists() or kept:
        label_path.parent.mkdir(parents=True, exist_ok=True)
        lines = [f"{b['class_id']} {b['bbox'][0]:.6f} {b['bbox'][1]:.6f} {b['bbox'][2]:.6f} {b['bbox'][3]:.6f}" for b in kept]
        label_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

    return {"width": new_w, "height": new_h, "boxes_kept": len(kept), "boxes_dropped": len(existing) - len(kept)}


# ---- Augmentation: each op transforms both the image and every box the same way ----


def _flip_h(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    out = [{"class_id": b["class_id"], "bbox": [1 - b["bbox"][0], b["bbox"][1], b["bbox"][2], b["bbox"][3]]} for b in boxes]
    return ImageOps.mirror(im), out


def _flip_v(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    out = [{"class_id": b["class_id"], "bbox": [b["bbox"][0], 1 - b["bbox"][1], b["bbox"][2], b["bbox"][3]]} for b in boxes]
    return ImageOps.flip(im), out


def _rotate90(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    # 90 CCW: xc'=yc, yc'=1-xc, dims swap
    out = [{"class_id": b["class_id"], "bbox": [b["bbox"][1], 1 - b["bbox"][0], b["bbox"][3], b["bbox"][2]]} for b in boxes]
    return im.transpose(Image.Transpose.ROTATE_90), out


def _rotate180(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    out = [{"class_id": b["class_id"], "bbox": [1 - b["bbox"][0], 1 - b["bbox"][1], b["bbox"][2], b["bbox"][3]]} for b in boxes]
    return im.transpose(Image.Transpose.ROTATE_180), out


def _rotate270(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    # 270 CCW (= 90 CW): xc'=1-yc, yc'=xc, dims swap
    out = [{"class_id": b["class_id"], "bbox": [1 - b["bbox"][1], b["bbox"][0], b["bbox"][3], b["bbox"][2]]} for b in boxes]
    return im.transpose(Image.Transpose.ROTATE_270), out


def _brightness_up(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    return ImageEnhance.Brightness(im).enhance(1.35), boxes


def _brightness_down(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    return ImageEnhance.Brightness(im).enhance(0.7), boxes


def _contrast_up(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    return ImageEnhance.Contrast(im).enhance(1.35), boxes


def _contrast_down(im: Image.Image, boxes: list[dict]) -> tuple[Image.Image, list[dict]]:
    return ImageEnhance.Contrast(im).enhance(0.75), boxes


AUGMENT_OPS = {
    "flip_h": _flip_h,
    "flip_v": _flip_v,
    "rotate90": _rotate90,
    "rotate180": _rotate180,
    "rotate270": _rotate270,
    "brightness_up": _brightness_up,
    "brightness_down": _brightness_down,
    "contrast_up": _contrast_up,
    "contrast_down": _contrast_down,
}


def augment_image(folder: Path, filename: str, ops: list[str], canonical_by_name: dict) -> dict:
    """Applies the given ops in sequence to a COPY of the image (never touches the
    original), saving the result alongside it (same split, for structured
    datasets) or into images/ (flat/loose datasets)."""
    unknown = [o for o in ops if o not in AUGMENT_OPS]
    if unknown:
        raise AnnotateError(f"unknown augmentation op(s): {unknown}")
    if not ops:
        raise AnnotateError("no ops given")

    src = find_image(folder, filename)
    if src is None:
        raise AnnotateError(f"image not found: {filename}")

    source_names = _load_source_class_names(folder)
    boxes = [b for b in read_boxes(folder, src, source_names, canonical_by_name) if b["class_id"] is not None]

    structured = bool(source_names)
    with Image.open(src) as im:
        im = im.convert("RGB")
        for op in ops:
            im, boxes = AUGMENT_OPS[op](im, boxes)

        suffix = "_aug_" + "_".join(ops)
        stem = src.stem
        ext = src.suffix or ".jpg"
        out_name = f"{stem}{suffix}{ext}"

        if structured or "images" in src.relative_to(folder).parts:
            out_path = src.with_name(out_name)
        else:
            organized_images = folder / "images"
            organized_images.mkdir(exist_ok=True)
            out_path = organized_images / out_name

        im.save(out_path)

    label_out_path = _label_path_for_image(folder, out_path, structured)
    label_out_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{b['class_id']} {b['bbox'][0]:.6f} {b['bbox'][1]:.6f} {b['bbox'][2]:.6f} {b['bbox'][3]:.6f}" for b in boxes]
    label_out_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")

    return {"filename": out_path.relative_to(folder).as_posix(), "boxes": boxes}
