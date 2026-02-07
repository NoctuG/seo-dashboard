from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List, Optional

from app.db import get_session
from app.models import Crawl, Page, Issue, IssueSeverity
from app.schemas import CrawlRead, PageRead, IssueRead

router = APIRouter()

@router.get("/{crawl_id}", response_model=CrawlRead)
def read_crawl(crawl_id: int, session: Session = Depends(get_session)):
    crawl = session.get(Crawl, crawl_id)
    if not crawl:
        raise HTTPException(status_code=404, detail="Crawl not found")
    return crawl

@router.get("/{crawl_id}/pages", response_model=List[PageRead])
def read_crawl_pages(
    crawl_id: int,
    skip: int = 0,
    limit: int = 100,
    status_code: Optional[int] = None,
    session: Session = Depends(get_session)
):
    query = select(Page).where(Page.crawl_id == crawl_id)
    if status_code:
        query = query.where(Page.status_code == status_code)

    pages = session.exec(query.offset(skip).limit(limit)).all()
    return pages

@router.get("/{crawl_id}/issues", response_model=List[IssueRead])
def read_crawl_issues(
    crawl_id: int,
    skip: int = 0,
    limit: int = 100,
    severity: Optional[IssueSeverity] = None,
    session: Session = Depends(get_session)
):
    query = select(Issue).where(Issue.crawl_id == crawl_id)
    if severity:
        query = query.where(Issue.severity == severity)

    issues = session.exec(query.offset(skip).limit(limit)).all()
    return issues
