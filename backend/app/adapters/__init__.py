from __future__ import annotations

from pathlib import Path

from app.adapters.base import DatasetAdapter
from app.adapters.coco import CocoJsonAdapter
from app.adapters.folder_classification import FolderClassificationAdapter
from app.adapters.voc import VocXmlAdapter
from app.adapters.yolo import YoloTxtAdapter

# Order matters: more specific / higher-confidence formats are probed first.
_ADAPTERS: list[DatasetAdapter] = [
    YoloTxtAdapter(),
    VocXmlAdapter(),
    CocoJsonAdapter(),
    FolderClassificationAdapter(),
]

_BY_NAME: dict[str, DatasetAdapter] = {a.format_name: a for a in _ADAPTERS}


def detect_adapter(path: Path) -> DatasetAdapter | None:
    for adapter in _ADAPTERS:
        if adapter.detect(path):
            return adapter
    return None


def get_adapter(format_name: str) -> DatasetAdapter:
    if format_name not in _BY_NAME:
        raise ValueError(
            f"Unknown/unsupported source_format '{format_name}'. "
            f"'custom' datasets need a purpose-built adapter implementing DatasetAdapter "
            f"before they can be scanned or normalized."
        )
    return _BY_NAME[format_name]
