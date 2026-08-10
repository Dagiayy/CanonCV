from __future__ import annotations

from pathlib import Path
from typing import Iterator

from PIL import Image

from app.adapters.base import Annotation, DatasetScanResult, LabelCount
from app.config import IMAGE_EXTENSIONS

_SPLIT_NAMES = {"train": "train", "valid": "val", "val": "val", "test": "test"}

# Whole-image bbox: these datasets are single-subject crops (Roboflow classification
# export), not native detection data, so we approximate one instance filling the frame.
FULL_FRAME_BBOX = (0.5, 0.5, 1.0, 1.0)


def _find_split_dirs(path: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    for child in path.iterdir():
        if child.is_dir() and child.name.lower() in _SPLIT_NAMES:
            out[_SPLIT_NAMES[child.name.lower()]] = child
    return out


def _has_label_files(split_dirs: dict[str, Path]) -> bool:
    """Check only inside split dirs (not the dataset root) so root-level README.txt
    files don't get mistaken for a real annotation format."""
    for d in split_dirs.values():
        if any(d.rglob("*.txt")) or any(d.rglob("*.xml")) or any(d.rglob("*.json")):
            return True
    return False


class FolderClassificationAdapter:
    format_name = "folder_classification"

    def detect(self, path: Path) -> bool:
        splits = _find_split_dirs(path)
        if not splits:
            return False
        if _has_label_files(splits):
            return False  # a real annotation format takes precedence
        # at least one split must contain class subfolders with images directly inside
        for split_dir in splits.values():
            for class_dir in split_dir.iterdir():
                if class_dir.is_dir() and any(p.suffix.lower() in IMAGE_EXTENSIONS for p in class_dir.iterdir()):
                    return True
        return False

    def _iter_class_dirs(self, path: Path) -> Iterator[tuple[str, str, Path]]:
        for split, split_dir in _find_split_dirs(path).items():
            for class_dir in split_dir.iterdir():
                if class_dir.is_dir():
                    yield split, class_dir.name, class_dir

    def scan(self, path: Path) -> DatasetScanResult:
        warnings = [
            "This dataset is a whole-image classification export (folder-per-class), "
            "not native detection data. Each image is treated as one full-frame instance "
            "of its folder's class — spot-check samples before trusting box tightness."
        ]
        label_counts: dict[str, int] = {}
        num_images = 0
        widths: list[int] = []
        heights: list[int] = []
        formats_found: set[str] = set()
        splits_count: dict[str, int] = {}

        for split, label, class_dir in self._iter_class_dirs(path):
            imgs = [p for p in class_dir.iterdir() if p.suffix.lower() in IMAGE_EXTENSIONS]
            label_counts[label] = label_counts.get(label, 0) + len(imgs)
            splits_count[split] = splits_count.get(split, 0) + len(imgs)
            num_images += len(imgs)
            for img_path in imgs[:20]:  # sample-based image stats, these dirs can be large
                formats_found.add(img_path.suffix.lower())
                try:
                    with Image.open(img_path) as im:
                        widths.append(im.width)
                        heights.append(im.height)
                except Exception as e:
                    warnings.append(f"unreadable image {img_path}: {e}")

        image_stats = {
            "avg_width": sum(widths) / len(widths) if widths else 0,
            "avg_height": sum(heights) / len(heights) if heights else 0,
            "min_width": min(widths) if widths else 0,
            "max_width": max(widths) if widths else 0,
            "min_height": min(heights) if heights else 0,
            "max_height": max(heights) if heights else 0,
            "formats_found": sorted(formats_found),
            "splits": splits_count,
            "sampled_for_resolution_stats": True,
        }

        return DatasetScanResult(
            source_format=self.format_name,
            num_images=num_images,
            num_annotations=num_images,  # one full-frame instance per image
            source_classes=[LabelCount(label=k, count=v) for k, v in sorted(label_counts.items())],
            image_stats=image_stats,
            warnings=warnings,
        )

    def read_annotations(self, path: Path) -> Iterator[Annotation]:
        for split, label, class_dir in self._iter_class_dirs(path):
            for img_path in class_dir.iterdir():
                if img_path.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                try:
                    with Image.open(img_path) as im:
                        w, h = im.width, im.height
                except Exception:
                    continue
                yield Annotation(
                    image_path=img_path,
                    image_width=w,
                    image_height=h,
                    source_label=label,
                    bbox=FULL_FRAME_BBOX,
                    split=split,
                )
