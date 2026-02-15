import hashlib
import hmac
import json
from datetime import datetime
from typing import Callable

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from app.auth_service import decode_access_token
from app.db import get_session
from app.models import ApiKey, AuditActionType, AuditLog, ProjectMember, ProjectRoleType, Role, User

bearer_scheme = HTTPBearer(auto_error=True)
optional_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user_id = payload.get("uid")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive")
    return user




def _hash_api_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def get_api_key_auth(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
    bearer: HTTPAuthorizationCredentials | None = Depends(optional_bearer_scheme),
    session: Session = Depends(get_session),
) -> ApiKey:
    raw_key = x_api_key or (bearer.credentials if bearer else None)
    if not raw_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key required")

    key_hash = _hash_api_key(raw_key.strip())
    api_key = session.exec(select(ApiKey).where(ApiKey.key_hash == key_hash)).first()
    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    now = datetime.utcnow()
    if api_key.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key revoked")
    if api_key.expires_at is not None and api_key.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="API key expired")

    if not hmac.compare_digest(api_key.key_hash, key_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    return api_key

def require_project_role(required_role: ProjectRoleType) -> Callable:
    def _check_project_role(
        project_id: int,
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        if user.is_superuser:
            return user

        membership = session.exec(
            select(ProjectMember)
            .join(Role, Role.id == ProjectMember.role_id)
            .where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
        ).first()
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No project access")

        role = session.get(Role, membership.role_id)
        if required_role == ProjectRoleType.ADMIN and role.name != ProjectRoleType.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
        return user

    return _check_project_role


def require_superuser(user: User = Depends(get_current_user)) -> User:
    if not user.is_superuser:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Superuser required")
    return user


def write_audit_log(
    session: Session,
    action: AuditActionType,
    user_id: int | None,
    entity_type: str,
    entity_id: int | None,
    metadata: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            user_id=user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=json.dumps(metadata or {}, ensure_ascii=False),
        )
    )
    session.commit()
