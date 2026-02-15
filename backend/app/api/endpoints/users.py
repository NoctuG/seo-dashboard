from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr
from sqlmodel import Session, select

from app.core.error_codes import ErrorCode
from app.api.deps import require_superuser
from app.auth_service import hash_password
from app.db import get_session
from app.models import User

router = APIRouter()


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = ""
    password: str
    is_active: bool = True
    is_superuser: bool = False


class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_superuser: Optional[bool] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    full_name: str
    is_active: bool
    is_superuser: bool


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    _: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    email = payload.email.lower()
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.EMAIL_ALREADY_EXISTS)

    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
        is_superuser=payload.is_superuser,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserResponse.model_validate(user)


@router.get("", response_model=list[UserResponse])
def list_users(
    _: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    return [UserResponse.model_validate(user) for user in users]


@router.patch("/{id}", response_model=UserResponse)
def update_user(
    id: int,
    payload: UserUpdateRequest,
    current_user: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    user = session.get(User, id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ErrorCode.USER_NOT_FOUND)

    if payload.email is not None:
        normalized = payload.email.lower()
        existing = session.exec(select(User).where(User.email == normalized, User.id != user.id)).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.EMAIL_ALREADY_EXISTS)
        user.email = normalized

    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.password is not None:
        user.password_hash = hash_password(payload.password)
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.is_superuser is not None:
        if current_user.id == user.id and not payload.is_superuser:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorCode.CANNOT_REMOVE_YOUR_OWN_SUPERUSER_PERMISSION,
            )
        user.is_superuser = payload.is_superuser

    session.add(user)
    session.commit()
    session.refresh(user)
    return UserResponse.model_validate(user)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    id: int,
    current_user: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    user = session.get(User, id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=ErrorCode.USER_NOT_FOUND)
    if current_user.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=ErrorCode.CANNOT_DELETE_YOUR_OWN_ACCOUNT)

    session.delete(user)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
