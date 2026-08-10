from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterator, Protocol


@dataclass
class Annotation:
    """One object instance, already normalized to bbox (x_center, y_center, w, h) in [0,1]."""

    image_path: Path  # absolute path to the source image
    image_width: int
    image_height: int
    source_label: str
    bbox: tuple[float, float, float, float]  # x_center, y_center, w, h — normalized
    split: str = "train"  # train | val | test, best-effort from source dataset layout


@dataclass
class LabelCount:
    label: str
    count: int


@dataclass
class DatasetScanResult:
    source_format: str
    num_images: int
    num_annotations: int
    source_classes: list[LabelCount]
    image_stats: dict
    warnings: list[str] = field(default_factory=list)


class DatasetAdapter(Protocol):
    """Pluggable per-format interface. Adding a new source format means implementing
    this once — nothing else in the scanner/mapping-engine/job-runner changes."""

    format_name: str

    def detect(self, path: Path) -> bool:
        """Return True if `path` looks like this adapter's format."""
        ...

    def scan(self, path: Path) -> DatasetScanResult: ...

    def read_annotations(self, path: Path) -> Iterator[Annotation]: ...


def write_yolo_label(lines: list[str], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
