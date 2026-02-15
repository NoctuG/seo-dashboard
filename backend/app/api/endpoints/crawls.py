import asyncio
import json
import queue
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from typing import List, Optional

from app.crawler.events import crawl_event_broker
from app.db import get_session
from app.models import Crawl, Page, Issue, IssueSeverity
from app.schemas import CrawlRead, PageRead, IssueRead

router = APIRouter()


def _format_sse(event: dict) -> str:
    return f"data: {json.dumps(event, default=str)}\n\n"

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


@router.get("/{crawl_id}/events")
async def stream_crawl_events(crawl_id: int, request: Request, session: Session = Depends(get_session)):
    crawl = session.get(Crawl, crawl_id)
    if not crawl:
        raise HTTPException(status_code=404, detail="Crawl not found")

    async def event_generator():
        subscriber = crawl_event_broker.subscribe(crawl_id)

        initial_event = {
            "type": "snapshot",
            "crawl_id": crawl.id,
            "status": crawl.status,
            "pages_processed": crawl.total_pages or 0,
            "issues_found": crawl.issues_count or 0,
            "error_count": 0,
            "current_url": None,
            "ts": datetime.utcnow().isoformat(),
        }
        yield _format_sse(initial_event)

        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    event = await asyncio.to_thread(subscriber.get, True, 10)
                    event["ts"] = datetime.utcnow().isoformat()
                    yield _format_sse(event)
                except queue.Empty:
                    yield ": keep-alive\n\n"
        finally:
            crawl_event_broker.unsubscribe(crawl_id, subscriber)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
