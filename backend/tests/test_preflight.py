"""Tests for the startup preflight checks."""

import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from app.preflight import (
    PreflightError,
    check_backup_directory,
    check_database_path,
    check_jwt_secret,
    run_preflight,
)


class TestCheckDatabasePath:
    def test_non_sqlite_skips(self):
        with patch.dict(os.environ, {"DATABASE_URL": "postgresql://localhost/test"}):
            # Should not raise for non-SQLite
            check_database_path()

    def test_sqlite_valid_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            with patch.dict(os.environ, {"DATABASE_URL": f"sqlite:///{db_path}"}):
                check_database_path()

    def test_sqlite_nonexistent_dir(self):
        with patch.dict(os.environ, {"DATABASE_URL": "sqlite:////nonexistent/path/test.db"}):
            with pytest.raises(PreflightError, match="does not exist"):
                check_database_path()


class TestCheckBackupDirectory:
    def test_creates_missing_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            backup_path = os.path.join(tmpdir, "backups")
            with patch.dict(os.environ, {"BACKUP_DIR": backup_path}):
                check_backup_directory()
                assert Path(backup_path).exists()

    def test_existing_writable_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"BACKUP_DIR": tmpdir}):
                check_backup_directory()


class TestCheckJwtSecret:
    def test_development_mode_weak_secret_ok(self):
        with patch.dict(os.environ, {"ENV": "development", "JWT_SECRET_KEY": "short"}):
            check_jwt_secret()  # should not raise in dev

    def test_production_weak_secret_fails(self):
        with patch.dict(os.environ, {"ENV": "production", "JWT_SECRET_KEY": "short"}):
            with pytest.raises(PreflightError, match="JWT_SECRET_KEY"):
                check_jwt_secret()

    def test_production_strong_secret_ok(self):
        with patch.dict(os.environ, {"ENV": "production", "JWT_SECRET_KEY": "a" * 64}):
            check_jwt_secret()


class TestRunPreflight:
    def test_quick_mode_skips_db_connection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = os.path.join(tmpdir, "test.db")
            with patch.dict(os.environ, {
                "DATABASE_URL": f"sqlite:///{db_path}",
                "BACKUP_DIR": tmpdir,
                "ENV": "development",
                "JWT_SECRET_KEY": "test-secret",
            }):
                result = run_preflight(quick=True)
                assert result is True
