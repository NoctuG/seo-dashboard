import json
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.api.deps import get_current_user, require_project_role
from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import AiContentDraft, AiDraftContentType, Project, ProjectMember, ProjectRoleType, Role, User

router = APIRouter()


class AiDraftCreatePayload(BaseModel):
    content_type: AiDraftContentType
    title: str = Field(min_length=1, max_length=255)
    canvas_document_json: dict
    export_text: str = ""


class AiDraftUpdatePayload(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    canvas_document_json: dict | None = None
    export_text: str | None = None
    expected_version: int = Field(ge=1)
    save_as_new_version: bool = False
    rollback_to_version: int | None = Field(default=None, ge=1)


class AiDraftRead(BaseModel):
    id: int
    project_id: int
    lineage_id: str
    content_type: AiDraftContentType
    title: str
    canvas_document_json: dict
    export_text: str
    version: int
    updated_by: int
    updated_at: datetime


class AiDraftListResponse(BaseModel):
    drafts: list[AiDraftRead]


class AiDraftConflictResponse(BaseModel):
    detail: str
    latest: AiDraftRead


def _as_read(draft: AiContentDraft) -> AiDraftRead:
    return AiDraftRead(
        id=draft.id,
        project_id=draft.project_id,
        lineage_id=draft.lineage_id,
        content_type=draft.content_type,
        title=draft.title,
        canvas_document_json=json.loads(draft.canvas_document_json),
        export_text=draft.export_text,
        version=draft.version,
        updated_by=draft.updated_by,
        updated_at=draft.updated_at,
    )


def _can_view_project(session: Session, user: User, project_id: int) -> bool:
    if user.is_superuser:
        return True

    membership = session.exec(
        select(ProjectMember)
        .join(Role, Role.id == ProjectMember.role_id)
        .where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
    ).first()
    return membership is not None


@router.post("/projects/{project_id}/ai-drafts", response_model=AiDraftRead)
def create_ai_draft(
    project_id: int,
    payload: AiDraftCreatePayload,
    session: Session = Depends(get_session),
    user: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    draft = AiContentDraft(
        project_id=project_id,
        lineage_id=str(uuid4()),
        content_type=payload.content_type,
        title=payload.title.strip(),
        canvas_document_json=json.dumps(payload.canvas_document_json, ensure_ascii=False),
        export_text=payload.export_text,
        version=1,
        updated_by=user.id,
        updated_at=datetime.utcnow(),
    )
    session.add(draft)
    session.commit()
    session.refresh(draft)
    return _as_read(draft)


@router.get("/projects/{project_id}/ai-drafts", response_model=AiDraftListResponse)
def list_ai_drafts(
    project_id: int,
    content_type: AiDraftContentType | None = Query(default=None),
    lineage_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    stmt = select(AiContentDraft).where(AiContentDraft.project_id == project_id)
    if content_type:
        stmt = stmt.where(AiContentDraft.content_type == content_type)
    if lineage_id:
        stmt = stmt.where(AiContentDraft.lineage_id == lineage_id)
    drafts = session.exec(stmt.order_by(AiContentDraft.updated_at.desc())).all()
    return {"drafts": [_as_read(draft) for draft in drafts]}


@router.put("/ai-drafts/{draft_id}", response_model=AiDraftRead, responses={409: {"model": AiDraftConflictResponse}})
def update_ai_draft(
    draft_id: int,
    payload: AiDraftUpdatePayload,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    current = session.get(AiContentDraft, draft_id)
    if not current:
        raise HTTPException(status_code=404, detail="AI_DRAFT_NOT_FOUND")

    if not _can_view_project(session, user, current.project_id):
        raise HTTPException(status_code=403, detail="No project access")

    if current.version != payload.expected_version:
        raise HTTPException(
            status_code=409,
            detail={"detail": "AI_DRAFT_VERSION_CONFLICT", "latest": _as_read(current).model_dump()},
        )

    base_canvas = payload.canvas_document_json
    base_text = payload.export_text
    base_title = payload.title.strip() if payload.title else current.title

    if payload.rollback_to_version is not None:
        rollback_source = session.exec(
            select(AiContentDraft)
            .where(
                AiContentDraft.project_id == current.project_id,
                AiContentDraft.lineage_id == current.lineage_id,
                AiContentDraft.version == payload.rollback_to_version,
            )
        ).first()
        if not rollback_source:
            raise HTTPException(status_code=404, detail="AI_DRAFT_VERSION_NOT_FOUND")
        base_canvas = json.loads(rollback_source.canvas_document_json)
        base_text = rollback_source.export_text
        base_title = rollback_source.title

    if payload.save_as_new_version or payload.rollback_to_version is not None:
        next_draft = AiContentDraft(
            project_id=current.project_id,
            lineage_id=current.lineage_id,
            content_type=current.content_type,
            title=base_title,
            canvas_document_json=json.dumps(base_canvas if base_canvas is not None else json.loads(current.canvas_document_json), ensure_ascii=False),
            export_text=base_text if base_text is not None else current.export_text,
            version=current.version + 1,
            updated_by=user.id,
            updated_at=datetime.utcnow(),
        )
        session.add(next_draft)
        session.commit()
        session.refresh(next_draft)
        return _as_read(next_draft)

    if payload.title is not None:
        current.title = payload.title.strip()
    if payload.canvas_document_json is not None:
        current.canvas_document_json = json.dumps(payload.canvas_document_json, ensure_ascii=False)
    if payload.export_text is not None:
        current.export_text = payload.export_text
    current.version += 1
    current.updated_by = user.id
    current.updated_at = datetime.utcnow()

    session.add(current)
    session.commit()
    session.refresh(current)
    return _as_read(current)
