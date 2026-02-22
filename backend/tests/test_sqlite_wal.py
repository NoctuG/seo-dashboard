"""Tests for SQLite WAL mode configuration."""

import os
from unittest.mock import patch


def test_sqlite_wal_enabled_on_connect():
    """Verify that SQLite connections get WAL mode and busy_timeout."""
    from app.config import settings

    if not settings.DATABASE_URL.startswith("sqlite:///"):
        return  # skip for non-SQLite

    from app.db import engine
    from sqlmodel import Session, text

    with Session(engine) as session:
        result = session.exec(text("PRAGMA journal_mode")).one()
        assert result[0] == "wal", f"Expected WAL mode, got {result[0]}"

        timeout_result = session.exec(text("PRAGMA busy_timeout")).one()
        assert int(timeout_result[0]) >= 5000, f"Expected busy_timeout >= 5000, got {timeout_result[0]}"
