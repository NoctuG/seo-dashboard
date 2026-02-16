import os
import sqlite3
import subprocess
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


def _run_alembic(db_file: Path, *args: str) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_file}"
    return subprocess.run(
        ["alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def _db_versions(db_file: Path) -> list[str]:
    connection = sqlite3.connect(db_file)
    try:
        rows = connection.execute("SELECT version_num FROM alembic_version ORDER BY version_num").fetchall()
    finally:
        connection.close()
    return [row[0] for row in rows]


def test_alembic_scripts_have_single_head(tmp_path):
    result = _run_alembic(tmp_path / "heads_probe.db", "heads")

    assert result.stdout.strip().splitlines() == ["ab12cd34ef56 (head)"]


def test_fresh_database_upgrade_reaches_single_head(tmp_path):
    db_file = tmp_path / "fresh_upgrade.db"

    _run_alembic(db_file, "upgrade", "head")

    assert _db_versions(db_file) == ["ab12cd34ef56"]


def test_existing_database_upgrade_path_merges_to_single_head(tmp_path):
    db_file = tmp_path / "existing_upgrade.db"

    _run_alembic(db_file, "upgrade", "c3d4e5f6a7b8")
    _run_alembic(db_file, "upgrade", "head")

    assert _db_versions(db_file) == ["ab12cd34ef56"]
