import hashlib
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.api.deps import get_current_user, write_audit_log
from app.auth_service import create_access_token, create_refresh_token, decode_refresh_token, ensure_default_roles, hash_password, verify_password
from app.config import settings
from app.db import get_session
from app.email_service import email_service
from app.models import AuditActionType, Organization, OrganizationMember, PasswordResetToken, User
from app.rate_limit import limiter

router = APIRouter()


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    refresh_token: str


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


class MessageResponse(BaseModel):
    message: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.RATE_LIMIT_LOGIN)
def login(request: Request, payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email.lower())).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token = create_access_token(user.email, user.id, user.full_name, user.is_superuser)
    refresh_token = create_refresh_token(user.email, user.id, user.full_name, user.is_superuser)
    write_audit_log(
        session,
        action=AuditActionType.LOGIN,
        user_id=user.id,
        entity_type="user",
        entity_id=user.id,
        metadata={"email": user.email},
    )
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)

@router.post("/refresh", response_model=TokenResponse)
def refresh_token(payload: RefreshTokenRequest, session: Session = Depends(get_session)):
    try:
        token_payload = decode_refresh_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user_id = token_payload.get("uid")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive")

    access_token = create_access_token(user.email, user.id, user.full_name, user.is_superuser)
    refresh_token_value = create_refresh_token(user.email, user.id, user.full_name, user.is_superuser)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token_value)



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


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not verify_password(payload.old_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Old password is incorrect")
    user.password_hash = hash_password(payload.new_password)
    session.add(user)
    session.commit()
    return MessageResponse(message="Password changed successfully")


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(payload: ForgotPasswordRequest, session: Session = Depends(get_session)):
    normalized_email = payload.email.lower().strip()
    user = session.exec(select(User).where(User.email == normalized_email)).first()
    if user and user.is_active:
        raw_token = secrets.token_urlsafe(48)
        expires_at = datetime.utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)
        session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=_hash_reset_token(raw_token),
                expires_at=expires_at,
            )
        )
        session.commit()

        reset_url = f"{settings.PASSWORD_RESET_URL}?token={raw_token}"
        email_service.send_email(
            to_email=user.email,
            subject="Reset your SEO Dashboard password",
            text_body=f"Click the link to reset your password: {reset_url}\nThis link expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.",
            html_body=(
                f"<p>Click <a href=\"{reset_url}\">here</a> to reset your password.</p>"
                f"<p>This link expires in {settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes.</p>"
            ),
        )
    return MessageResponse(message="If the email exists, a reset link has been sent")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(payload: ResetPasswordRequest, session: Session = Depends(get_session)):
    now = datetime.utcnow()
    token_hash = _hash_reset_token(payload.token)
    reset_token = session.exec(
        select(PasswordResetToken).where(
            PasswordResetToken.token_hash == token_hash,
            PasswordResetToken.used_at.is_(None),
            PasswordResetToken.expires_at > now,
        )
    ).first()
    if not reset_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    user = session.get(User, reset_token.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")

    user.password_hash = hash_password(payload.new_password)
    reset_token.used_at = now
    session.add(user)
    session.add(reset_token)
    session.commit()
    return MessageResponse(message="Password reset successfully")
