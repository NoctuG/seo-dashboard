import hashlib
import json
import secrets
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.api.deps import require_project_role, write_audit_log
from app.db import get_session
from app.models import ApiKey, AuditActionType, Project, ProjectRoleType, User
from app.schemas import ApiKeyCreate, ApiKeyCreateResponse, ApiKeyRead

router = APIRouter()


def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()




def _ensure_project_exists(session: Session, project_id: int) -> None:
    if not session.get(Project, project_id):
        raise HTTPException(status_code=404, detail="Project not found")

def _to_read(item: ApiKey) -> ApiKeyRead:
    return ApiKeyRead(
        id=item.id,
        project_id=item.project_id,
        name=item.name,
        key_prefix=item.key_prefix,
        scopes=json.loads(item.scopes_json or "[]"),
        expires_at=item.expires_at,
        revoked_at=item.revoked_at,
        created_by_user_id=item.created_by_user_id,
        created_at=item.created_at,
    )


@router.post("/{project_id}/api-keys", response_model=ApiKeyCreateResponse)
def create_project_api_key(
    project_id: int,
    payload: ApiKeyCreate,
    session: Session = Depends(get_session),
    user: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    _ensure_project_exists(session, project_id)
    raw_token = f"sk_{secrets.token_urlsafe(32)}"
    key_prefix = raw_token[:12]
    item = ApiKey(
        project_id=project_id,
        name=payload.name.strip(),
        key_prefix=key_prefix,
        key_hash=_hash_api_key(raw_token),
        scopes_json=json.dumps(payload.scopes, ensure_ascii=False),
        expires_at=payload.expires_at,
        created_by_user_id=user.id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    write_audit_log(
        session,
        action=AuditActionType.API_KEY_CREATE,
        user_id=user.id,
        entity_type="api_key",
        entity_id=item.id,
        metadata={"project_id": project_id, "name": item.name, "prefix": item.key_prefix},
    )

    return ApiKeyCreateResponse(**_to_read(item).model_dump(), plain_key=raw_token)


@router.get("/{project_id}/api-keys", response_model=List[ApiKeyRead])
def list_project_api_keys(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    _ensure_project_exists(session, project_id)
    rows = session.exec(
        select(ApiKey).where(ApiKey.project_id == project_id).order_by(ApiKey.created_at.desc())
    ).all()
    return [_to_read(row) for row in rows]


@router.post("/{project_id}/api-keys/{api_key_id}/revoke")
def revoke_project_api_key(
    project_id: int,
    api_key_id: int,
    session: Session = Depends(get_session),
    user: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    _ensure_project_exists(session, project_id)
    item = session.get(ApiKey, api_key_id)
    if not item or item.project_id != project_id:
        raise HTTPException(status_code=404, detail="API key not found")

    if item.revoked_at is None:
        item.revoked_at = datetime.utcnow()
        session.add(item)
        session.commit()

    write_audit_log(
        session,
        action=AuditActionType.API_KEY_REVOKE,
        user_id=user.id,
        entity_type="api_key",
        entity_id=item.id,
        metadata={"project_id": project_id, "name": item.name, "prefix": item.key_prefix},
    )
    return {"ok": True}
