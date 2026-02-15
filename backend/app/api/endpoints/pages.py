from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select
from typing import List

from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import Page, Link, Issue
from app.schemas import PageRead, LinkRead, IssueRead, PaginatedResponse

router = APIRouter()

@router.get("/{page_id}", response_model=PageRead)
def read_page(page_id: int, session: Session = Depends(get_session)):
    page = session.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail=ErrorCode.PAGE_NOT_FOUND)
    return page

@router.get("/{page_id}/links", response_model=PaginatedResponse[LinkRead])
def read_page_links(page_id: int, page: int = 1, page_size: int = 20, session: Session = Depends(get_session)):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    query = select(Link).where(Link.page_id == page_id)
    total = session.exec(select(func.count()).select_from(query.subquery())).one()
    links = session.exec(query.offset(offset).limit(page_size)).all()
    return {"items": links, "total": total, "page": page, "page_size": page_size}

@router.get("/{page_id}/issues", response_model=PaginatedResponse[IssueRead])
def read_page_issues(page_id: int, page: int = 1, page_size: int = 20, session: Session = Depends(get_session)):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    query = select(Issue).where(Issue.page_id == page_id)
    total = session.exec(select(func.count()).select_from(query.subquery())).one()
    issues = session.exec(query.offset(offset).limit(page_size)).all()
    return {"items": issues, "total": total, "page": page, "page_size": page_size}
