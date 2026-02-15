from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List

from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import Page, Link, Issue
from app.schemas import PageRead, LinkRead, IssueRead

router = APIRouter()

@router.get("/{page_id}", response_model=PageRead)
def read_page(page_id: int, session: Session = Depends(get_session)):
    page = session.get(Page, page_id)
    if not page:
        raise HTTPException(status_code=404, detail=ErrorCode.PAGE_NOT_FOUND)
    return page

@router.get("/{page_id}/links", response_model=List[LinkRead])
def read_page_links(page_id: int, session: Session = Depends(get_session)):
    links = session.exec(select(Link).where(Link.page_id == page_id)).all()
    return links

@router.get("/{page_id}/issues", response_model=List[IssueRead])
def read_page_issues(page_id: int, session: Session = Depends(get_session)):
    issues = session.exec(select(Issue).where(Issue.page_id == page_id)).all()
    return issues
