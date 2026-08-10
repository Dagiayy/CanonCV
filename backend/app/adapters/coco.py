from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator

from app.adapters.base import Annotation, DatasetScanResult, LabelCount
from app.config import IMAGE_EXTENSIONS

_SPLIT_HINTS = ("train", "val", "valid", "test")


def _find_coco_jsons(path: Path) -> list[Path]:
    out = []
    for p in path.rglob("*.json"):
        try:
            head = p.read_text(encoding="utf-8", errors="ignore")[:2000]
        except Exception:
            continue
        if '"images"' in head and '"annotations"' in head and '"categories"' in head:
            out.append(p)
    return out


def _split_for(json_path: Path) -> str:
    name = json_path.stem.lower() + " " + json_path.parent.name.lower()
    if "val" in name:
        return "val"
    if "test" in name:
        return "test"
    return "train"


class CocoJsonAdapter:
    """Standard COCO detection JSON (images/annotations/categories, xywh bbox in pixels)."""

    format_name = "coco_json"

    def detect(self, path: Path) -> bool:
        return len(_find_coco_jsons(path)) > 0

    def scan(self, path: Path) -> DatasetScanResult:
        warnings: list[str] = []
        label_counts: dict[str, int] = {}
        num_images = 0
        num_annotations = 0
        widths: list[int] = []
        heights: list[int] = []
        formats_found: set[str] = set()
        splits_count: dict[str, int] = {}

        for json_path in _find_coco_jsons(path):
            split = _split_for(json_path)
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as e:
                warnings.append(f"malformed COCO json {json_path.name}: {e}")
                continue
            cats = {c["id"]: c["name"] for c in data.get("categories", [])}
            images = {im["id"]: im for im in data.get("images", [])}
            num_images += len(images)
            splits_count[split] = splits_count.get(split, 0) + len(images)
            for im in images.values():
                w, h = im.get("width", 0), im.get("height", 0)
                if w and h:
                    widths.append(w)
                    heights.append(h)
                fn = im.get("file_name", "")
                if fn:
                    formats_found.add(Path(fn).suffix.lower())
            for ann in data.get("annotations", []):
                cat_id = ann.get("category_id")
                label = cats.get(cat_id, f"__unknown_id_{cat_id}")
                bbox = ann.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                label_counts[label] = label_counts.get(label, 0) + 1
                num_annotations += 1

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
        for json_path in _find_coco_jsons(path):
            split = _split_for(json_path)
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            cats = {c["id"]: c["name"] for c in data.get("categories", [])}
            images = {im["id"]: im for im in data.get("images", [])}

            # Images typically sit next to the json, or under an images/ dir beside it.
            search_dirs = [json_path.parent, json_path.parent / "images"]

            def resolve_image(file_name: str) -> Path | None:
                for d in search_dirs:
                    cand = d / file_name
                    if cand.exists():
                        return cand
                for d in search_dirs:
                    matches = list(d.glob(f"**/{Path(file_name).name}")) if d.exists() else []
                    if matches:
                        return matches[0]
                return None

            for ann in data.get("annotations", []):
                im = images.get(ann.get("image_id"))
                if im is None:
                    continue
                w, h = im.get("width", 0), im.get("height", 0)
                if not w or not h:
                    continue
                img_path = resolve_image(im.get("file_name", ""))
                if img_path is None or img_path.suffix.lower() not in IMAGE_EXTENSIONS:
                    continue
                bbox = ann.get("bbox")
                if not bbox or len(bbox) != 4:
                    continue
                x, y, bw, bh = bbox  # COCO: top-left xywh, pixels
                xc = (x + bw / 2) / w
                yc = (y + bh / 2) / h
                label = cats.get(ann.get("category_id"), f"__unknown_id_{ann.get('category_id')}")
                yield Annotation(
                    image_path=img_path,
                    image_width=w,
                    image_height=h,
                    source_label=label,
                    bbox=(xc, yc, bw / w, bh / h),
                    split=split,
                )
