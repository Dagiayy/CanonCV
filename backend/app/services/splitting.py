"""Dataset splitting — §7 of the platform roadmap. Builds a reproducible,
class-stratified train/val/test (or k-fold) assignment over the combined
output of one or more normalization runs.

Grouping (group_by="source_dataset") keeps every image from one source
dataset in a single split — useful when you want a genuine cross-dataset
generalization test. The default (group_by="none") is a per-image stratified
split. Note: true video/scene-level grouping (so consecutive frames of the
same stationary scene never straddle train/test) needs per-image site/video
identifiers that don't exist yet — that lands with the video-ingestion work.
"""
from __future__ import annotations

import random
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from app import models
from app.services.paths import resolve_run_output


@dataclass
class Group:
    key: str
    items: list[dict] = field(default_factory=list)  # [{run_id, filename, classes: set[str]}]

    @property
    def classes(self) -> set[str]:
        out: set[str] = set()
        for it in self.items:
            out |= it["classes"]
        return out


def _read_label_classes(labels_dir: Path, filename: str, class_by_id: dict) -> set[str]:
    label_path = labels_dir / (Path(filename).stem + ".txt")
    if not label_path.exists():
        return set()
    classes: set[str] = set()
    for line in label_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) != 5:
            continue
        try:
            cls_id = int(float(parts[0]))
        except ValueError:
            continue
        classes.add(class_by_id.get(cls_id, {}).get("name", f"class_{cls_id}"))
    return classes


def _build_groups(runs: list[models.NormalizationRun], class_by_id: dict, group_by: str) -> list[Group]:
    groups: dict[str, Group] = {}
    for run in runs:
        if not run.output_path:
            continue
        images_dir = resolve_run_output(run) / "images"
        labels_dir = resolve_run_output(run) / "labels"
        if not images_dir.exists():
            continue
        for img in sorted(images_dir.iterdir()):
            if not img.is_file():
                continue
            classes = _read_label_classes(labels_dir, img.name, class_by_id)
            item = {"run_id": run.id, "filename": img.name, "classes": classes}
            key = run.dataset_id if group_by == "source_dataset" else f"{run.id}:{img.name}"
            groups.setdefault(key, Group(key=key)).items.append(item)
    return list(groups.values())


def _target_ratios(k_folds: int | None, train_ratio: float, val_ratio: float, test_ratio: float) -> dict[str, float]:
    if k_folds:
        share = 1.0 / k_folds
        return {f"fold_{i}": share for i in range(k_folds)}
    return {"train": train_ratio, "val": val_ratio, "test": test_ratio}


def build_split(
    runs: list[models.NormalizationRun],
    class_by_id: dict,
    group_by: str = "none",
    train_ratio: float = 0.8,
    val_ratio: float = 0.1,
    test_ratio: float = 0.1,
    seed: int = 42,
    k_folds: int | None = None,
) -> tuple[list[dict], dict]:
    groups = _build_groups(runs, class_by_id, group_by)
    if not groups:
        return [], {}

    rng = random.Random(seed)
    rng.shuffle(groups)  # reproducible tie-break order before rarity sort

    global_class_counts: dict[str, int] = defaultdict(int)
    for g in groups:
        for c in g.classes:
            global_class_counts[c] += 1

    def rarity_score(g: Group) -> float:
        if not g.classes:
            return 0.0
        return sum(1.0 / global_class_counts[c] for c in g.classes)

    groups.sort(key=rarity_score, reverse=True)

    target_ratios = _target_ratios(k_folds, train_ratio, val_ratio, test_ratio)
    split_names = list(target_ratios.keys())

    split_class_counts: dict[str, dict[str, int]] = {s: defaultdict(int) for s in split_names}
    split_group_counts: dict[str, int] = defaultdict(int)
    total_groups = len(groups)

    assignments: list[dict] = []
    for g in groups:
        best_split = None
        best_deficit = None
        for s in split_names:
            if g.classes:
                # Fractional (not absolute) shortfall, and take the WORST-served
                # class in the group, not the sum — summing absolute counts lets
                # ubiquitous classes (present in nearly every image) drown out the
                # signal from a genuinely rare class also in the group, starving
                # it out of val/test entirely. Normalizing by each class's own
                # target puts rare and common classes on equal footing, and using
                # the max means "this group's rarest need" drives the placement.
                deficit = max(
                    (
                        (target_ratios[s] * global_class_counts[c] - split_class_counts[s][c])
                        / max(target_ratios[s] * global_class_counts[c], 1e-9)
                    )
                    for c in g.classes
                )
            else:
                # background/empty images: balance purely by group count share
                deficit = target_ratios[s] * total_groups - split_group_counts[s]
            if best_deficit is None or deficit > best_deficit:
                best_deficit = deficit
                best_split = s
        for c in g.classes:
            split_class_counts[best_split][c] += 1
        split_group_counts[best_split] += 1
        for item in g.items:
            assignments.append({"run_id": item["run_id"], "filename": item["filename"], "split": best_split})

    stats = {
        s: {
            "images": split_group_counts[s] if group_by != "source_dataset" else sum(
                1 for a in assignments if a["split"] == s
            ),
            "classes": dict(split_class_counts[s]),
        }
        for s in split_names
    }
    return assignments, stats
