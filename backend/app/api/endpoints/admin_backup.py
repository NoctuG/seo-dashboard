from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.engine import make_url
from sqlmodel import Session

from app.core.error_codes import ErrorCode
from app.api.deps import require_superuser, write_audit_log
from app.config import BASE_DIR, settings
from app.db import get_session
from app.models import AuditActionType, User

router = APIRouter()

_ALLOWED_BACKUP_SUFFIXES = {".db", ".sqlite", ".sqlite3", ".bak"}


class BackupResponse(BaseModel):
    backup_file: str
    backup_size_bytes: int
    created_at: str


class RestoreRequest(BaseModel):
    backup_file: str = Field(..., description="Backup file path returned by /admin/backup")
    confirm_phrase: str = Field(..., description="Must be exactly RESTORE")


class RestoreResponse(BaseModel):
    restored_from: str
    restored_at: str


def _sqlite_db_path() -> Path:
    db_url = make_url(settings.DATABASE_URL)
    if db_url.get_backend_name() != "sqlite":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorCode.BACKUP_RESTORE_CURRENTLY_SUPPORTS_SQLITE_ONLY,
        )

    db_name = db_url.database
    if not db_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.INVALID_SQLITE_DATABASE_PATH)

    return Path(db_name).resolve()


def _backup_dir() -> Path:
    configured = Path(settings.BACKUP_DIR).expanduser()
    return configured.resolve() if configured.is_absolute() else (BASE_DIR / configured).resolve()


def _ensure_allowed_backup_file(candidate: Path, backup_dir: Path) -> Path:
    target = candidate.expanduser().resolve()
    try:
        target.relative_to(backup_dir)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.BACKUP_FILE_MUST_BE_INSIDE_BACKUP_DIR) from exc

    if target.suffix.lower() not in _ALLOWED_BACKUP_SUFFIXES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.UNSUPPORTED_BACKUP_FILE_FORMAT)

    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ErrorCode.BACKUP_FILE_NOT_FOUND)

    if target.stat().st_size == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.BACKUP_FILE_IS_EMPTY)

    with target.open("rb") as f:
        header = f.read(16)
    if header != b"SQLite format 3\x00":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.INVALID_SQLITE_BACKUP_HEADER)

    return target


@router.post("/backup", response_model=BackupResponse)
def create_backup(
    current_user: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    db_path = _sqlite_db_path()
    backup_dir = _backup_dir()
    backup_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    backup_path = backup_dir / f"seo-backup-{timestamp}.db"

    # SQLite 文件级快照：通过锁获取停写窗口，然后复制文件。
    import shutil
    import sqlite3

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("BEGIN IMMEDIATE")
        shutil.copy2(db_path, backup_path)
        conn.commit()
    finally:
        conn.close()

    write_audit_log(
        session=session,
        action=AuditActionType.BACKUP_CREATE,
        user_id=current_user.id,
        entity_type="database",
        entity_id=None,
        metadata={"backup_file": str(backup_path)},
    )

    return BackupResponse(
        backup_file=str(backup_path),
        backup_size_bytes=backup_path.stat().st_size,
        created_at=datetime.now(timezone.utc).isoformat(),
    )


@router.post("/restore", response_model=RestoreResponse)
def restore_backup(
    payload: RestoreRequest,
    current_user: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    if payload.confirm_phrase != "RESTORE":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.INVALID_CONFIRMATION_PHRASE)

    db_path = _sqlite_db_path()
    backup_dir = _backup_dir()
    backup_file = _ensure_allowed_backup_file(Path(payload.backup_file), backup_dir)

    import shutil

    shutil.copy2(backup_file, db_path)

    write_audit_log(
        session=session,
        action=AuditActionType.BACKUP_RESTORE,
        user_id=current_user.id,
        entity_type="database",
        entity_id=None,
        metadata={"restored_from": str(backup_file)},
    )

    return RestoreResponse(
        restored_from=str(backup_file),
        restored_at=datetime.now(timezone.utc).isoformat(),
    )
