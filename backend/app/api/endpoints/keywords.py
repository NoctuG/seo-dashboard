from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.db import get_session
from app.models import Keyword, RankHistory, Project
from app.schemas import KeywordCreate, KeywordRead, RankHistoryRead
from app.serp_service import check_keyword_rank

router = APIRouter()


@router.get("/{project_id}/keywords", response_model=List[KeywordRead])
def list_keywords(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    keywords = session.exec(
        select(Keyword).where(Keyword.project_id == project_id)
    ).all()
    return keywords


@router.post("/{project_id}/keywords", response_model=KeywordRead)
def create_keyword(
    project_id: int,
    payload: KeywordCreate,
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    keyword = Keyword(
        project_id=project_id,
        term=payload.term,
        target_url=payload.target_url,
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
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail="Keyword not found")

    session.delete(keyword)
    session.commit()
    return {"ok": True}


@router.post("/{project_id}/keywords/{keyword_id}/check", response_model=KeywordRead)
def check_rank(
    project_id: int,
    keyword_id: int,
    session: Session = Depends(get_session),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail="Keyword not found")

    project = session.get(Project, project_id)
    result = check_keyword_rank(keyword.term, project.domain)

    keyword.current_rank = result.rank
    keyword.last_checked = datetime.utcnow()

    history = RankHistory(
        keyword_id=keyword.id,
        rank=result.rank,
        url=result.url,
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
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    keywords = session.exec(
        select(Keyword).where(Keyword.project_id == project_id)
    ).all()

    for keyword in keywords:
        result = check_keyword_rank(keyword.term, project.domain)
        keyword.current_rank = result.rank
        keyword.last_checked = datetime.utcnow()

        history = RankHistory(
            keyword_id=keyword.id,
            rank=result.rank,
            url=result.url,
        )
        session.add(history)
        session.add(keyword)

    session.commit()
    for keyword in keywords:
        session.refresh(keyword)
    return keywords


@router.get(
    "/{project_id}/keywords/{keyword_id}/history",
    response_model=List[RankHistoryRead],
)
def get_rank_history(
    project_id: int,
    keyword_id: int,
    limit: int = 30,
    session: Session = Depends(get_session),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail="Keyword not found")

    history = session.exec(
        select(RankHistory)
        .where(RankHistory.keyword_id == keyword_id)
        .order_by(RankHistory.checked_at.asc())
        .limit(limit)
    ).all()
    return history
