"""Startup preflight checks for the SEO Dashboard backend.

Run before the web server starts (e.g. in Docker CMD) to verify that the
runtime environment is properly configured.  Each check prints a friendly
diagnostic message on failure so that non-technical self-hosting users can
quickly identify and resolve issues.

Usage:
    python -m app.preflight          # run all checks
    python -m app.preflight --quick  # run only critical checks
"""

from __future__ import annotations

import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger("preflight")


class PreflightError(RuntimeError):
    """A non-fatal preflight check failure."""


def check_database_path() -> None:
    """Verify the SQLite database directory is writable."""
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url.startswith("sqlite:///"):
        return  # non-SQLite databases don't need path checks

    # sqlite:////data/seo_tool.db -> /data/seo_tool.db
    db_path = db_url.replace("sqlite:///", "", 1)
    if not db_path:
        raise PreflightError("DATABASE_URL is set to SQLite but has no file path")

    db_dir = Path(db_path).parent
    if not db_dir.exists():
        raise PreflightError(
            f"Database directory does not exist: {db_dir}\n"
            f"  Fix: mkdir -p {db_dir} or check your Docker volume mount"
        )

    if not os.access(db_dir, os.W_OK):
        raise PreflightError(
            f"Database directory is not writable: {db_dir}\n"
            f"  Fix: chmod 755 {db_dir} or check directory ownership"
        )


def check_backup_directory() -> None:
    """Verify the backup directory exists and is writable."""
    backup_dir = os.getenv("BACKUP_DIR", "/data/backups")
    path = Path(backup_dir)
    if not path.exists():
        try:
            path.mkdir(parents=True, exist_ok=True)
            logger.info("Created backup directory: %s", backup_dir)
        except OSError as exc:
            raise PreflightError(
                f"Cannot create backup directory: {backup_dir}\n"
                f"  Error: {exc}\n"
                f"  Fix: create the directory manually or check volume mounts"
            ) from exc

    if not os.access(backup_dir, os.W_OK):
        raise PreflightError(
            f"Backup directory is not writable: {backup_dir}\n"
            f"  Fix: chmod 755 {backup_dir}"
        )


def check_jwt_secret() -> None:
    """Warn if JWT secret is using the development default."""
    secret = os.getenv("JWT_SECRET_KEY", "")
    env = os.getenv("ENV", os.getenv("APP_ENV", "development"))
    if env.lower() in ("prod", "production") and (not secret or len(secret) < 32):
        raise PreflightError(
            "JWT_SECRET_KEY is weak or missing for production.\n"
            "  Fix: set JWT_SECRET_KEY to a random string of at least 32 characters"
        )


def check_database_connection() -> None:
    """Verify database is reachable."""
    from app.db import check_database_connection as db_check

    ok, error = db_check()
    if not ok:
        raise PreflightError(
            f"Database connection failed: {error}\n"
            f"  Fix: check DATABASE_URL and ensure the database is accessible"
        )


def run_preflight(quick: bool = False) -> bool:
    """Run all preflight checks.  Returns True if all passed."""
    checks = [
        ("Database path", check_database_path),
        ("Backup directory", check_backup_directory),
        ("JWT secret", check_jwt_secret),
    ]

    if not quick:
        checks.append(("Database connection", check_database_connection))

    all_passed = True
    for name, check_fn in checks:
        try:
            check_fn()
            logger.info("[PASS] %s", name)
        except PreflightError as exc:
            logger.error("[FAIL] %s:\n  %s", name, exc)
            all_passed = False
        except Exception as exc:
            logger.error("[ERROR] %s: unexpected error: %s", name, exc)
            all_passed = False

    return all_passed


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    quick = "--quick" in sys.argv

    logger.info("Running startup preflight checks...")
    passed = run_preflight(quick=quick)

    if passed:
        logger.info("All preflight checks passed.")
    else:
        logger.warning(
            "Some preflight checks failed. The server will still start, "
            "but some features may not work correctly."
        )


if __name__ == "__main__":
    main()
