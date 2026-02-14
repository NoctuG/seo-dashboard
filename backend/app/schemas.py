from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel
from app.models import CrawlStatus, IssueSeverity, IssueStatus

class ProjectCreate(BaseModel):
    name: str
    domain: str

class ProjectRead(BaseModel):
    id: int
    name: str
    domain: str
    created_at: datetime

    class Config:
        from_attributes = True

class CrawlCreate(BaseModel):
    project_id: int
    max_pages: Optional[int] = None
    sitemap_url: Optional[str] = None

class CrawlRead(BaseModel):
    id: int
    project_id: int
    status: CrawlStatus
    start_time: datetime
    end_time: Optional[datetime]
    total_pages: int
    issues_count: int

    class Config:
        from_attributes = True

class PageRead(BaseModel):
    id: int
    crawl_id: int
    url: str
    status_code: int
    title: Optional[str]
    description: Optional[str]
    h1: Optional[str]
    load_time_ms: Optional[int]
    size_bytes: Optional[int]

    class Config:
        from_attributes = True

class IssueRead(BaseModel):
    id: int
    crawl_id: int
    page_id: Optional[int]
    issue_type: str
    severity: IssueSeverity
    status: IssueStatus
    description: Optional[str]

    class Config:
        from_attributes = True

class LinkRead(BaseModel):
    id: int
    page_id: int
    target_url: str
    type: str
    anchor_text: Optional[str]

    class Config:
        from_attributes = True
