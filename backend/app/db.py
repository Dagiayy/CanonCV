from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DB_PATH

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added to existing tables after their first release. There's no migrations
# framework here (sqlite + a single-file app db) — Base.metadata.create_all only
# creates missing TABLES, not missing COLUMNS on ones that already exist, so a
# column added to a model after someone already has an app.db would otherwise be
# silently absent until they delete their database. ADD COLUMN is safe in sqlite
# for simple nullable/defaulted columns like these.
_NEW_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "exports": [
        ("export_format", "VARCHAR NOT NULL DEFAULT 'yolo'"),
        ("yolo_variant", "VARCHAR NOT NULL DEFAULT 'yolo26'"),
    ],
}


def _apply_column_migrations() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _NEW_COLUMNS.items():
            if table not in existing_tables:
                continue  # create_all just made it fresh, already has every column
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl_type in columns:
                if name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl_type}"))


def init_db():
    from app import models  # noqa: F401 ensure models are registered on Base

    Base.metadata.create_all(bind=engine)
    _apply_column_migrations()
