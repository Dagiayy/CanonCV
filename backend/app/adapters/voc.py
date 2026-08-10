from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Iterator

from app.adapters.base import Annotation, DatasetScanResult, LabelCount
from app.config import IMAGE_EXTENSIONS


def _split_name(annotations_dir: Path) -> str:
    name = annotations_dir.parent.name.lower()
    if "train" in name:
        return "train"
    if "val" in name:
        return "val"
    if "test" in name:
        return "test"
    return "train"


def _find_split_pairs(path: Path, max_depth: int = 4) -> list[tuple[Path, Path]]:
    """Find every (Annotations, JPEGImages) sibling-dir pair under `path`."""
    pairs: list[tuple[Path, Path]] = []
    root_depth = len(path.parts)
    for ann_dir in path.rglob("Annotations"):
        if len(ann_dir.parts) - root_depth > max_depth:
            continue
        img_dir = ann_dir.parent / "JPEGImages"
        if img_dir.exists():
            pairs.append((ann_dir, img_dir))
    return pairs


def _find_image_for(img_dir: Path, filename_hint: str, stem_fallback: str) -> Path | None:
    if filename_hint:
        cand = img_dir / filename_hint
        if cand.exists():
            return cand
    for ext in IMAGE_EXTENSIONS:
        cand = img_dir / (stem_fallback + ext)
        if cand.exists():
            return cand
    return None


class VocXmlAdapter:
    format_name = "voc_xml"

    def detect(self, path: Path) -> bool:
        return len(_find_split_pairs(path)) > 0

    def scan(self, path: Path) -> DatasetScanResult:
        warnings: list[str] = []
        label_counts: dict[str, int] = {}
        num_images = 0
        num_annotations = 0
        widths: list[int] = []
        heights: list[int] = []
        formats_found: set[str] = set()
        splits_count: dict[str, int] = {}

        for ann_dir, img_dir in _find_split_pairs(path):
            split = _split_name(ann_dir)
            xml_files = list(ann_dir.glob("*.xml"))
            splits_count[split] = splits_count.get(split, 0) + len(xml_files)
            num_images += len(xml_files)
            for xml_path in xml_files:
                try:
                    root = ET.parse(xml_path).getroot()
                except ET.ParseError as e:
                    warnings.append(f"[{split}] malformed xml {xml_path.name}: {e}")
                    continue
                filename = (root.findtext("filename") or "").strip()
                img_path = _find_image_for(img_dir, filename, xml_path.stem)
                if img_path is None:
                    warnings.append(f"[{split}] no matching image for annotation {xml_path.name}")
                else:
                    formats_found.add(img_path.suffix.lower())
                size = root.find("size")
                if size is not None:
                    w = int(float(size.findtext("width", "0")))
                    h = int(float(size.findtext("height", "0")))
                    if w > 0 and h > 0:
                        widths.append(w)
                        heights.append(h)
                for obj in root.findall("object"):
                    label = (obj.findtext("name") or "").strip()
                    if not label:
                        continue
                    label_counts[label] = label_counts.get(label, 0) + 1
                    num_annotations += 1

            # orphan images (no annotation xml)
            xml_stems = {p.stem for p in xml_files}
            for img in img_dir.iterdir():
                if img.suffix.lower() in IMAGE_EXTENSIONS and img.stem not in xml_stems:
                    warnings.append(f"[{split}] orphan image with no annotation: {img.name}")

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
        for ann_dir, img_dir in _find_split_pairs(path):
            split = _split_name(ann_dir)
            for xml_path in ann_dir.glob("*.xml"):
                try:
                    root = ET.parse(xml_path).getroot()
                except ET.ParseError:
                    continue
                filename = (root.findtext("filename") or "").strip()
                img_path = _find_image_for(img_dir, filename, xml_path.stem)
                if img_path is None:
                    continue
                size = root.find("size")
                if size is None:
                    continue
                w = int(float(size.findtext("width", "0")))
                h = int(float(size.findtext("height", "0")))
                if w <= 0 or h <= 0:
                    continue
                for obj in root.findall("object"):
                    label = (obj.findtext("name") or "").strip()
                    bnd = obj.find("bndbox")
                    if not label or bnd is None:
                        continue
                    try:
                        xmin = float(bnd.findtext("xmin"))
                        ymin = float(bnd.findtext("ymin"))
                        xmax = float(bnd.findtext("xmax"))
                        ymax = float(bnd.findtext("ymax"))
                    except (TypeError, ValueError):
                        continue
                    xc = ((xmin + xmax) / 2) / w
                    yc = ((ymin + ymax) / 2) / h
                    bw = (xmax - xmin) / w
                    bh = (ymax - ymin) / h
                    yield Annotation(
                        image_path=img_path,
                        image_width=w,
                        image_height=h,
                        source_label=label,
                        bbox=(xc, yc, bw, bh),
                        split=split,
                    )
