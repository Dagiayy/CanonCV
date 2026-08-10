from __future__ import annotations

from pathlib import Path
from typing import Iterator

import yaml
from PIL import Image

from app.adapters.base import Annotation, DatasetScanResult, LabelCount
from app.config import IMAGE_EXTENSIONS


def _find_data_yaml(path: Path) -> Path | None:
    direct = path / "data.yaml"
    if direct.exists():
        return direct
    matches = list(path.glob("*.yaml")) + list(path.glob("*.yml"))
    return matches[0] if matches else None


def _resolve_split_dir(yaml_path: Path, rel: str) -> Path | None:
    p = (yaml_path.parent / rel).resolve()
    if p.exists():
        return p
    # Roboflow's data.yaml often assumes it sits one level below the dataset root
    # (hence "../train/images"), but single-export datasets put it at the root —
    # fall back to stripping leading "../" and resolving relative to the yaml itself.
    cleaned = rel.lstrip("./").replace("../", "")
    p2 = (yaml_path.parent / cleaned).resolve()
    return p2 if p2.exists() else None


def _iter_split_dirs(yaml_path: Path, cfg: dict) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for split in ("train", "val", "test"):
        rel = cfg.get(split)
        if not rel:
            continue
        d = _resolve_split_dir(yaml_path, rel)
        if d:
            out[split] = d
    return out


def _labels_dir_for_images(images_dir: Path) -> Path:
    parts = list(images_dir.parts)
    for i in range(len(parts) - 1, -1, -1):
        if parts[i].lower() == "images":
            parts[i] = "labels"
            return Path(*parts)
    return images_dir.parent / "labels"


def _find_images(images_dir: Path) -> list[Path]:
    """Recursive: some exports nest images one or more levels below the declared
    split dir (e.g. train/images/val/*.jpg) instead of flat — walk the whole subtree
    and pair by relative path rather than assuming a flat layout."""
    return [p for p in images_dir.rglob("*") if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS]


def _label_path_for(img_path: Path, images_dir: Path, labels_dir: Path) -> Path:
    rel = img_path.relative_to(images_dir)
    return (labels_dir / rel).with_suffix(".txt")


class YoloTxtAdapter:
    format_name = "yolo"

    def detect(self, path: Path) -> bool:
        return _find_data_yaml(path) is not None

    def _load(self, path: Path) -> tuple[dict, dict[str, Path], list[str]]:
        yaml_path = _find_data_yaml(path)
        if yaml_path is None:
            raise ValueError(f"No data.yaml found under {path}")
        cfg = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
        names = cfg.get("names")
        if isinstance(names, dict):
            names = [names[k] for k in sorted(names, key=lambda x: int(x))]
        names = list(names or [])
        splits = _iter_split_dirs(yaml_path, cfg)
        return cfg, splits, names

    def scan(self, path: Path) -> DatasetScanResult:
        warnings: list[str] = []
        _, splits, names = self._load(path)
        if not splits:
            warnings.append("data.yaml found but no train/val/test image directories resolved")

        label_counts: dict[str, int] = {}
        num_images = 0
        num_annotations = 0
        widths: list[int] = []
        heights: list[int] = []
        formats_found: set[str] = set()
        splits_count: dict[str, int] = {}

        for split, images_dir in splits.items():
            labels_dir = _labels_dir_for_images(images_dir)
            image_files = _find_images(images_dir)
            splits_count[split] = len(image_files)
            num_images += len(image_files)
            image_rels = set()
            for img_path in image_files:
                formats_found.add(img_path.suffix.lower())
                rel = img_path.relative_to(images_dir)
                image_rels.add(rel.with_suffix(""))
                label_path = _label_path_for(img_path, images_dir, labels_dir)
                if not label_path.exists():
                    warnings.append(f"[{split}] no label file for image {rel}")
                    continue
                try:
                    with Image.open(img_path) as im:
                        widths.append(im.width)
                        heights.append(im.height)
                except Exception as e:
                    warnings.append(f"[{split}] unreadable image {rel}: {e}")
                    continue
                for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split()
                    try:
                        cls_id = int(float(parts[0]))
                    except (ValueError, IndexError):
                        warnings.append(f"[{split}] malformed label line in {label_path.name}: {line!r}")
                        continue
                    label = names[cls_id] if 0 <= cls_id < len(names) else f"__unknown_id_{cls_id}"
                    label_counts[label] = label_counts.get(label, 0) + 1
                    num_annotations += 1

            # orphan label files (no matching image)
            if labels_dir.exists():
                for lbl in labels_dir.rglob("*.txt"):
                    rel = lbl.relative_to(labels_dir).with_suffix("")
                    if rel not in image_rels:
                        warnings.append(f"[{split}] orphan label file with no matching image: {lbl.relative_to(labels_dir)}")

        image_stats = {
            "avg_width": sum(widths) / len(widths) if widths else 0,
            "avg_height": sum(heights) / len(heights) if heights else 0,
            "min_width": min(widths) if widths else 0,
            "max_width": max(widths) if widths else 0,
            "min_height": min(heights) if heights else 0,
            "max_height": max(heights) if heights else 0,
            "formats_found": sorted(formats_found),
            "splits": splits_count,
        }

        return DatasetScanResult(
            source_format=self.format_name,
            num_images=num_images,
            num_annotations=num_annotations,
            source_classes=[LabelCount(label=k, count=v) for k, v in sorted(label_counts.items())],
            image_stats=image_stats,
            warnings=warnings,
        )

    def read_annotations(self, path: Path) -> Iterator[Annotation]:
        _, splits, names = self._load(path)
        for split, images_dir in splits.items():
            labels_dir = _labels_dir_for_images(images_dir)
            for img_path in _find_images(images_dir):
                label_path = _label_path_for(img_path, images_dir, labels_dir)
                if not label_path.exists():
                    continue
                try:
                    with Image.open(img_path) as im:
                        w, h = im.width, im.height
                except Exception:
                    continue
                for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    parts = line.split()
                    try:
                        cls_id = int(float(parts[0]))
                        nums = [float(x) for x in parts[1:]]
                    except ValueError:
                        continue
                    if len(nums) == 4:
                        xc, yc, bw, bh = nums
                    elif len(nums) >= 6 and len(nums) % 2 == 0:
                        # polygon (segmentation-style yolo txt): collapse to bbox
                        xs = nums[0::2]
                        ys = nums[1::2]
                        xmin, xmax = min(xs), max(xs)
                        ymin, ymax = min(ys), max(ys)
                        xc, yc, bw, bh = (xmin + xmax) / 2, (ymin + ymax) / 2, xmax - xmin, ymax - ymin
                    else:
                        continue
                    label = names[cls_id] if 0 <= cls_id < len(names) else f"__unknown_id_{cls_id}"
                    yield Annotation(
                        image_path=img_path,
                        image_width=w,
                        image_height=h,
                        source_label=label,
                        bbox=(xc, yc, bw, bh),
                        split=split,
                    )
