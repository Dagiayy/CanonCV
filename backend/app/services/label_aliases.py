"""Confident, unambiguous source-label -> canonical-class-name aliases.

Shared by auto_label.py (pretrained COCO detections) and annotate_ops.py
(structured external datasets translating their own label files by name).
Exact canonical names always match with no lookup needed; this only adds
well-known synonyms the SoR/CLAUDE.md taxonomy treats as unambiguous (e.g. a
generic "person" detection is unambiguously our `pedestrian` class). Anything
genuinely ambiguous (a generic "bus" that could be minibus/mid_bus/large_bus,
a "van" that could be car/minibus) is deliberately left OUT so it still
surfaces as needs_review rather than being silently guessed — see CLAUDE.md
§4.3, "never guess silently."
"""
from __future__ import annotations

CANONICAL_ALIASES: dict[str, str] = {
    "person": "pedestrian",
    "pedestrians": "pedestrian",
    "pedestrian_walking": "pedestrian",
    "walker": "pedestrian",
    "bike": "bicycle",
    "bikes": "bicycle",
    "cyclist": "bicycle",
    "cyclists": "bicycle",
    "cycle": "bicycle",
    "pedal_cycle": "bicycle",
    "bicycles": "bicycle",
    "motorbike": "motorcycle",
    "motorbikes": "motorcycle",
    "motorcycles": "motorcycle",
    "e_bike": "e_bike",
    "ebike": "e_bike",
    "electric_bicycle": "e_bike",
    "electric_bike": "e_bike",
    "cargo_bicycle": "cargo_bike",
    "delivery_bike": "cargo_bike",
    "scooter": "e_scooter",
    "e_scooter": "e_scooter",
    "escooter": "e_scooter",
    "kick_scooter": "e_scooter",
    "electric_scooter": "e_scooter",
    "auto_rickshaw": "bajaj",
    "autorickshaw": "bajaj",
    "tuk_tuk": "bajaj",
    "tuktuk": "bajaj",
    "rickshaw": "bajaj",
    "three_wheeler": "bajaj",
    "three_wheeled_vehicle": "bajaj",
    "cars": "car",
    "sedan": "car",
    "trucks": "truck",
    "pickup": "truck",
    "pickup_truck": "truck",
    "lorry": "truck",
}


def resolve_canonical_name(source_label: str) -> str:
    """Normalize a source label and resolve it to the canonical class name it
    unambiguously represents, or return the normalized label unchanged if it's
    not a known alias (leaving the exact-match / needs_review logic in the
    caller to decide)."""
    key = source_label.strip().lower().replace(" ", "_").replace("-", "_")
    return CANONICAL_ALIASES.get(key, key)
