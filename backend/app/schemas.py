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


class KeywordCreate(BaseModel):
    term: str
    target_url: Optional[str] = None


class KeywordRead(BaseModel):
    id: int
    project_id: int
    term: str
    target_url: Optional[str]
    current_rank: Optional[int]
    last_checked: Optional[datetime]

    class Config:
        from_attributes = True


class RankHistoryRead(BaseModel):
    id: int
    keyword_id: int
    rank: Optional[int]
    url: Optional[str]
    checked_at: datetime

    class Config:
        from_attributes = True


class ContentPerformanceItemRead(BaseModel):
    url: str
    keyword_count: int
    avg_rank: Optional[float]
    estimated_click_contribution: float
    sessions: int
    conversions: int
    conversion_rate: float
    change_7d: float
    change_30d: float
    decay_flag: bool
    suggested_action: Optional[str] = None


class ContentPerformanceResponse(BaseModel):
    window: str
    sort: str
    items: List[ContentPerformanceItemRead]
    top_content: List[ContentPerformanceItemRead]
    top_conversion: List[ContentPerformanceItemRead]
    decaying_content: List[ContentPerformanceItemRead]


class AuthorityPoint(BaseModel):
    date: datetime | str
    domain_authority: float


class AuthorityResponse(BaseModel):
    project_id: int
    provider: str
    domain_authority: float
    history: List[AuthorityPoint]
    notes: List[str]


class BacklinkSummaryResponse(BaseModel):
    project_id: int
    provider: str
    backlinks_total: int
    ref_domains: int
    anchor_distribution: dict[str, int]
    history: List[dict]
    notes: List[str]


class BacklinkChangeItem(BaseModel):
    url: str
    source: Optional[str] = None
    anchor: Optional[str] = None
    date: Optional[str] = None


class BacklinkChangesResponse(BaseModel):
    project_id: int
    provider: str
    new_links: List[BacklinkChangeItem]
    lost_links: List[BacklinkChangeItem]
    notes: List[str]
