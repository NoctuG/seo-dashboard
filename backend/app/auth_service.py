import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlmodel import Session, select

from app.config import settings
from app.models import AuditActionType, AuditLog, Organization, OrganizationMember, ProjectRoleType, Role, User


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(data + padding)


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return f"{_b64url_encode(salt)}.{_b64url_encode(digest)}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_part, digest_part = password_hash.split(".", 1)
        salt = _b64url_decode(salt_part)
        expected_digest = _b64url_decode(digest_part)
    except ValueError:
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
    return hmac.compare_digest(digest, expected_digest)


def _create_token(
    subject: str,
    user_id: int,
    full_name: str,
    is_superuser: bool,
    expires_minutes: int,
    token_type: str,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes)
    payload = {
        "sub": subject,
        "uid": user_id,
        "name": full_name,
        "superuser": is_superuser,
        "type": token_type,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    header = {"alg": "HS256", "typ": "JWT"}
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode())
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode())
    signing_input = f"{header_b64}.{payload_b64}".encode()
    signature = hmac.new(settings.JWT_SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def create_access_token(subject: str, user_id: int, full_name: str, is_superuser: bool) -> str:
    return _create_token(subject, user_id, full_name, is_superuser, settings.JWT_EXPIRE_MINUTES, "access")


def create_refresh_token(subject: str, user_id: int, full_name: str, is_superuser: bool) -> str:
    return _create_token(subject, user_id, full_name, is_superuser, settings.JWT_REFRESH_EXPIRE_MINUTES, "refresh")


def decode_token(token: str) -> dict[str, Any]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("invalid token")
    header_b64, payload_b64, sig_b64 = parts
    signing_input = f"{header_b64}.{payload_b64}".encode()
    expected_sig = hmac.new(settings.JWT_SECRET_KEY.encode(), signing_input, hashlib.sha256).digest()
    if not hmac.compare_digest(expected_sig, _b64url_decode(sig_b64)):
        raise ValueError("invalid signature")

    payload = json.loads(_b64url_decode(payload_b64).decode())
    if int(payload.get("exp", 0)) < int(datetime.now(timezone.utc).timestamp()):
        raise ValueError("token expired")
    return payload


def decode_access_token(token: str) -> dict[str, Any]:
    payload = decode_token(token)
    if payload.get("type") not in (None, "access"):
        raise ValueError("invalid token type")
    return payload


def decode_refresh_token(token: str) -> dict[str, Any]:
    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise ValueError("invalid token type")
    return payload


def ensure_default_roles(session: Session) -> None:
    for role_name, description in (
        (ProjectRoleType.ADMIN, "Can manage project and settings"),
        (ProjectRoleType.VIEWER, "Can view project data"),
    ):
        existing = session.exec(select(Role).where(Role.name == role_name)).first()
        if not existing:
            session.add(Role(name=role_name, description=description))
    session.commit()


def create_initial_admin(session: Session) -> User | None:
    ensure_default_roles(session)

    existing_user = session.exec(select(User)).first()
    if existing_user:
        return None

    if not settings.INITIAL_ADMIN_EMAIL or not settings.INITIAL_ADMIN_PASSWORD:
        return None

    organization = Organization(name="Default Organization")
    user = User(
        email=settings.INITIAL_ADMIN_EMAIL.lower(),
        full_name=settings.INITIAL_ADMIN_NAME,
        password_hash=hash_password(settings.INITIAL_ADMIN_PASSWORD),
        is_superuser=True,
    )
    session.add(organization)
    session.add(user)
    session.commit()
    session.refresh(organization)
    session.refresh(user)

    session.add(OrganizationMember(organization_id=organization.id, user_id=user.id))
    session.add(
        AuditLog(
            user_id=user.id,
            action=AuditActionType.ADMIN_BOOTSTRAP,
            entity_type="user",
            entity_id=user.id,
            metadata_json=json.dumps({"email": user.email}, ensure_ascii=False),
        )
    )
    session.commit()
    return user
