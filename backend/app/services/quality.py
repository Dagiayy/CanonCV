"""Data quality & validation — §4 of the platform roadmap. Operates on a
dataset's raw source annotations (via its format adapter), independent of
mapping/normalization, since quality issues live in the source data itself.

Kept dependency-light on purpose: hashing and blur/exposure scoring use PIL +
numpy only (both already pulled in transitively by ultralytics), no new libs.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

from app.services.validation import ASPECT_RATIO_OUTLIER_MAX, ASPECT_RATIO_OUTLIER_MIN, check_bbox

# Near-duplicate pairwise comparison is O(n^2) — fine for the hundreds-to-low-
# thousands of images typical of one raw dataset, not for tens of thousands.
DEFAULT_MAX_IMAGES_FOR_NEAR_DUP = 2000
NEAR_DUP_HAMMING_THRESHOLD = 5

TINY_BOX_AREA_FRAC = 0.0005  # < 0.05% of image area
HUGE_BOX_AREA_FRAC = 0.5  # > 50% of image area

UNDEREXPOSED_MEAN = 30
OVEREXPOSED_MEAN = 225
FLAT_CONTRAST_STD = 15
BLUR_VARIANCE_THRESHOLD = 100  # below this, flag as likely blurry (Laplacian variance)


# ---- Hashing / duplicate detection ----


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def dhash(path: Path, hash_size: int = 8) -> int | None:
    """Difference hash: robust to small resizes/recompressions, cheap to compute."""
    try:
        with Image.open(path) as im:
            im = im.convert("L").resize((hash_size + 1, hash_size), Image.Resampling.LANCZOS)
            pixels = np.asarray(im, dtype=np.int16)
    except Exception:
        return None
    diff = pixels[:, 1:] > pixels[:, :-1]
    bits = 0
    for b in diff.flatten():
        bits = (bits << 1) | int(b)
    return bits


def hamming_distance(a: int, b: int) -> int:
    return bin(a ^ b).count("1")


@dataclass
class DuplicateReport:
    exact_groups: list[list[str]] = field(default_factory=list)
    near_duplicate_pairs: list[dict] = field(default_factory=list)
    images_scanned: int = 0
    near_dup_scan_skipped: bool = False


def find_duplicates(image_paths: list[Path], max_images_for_near_dup: int = DEFAULT_MAX_IMAGES_FOR_NEAR_DUP) -> DuplicateReport:
    report = DuplicateReport(images_scanned=len(image_paths))

    by_hash: dict[str, list[str]] = defaultdict(list)
    for p in image_paths:
        try:
            by_hash[file_sha256(p)].append(str(p))
        except OSError:
            continue
    report.exact_groups = [group for group in by_hash.values() if len(group) > 1]

    if len(image_paths) > max_images_for_near_dup:
        report.near_dup_scan_skipped = True
        return report

    hashes: list[tuple[Path, int]] = []
    for p in image_paths:
        h = dhash(p)
        if h is not None:
            hashes.append((p, h))

    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            d = hamming_distance(hashes[i][1], hashes[j][1])
            if d <= NEAR_DUP_HAMMING_THRESHOLD:
                report.near_duplicate_pairs.append(
                    {"a": str(hashes[i][0]), "b": str(hashes[j][0]), "distance": d}
                )
    return report


# ---- Standalone annotation validation (bbox + pairing) ----


@dataclass
class ValidationReport:
    bbox_warnings: list[dict] = field(default_factory=list)
    orphan_images: list[str] = field(default_factory=list)  # images with zero boxes
    images_checked: int = 0
    annotations_checked: int = 0


def validate_annotations(by_image: dict) -> ValidationReport:
    """by_image: {image_path_str: [(source_label_or_class, bbox), ...]}"""
    report = ValidationReport(images_checked=len(by_image))
    for image_path, boxes in by_image.items():
        if not boxes:
            report.orphan_images.append(image_path)
        for _label, bbox in boxes:
            report.annotations_checked += 1
            result = check_bbox(tuple(bbox))
            if result.issue:
                report.bbox_warnings.append(
                    {"file": image_path, "issue": result.issue, "fatal": result.fatal}
                )
    return report


# ---- Bbox outlier report ----


def outlier_report(by_image: dict) -> dict:
    """by_image: {image_path_str: [(label, bbox), ...]}"""
    ratios: list[float] = []
    areas: list[float] = []
    flagged: list[dict] = []
    for image_path, boxes in by_image.items():
        for label, bbox in boxes:
            _xc, _yc, w, h = bbox
            if w <= 0 or h <= 0:
                continue
            ratio = w / h
            area = w * h
            ratios.append(ratio)
            areas.append(area)
            reasons = []
            if ratio < ASPECT_RATIO_OUTLIER_MIN or ratio > ASPECT_RATIO_OUTLIER_MAX:
                reasons.append(f"aspect-ratio outlier ({ratio:.2f})")
            if area < TINY_BOX_AREA_FRAC:
                reasons.append(f"tiny box ({area * 100:.3f}% of image area)")
            elif area > HUGE_BOX_AREA_FRAC:
                reasons.append(f"huge box ({area * 100:.1f}% of image area)")
            if reasons:
                flagged.append({"file": image_path, "label": label, "bbox": list(bbox), "reasons": reasons})

    def stats(values: list[float]) -> dict:
        if not values:
            return {}
        arr = np.array(values)
        return {
            "min": float(arr.min()),
            "max": float(arr.max()),
            "mean": float(arr.mean()),
            "p50": float(np.percentile(arr, 50)),
            "p95": float(np.percentile(arr, 95)),
        }

    return {
        "aspect_ratio_stats": stats(ratios),
        "area_frac_stats": stats(areas),
        "flagged": flagged[:500],
        "flagged_total": len(flagged),
        "boxes_checked": len(ratios),
    }


# ---- Image quality scoring (blur, exposure) ----


def _laplacian_variance(gray: np.ndarray) -> float:
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    h, w = gray.shape
    if h < 3 or w < 3:
        return 0.0
    padded = np.pad(gray, 1, mode="edge").astype(np.float32)
    out = (
        padded[0:h, 1 : w + 1] * kernel[0, 1]
        + padded[1 : h + 1, 0:w] * kernel[1, 0]
        + padded[1 : h + 1, 1 : w + 1] * kernel[1, 1]
        + padded[1 : h + 1, 2 : w + 2] * kernel[1, 2]
        + padded[2 : h + 2, 1 : w + 1] * kernel[2, 1]
    )
    return float(out.var())


def score_image_quality(path: Path) -> dict | None:
    try:
        with Image.open(path) as im:
            gray = np.asarray(im.convert("L"), dtype=np.uint8)
    except Exception:
        return None
    blur_var = _laplacian_variance(gray)
    mean_brightness = float(gray.mean())
    std_brightness = float(gray.std())
    flags = []
    if blur_var < BLUR_VARIANCE_THRESHOLD:
        flags.append("blurry")
    if mean_brightness < UNDEREXPOSED_MEAN:
        flags.append("underexposed")
    elif mean_brightness > OVEREXPOSED_MEAN:
        flags.append("overexposed")
    if std_brightness < FLAT_CONTRAST_STD:
        flags.append("flat_low_contrast")
    return {
        "file": str(path),
        "blur_variance": round(blur_var, 1),
        "mean_brightness": round(mean_brightness, 1),
        "std_brightness": round(std_brightness, 1),
        "flags": flags,
    }


def image_quality_report(image_paths: list[Path], sample_size: int = 300) -> dict:
    sample = image_paths[:sample_size]
    scores = [s for s in (score_image_quality(p) for p in sample) if s is not None]
    flagged = [s for s in scores if s["flags"]]
    return {
        "images_scanned": len(scores),
        "images_total": len(image_paths),
        "sampled": len(image_paths) > sample_size,
        "flagged": flagged,
        "flagged_total": len(flagged),
    }


# ---- Class imbalance: instance count vs. image count are different metrics ----
# (100 instances could be 100 images with 1 box each, or 2 images with 50 boxes
# each — very different implications for training data diversity)


def class_balance_from_source_classes(source_classes: list[dict]) -> dict:
    """Per-dataset source-label balance, straight from the scan (source_classes =
    [{label, count}]) — no mapping table or normalization run required, so this is
    available the moment a dataset is registered, not just after it's been mapped
    and normalized. Flags any label far rarer than the dataset's most common one,
    per CLAUDE.md ยง4.4 ("flag any class with a low instance count early")."""
    if not source_classes:
        return {"classes": [], "max_count": 0, "flagged_labels": []}
    counts = [c["count"] for c in source_classes]
    max_count = max(counts)
    threshold = max(3, round(max_count * 0.05))  # rarer than 5% of the dominant label, or under 3 instances
    flagged = [c["label"] for c in source_classes if c["count"] < threshold]
    classes = sorted(source_classes, key=lambda c: -c["count"])
    return {"classes": classes, "max_count": max_count, "rarity_threshold": threshold, "flagged_labels": flagged}


# ---- Overall dataset health score: a single number rolling up every check below,
# so a QA reviewer gets an at-a-glance signal before drilling into any one report ----


def compute_health_score(
    num_images: int,
    dup_report: DuplicateReport,
    val_report: ValidationReport,
    outliers: dict,
    img_quality: dict,
    class_balance: dict,
) -> dict:
    breakdown: list[dict] = []
    score = 100.0

    dup_images = sum(len(g) for g in dup_report.exact_groups)
    dup_ratio = dup_images / max(num_images, 1)
    dup_penalty = min(20.0, dup_ratio * 100 * 1.5)
    if dup_penalty > 0.5:
        breakdown.append({"category": "duplicates", "penalty": round(dup_penalty, 1), "detail": f"{dup_images} image(s) in exact-duplicate groups"})
    score -= dup_penalty

    orphan_ratio = len(val_report.orphan_images) / max(val_report.images_checked, 1)
    orphan_penalty = min(15.0, orphan_ratio * 100 * 0.5)
    if orphan_penalty > 0.5:
        breakdown.append({"category": "orphan_images", "penalty": round(orphan_penalty, 1), "detail": f"{len(val_report.orphan_images)} image(s) with zero annotations"})
    score -= orphan_penalty

    bbox_ratio = len(val_report.bbox_warnings) / max(val_report.annotations_checked, 1)
    bbox_penalty = min(25.0, bbox_ratio * 100 * 2.0)
    if bbox_penalty > 0.5:
        breakdown.append({"category": "bbox_integrity", "penalty": round(bbox_penalty, 1), "detail": f"{len(val_report.bbox_warnings)} coordinate/geometry warning(s)"})
    score -= bbox_penalty

    outlier_ratio = outliers.get("flagged_total", 0) / max(outliers.get("boxes_checked", 0), 1)
    outlier_penalty = min(15.0, outlier_ratio * 100 * 0.75)
    if outlier_penalty > 0.5:
        breakdown.append({"category": "outliers", "penalty": round(outlier_penalty, 1), "detail": f"{outliers.get('flagged_total', 0)} aspect-ratio/size outlier box(es)"})
    score -= outlier_penalty

    iq_ratio = img_quality.get("flagged_total", 0) / max(img_quality.get("images_scanned", 0), 1)
    iq_penalty = min(15.0, iq_ratio * 100 * 0.75)
    if iq_penalty > 0.5:
        breakdown.append({"category": "image_quality", "penalty": round(iq_penalty, 1), "detail": f"{img_quality.get('flagged_total', 0)} blurry/over-under-exposed image(s)"})
    score -= iq_penalty

    n_flagged_labels = len(class_balance.get("flagged_labels", []))
    n_labels = max(len(class_balance.get("classes", [])), 1)
    balance_penalty = min(10.0, (n_flagged_labels / n_labels) * 20)
    if balance_penalty > 0.5:
        breakdown.append({"category": "class_balance", "penalty": round(balance_penalty, 1), "detail": f"{n_flagged_labels} source label(s) severely under-represented"})
    score -= balance_penalty

    score = max(0, round(score))
    if score >= 90:
        grade = "A"
    elif score >= 75:
        grade = "B"
    elif score >= 60:
        grade = "C"
    elif score >= 40:
        grade = "D"
    else:
        grade = "F"
    return {"score": score, "grade": grade, "breakdown": breakdown}


def class_balance_from_labels_dir(labels_dir: Path, class_by_id: dict) -> dict[str, dict]:
    instance_counts: dict[str, int] = defaultdict(int)
    image_counts: dict[str, int] = defaultdict(int)
    if not labels_dir.exists():
        return {}
    for label_file in labels_dir.glob("*.txt"):
        classes_in_image: set[str] = set()
        for line in label_file.read_text(encoding="utf-8", errors="ignore").splitlines():
            parts = line.split()
            if len(parts) != 5:
                continue
            try:
                cls_id = int(float(parts[0]))
            except ValueError:
                continue
            name = class_by_id.get(cls_id, {}).get("name", f"class_{cls_id}")
            instance_counts[name] += 1
            classes_in_image.add(name)
        for name in classes_in_image:
            image_counts[name] += 1
    return {
        name: {"instances": instance_counts.get(name, 0), "images": image_counts.get(name, 0)}
        for name in set(instance_counts) | set(image_counts)
    }
