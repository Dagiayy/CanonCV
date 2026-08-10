import os
from pathlib import Path

# Project root = the AATB CV repo root (parent of backend/). Overridable so the
# same image works both bare-metal (paths derived from this file's location) and
# in Docker (paths coming from bind-mounted volumes via env vars).
PROJECT_ROOT = Path(__file__).resolve().parents[2]

# Where as-downloaded source datasets live. Never written to by this system.
RAW_DATASETS_DIR = Path(os.environ.get("RAW_DATASETS_DIR", PROJECT_ROOT / "normalization datases"))

# All system-owned data: db, normalized output, mapping table exports, review crops.
DATA_DIR = Path(os.environ.get("DATA_DIR", PROJECT_ROOT / "data"))
DB_PATH = DATA_DIR / "app.db"
NORMALIZED_DIR = DATA_DIR / "normalized"
MAPPING_TABLES_EXPORT_DIR = DATA_DIR / "mapping_tables"
REVIEW_CROPS_DIR = DATA_DIR / "review_queue_crops"
CLASS_STATS_PATH = DATA_DIR / "class_stats.json"
DATA_CARD_PATH = DATA_DIR / "data_card.md"

for d in (DATA_DIR, NORMALIZED_DIR, MAPPING_TABLES_EXPORT_DIR, REVIEW_CROPS_DIR):
    d.mkdir(parents=True, exist_ok=True)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp"}

# Max sample images / crops to generate for UI spot-checking, per label.
MAX_SAMPLES_PER_LABEL = 6
