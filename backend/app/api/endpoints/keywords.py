import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import CompetitorDomain, Keyword, RankHistory, Project, ProjectRoleType, User
from app.schemas import (
    CompetitorDomainCreate,
    CompetitorDomainRead,
    KeywordCreate,
    KeywordRead,
    RankHistoryRead,
    VisibilityHistoryRead,
)
from app.serp_service import check_keyword_rank
from app.visibility_service import visibility_service
from app.api.deps import require_project_role

router = APIRouter()



def _resolve_geo_language(project: Project, keyword: Keyword) -> tuple[str, str]:
    gl = (keyword.market or project.default_gl or "us").strip().lower()
    hl = (keyword.locale or project.default_hl or "en").strip().lower()
    return gl, hl


@router.get("/{project_id}/competitors", response_model=List[CompetitorDomainRead])
def list_competitors(project_id: int, session: Session = Depends(get_session), _: User = Depends(require_project_role(ProjectRoleType.VIEWER))):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    return session.exec(
        select(CompetitorDomain)
        .where(CompetitorDomain.project_id == project_id)
        .order_by(CompetitorDomain.created_at.desc())
    ).all()


@router.post("/{project_id}/competitors", response_model=CompetitorDomainRead)
def create_competitor(
    project_id: int,
    payload: CompetitorDomainCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    normalized_domain = payload.domain.strip().lower()
    exists = session.exec(
        select(CompetitorDomain).where(
            CompetitorDomain.project_id == project_id,
            CompetitorDomain.domain == normalized_domain,
        )
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=ErrorCode.COMPETITOR_DOMAIN_ALREADY_EXISTS)

    competitor = CompetitorDomain(project_id=project_id, domain=normalized_domain)
    session.add(competitor)
    session.commit()
    session.refresh(competitor)
    return competitor


@router.delete("/{project_id}/competitors/{competitor_id}")
def delete_competitor(project_id: int, competitor_id: int, session: Session = Depends(get_session), _: User = Depends(require_project_role(ProjectRoleType.ADMIN))):
    competitor = session.get(CompetitorDomain, competitor_id)
    if not competitor or competitor.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.COMPETITOR_NOT_FOUND)

    session.delete(competitor)
    session.commit()
    return {"ok": True}


@router.get("/{project_id}/keywords", response_model=List[KeywordRead])
def list_keywords(project_id: int, session: Session = Depends(get_session), _: User = Depends(require_project_role(ProjectRoleType.VIEWER))):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keywords = session.exec(
        select(Keyword).where(Keyword.project_id == project_id)
    ).all()
    return keywords


@router.post("/{project_id}/keywords", response_model=KeywordRead)
def create_keyword(
    project_id: int,
    payload: KeywordCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keyword = Keyword(
        project_id=project_id,
        term=payload.term,
        target_url=payload.target_url,
        locale=payload.locale,
        market=payload.market,
    )
    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return keyword


@router.delete("/{project_id}/keywords/{keyword_id}")
def delete_keyword(
    project_id: int,
    keyword_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.KEYWORD_NOT_FOUND)

    session.delete(keyword)
    session.commit()
    return {"ok": True}


@router.post("/{project_id}/keywords/{keyword_id}/check", response_model=KeywordRead)
def check_rank(
    project_id: int,
    keyword_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.KEYWORD_NOT_FOUND)

    project = session.get(Project, project_id)
    competitors = session.exec(select(CompetitorDomain).where(CompetitorDomain.project_id == project_id)).all()
    gl, hl = _resolve_geo_language(project, keyword)
    result = check_keyword_rank(keyword.term, project.domain, [c.domain for c in competitors], gl=gl, hl=hl)

    keyword.current_rank = result.rank
    keyword.last_checked = datetime.utcnow()

    history = RankHistory(
        keyword_id=keyword.id,
        rank=result.rank,
        url=result.url,
        gl=gl,
        hl=hl,
    )
    session.add(history)
    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return keyword


@router.post("/{project_id}/keywords/check-all", response_model=List[KeywordRead])
def check_all_ranks(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keywords = session.exec(
        select(Keyword).where(Keyword.project_id == project_id)
    ).all()

    for keyword in keywords:
        gl, hl = _resolve_geo_language(project, keyword)
        result = check_keyword_rank(keyword.term, project.domain, gl=gl, hl=hl)
        keyword.current_rank = result.rank
        keyword.last_checked = datetime.utcnow()

        history = RankHistory(
            keyword_id=keyword.id,
            rank=result.rank,
            url=result.url,
            gl=gl,
            hl=hl,
        )
        session.add(history)
        session.add(keyword)

    session.commit()
    for keyword in keywords:
        session.refresh(keyword)
    return keywords


@router.post("/{project_id}/keywords/check-all-compare", response_model=List[VisibilityHistoryRead])
def check_all_compare(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keywords = session.exec(select(Keyword).where(Keyword.project_id == project_id)).all()
    competitors = session.exec(select(CompetitorDomain).where(CompetitorDomain.project_id == project_id)).all()
    competitor_domains = [c.domain for c in competitors]

    rows = []
    now = datetime.utcnow()
    for keyword in keywords:
        gl, hl = _resolve_geo_language(project, keyword)
        result = check_keyword_rank(keyword.term, project.domain, competitor_domains, gl=gl, hl=hl)

        keyword.current_rank = result.rank
        keyword.last_checked = now
        session.add(keyword)
        session.add(RankHistory(keyword_id=keyword.id, rank=result.rank, url=result.url, gl=gl, hl=hl, checked_at=now))

        base_row = visibility_service.create_visibility_row(
            project_id=project_id,
            keyword_id=keyword.id,
            keyword_term=keyword.term,
            source_domain=project.domain,
            rank=result.rank,
            result_type=result.result_type,
            serp_features=result.serp_features,
            competitor_positions=result.competitor_positions,
            checked_at=now,
        )
        rows.append(base_row)
        session.add(base_row)

        for domain, rank in result.competitor_positions.items():
            comp_positions = dict(result.competitor_positions)
            comp_positions[project.domain] = result.rank
            competitor_row = visibility_service.create_visibility_row(
                project_id=project_id,
                keyword_id=keyword.id,
                keyword_term=keyword.term,
                source_domain=domain,
                rank=rank,
                result_type=result.result_type,
                serp_features=result.serp_features,
                competitor_positions=comp_positions,
                checked_at=now,
            )
            rows.append(competitor_row)
            session.add(competitor_row)

    session.commit()

    return [
        VisibilityHistoryRead(
            keyword_id=r.keyword_id,
            keyword_term=r.keyword_term,
            source_domain=r.source_domain,
            rank=r.rank,
            visibility_score=r.visibility_score,
            result_type=r.result_type,
            serp_features=json.loads(r.serp_features_json),
            competitor_positions=json.loads(r.competitor_positions_json),
            checked_at=r.checked_at,
        )
        for r in rows
    ]


@router.get(
    "/{project_id}/keywords/{keyword_id}/history",
    response_model=List[RankHistoryRead],
)
def get_rank_history(
    project_id: int,
    keyword_id: int,
    limit: int = 30,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.KEYWORD_NOT_FOUND)

    history = session.exec(
        select(RankHistory)
        .where(RankHistory.keyword_id == keyword_id)
        .order_by(RankHistory.checked_at.asc())
        .limit(limit)
    ).all()
    return history
