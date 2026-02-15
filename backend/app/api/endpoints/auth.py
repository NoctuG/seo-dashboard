from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import get_current_user, write_audit_log
from app.auth_service import create_access_token, ensure_default_roles, hash_password, verify_password
from app.db import get_session
from app.models import AuditActionType, Organization, OrganizationMember, User

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class BootstrapAdminRequest(BaseModel):
    email: str
    password: str
    full_name: str = "Administrator"
    organization_name: str = "Default Organization"


class UserMeResponse(BaseModel):
    id: int
    email: str
    full_name: str
    is_superuser: bool


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token = create_access_token(user.email, user.id, user.full_name, user.is_superuser)
    write_audit_log(
        session,
        action=AuditActionType.LOGIN,
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        metadata={"email": user.email},
    )
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserMeResponse)
def me(user: User = Depends(get_current_user)):
    return UserMeResponse(id=user.id, email=user.email, full_name=user.full_name, is_superuser=user.is_superuser)


@router.post("/bootstrap-admin", response_model=UserMeResponse)
def bootstrap_admin(payload: BootstrapAdminRequest, session: Session = Depends(get_session)):
    if session.exec(select(User)).first():
        raise HTTPException(status_code=400, detail="Admin already initialized")

    ensure_default_roles(session)
    org = Organization(name=payload.organization_name)
    user = User(
        email=payload.email.lower(),
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_superuser=True,
    )
    session.add(org)
    session.add(user)
    session.commit()
    session.refresh(org)
    session.refresh(user)
    session.add(OrganizationMember(organization_id=org.id, user_id=user.id))
    session.commit()

    write_audit_log(
        session,
        action=AuditActionType.ADMIN_BOOTSTRAP,
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        metadata={"email": user.email},
    )
    return UserMeResponse(id=user.id, email=user.email, full_name=user.full_name, is_superuser=user.is_superuser)
