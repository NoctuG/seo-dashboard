from datetime import datetime, date
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
from sqlalchemy import Index
from enum import Enum

class CrawlStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

class IssueSeverity(str, Enum):
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"

class IssueStatus(str, Enum):
    OPEN = "open"
    IGNORED = "ignored"
    RESOLVED = "resolved"

class IssueCategory(str, Enum):
    TECHNICAL_SEO = "technical_seo"
    ACCESSIBILITY = "accessibility"
    CONTENT = "content"

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    domain: str
    brand_keywords_json: str = "[]"
    brand_regex: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    crawls: List["Crawl"] = Relationship(back_populates="project")
    keywords: List["Keyword"] = Relationship(back_populates="project")
    competitor_domains: List["CompetitorDomain"] = Relationship(back_populates="project")
    seo_cost_config: Optional["SeoCostConfig"] = Relationship(
        back_populates="project",
        sa_relationship_kwargs={"uselist": False},
    )


class SeoCostConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True, unique=True)
    monthly_human_cost: float = 0
    monthly_tool_cost: float = 0
    monthly_outsourcing_cost: float = 0
    monthly_content_cost: float = 0
    currency: str = "USD"
    attribution_model: str = "linear"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    project: Project = Relationship(back_populates="seo_cost_config")

class Crawl(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    status: CrawlStatus = Field(default=CrawlStatus.PENDING)
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    total_pages: int = 0
    issues_count: int = 0

    project: Project = Relationship(back_populates="crawls")
    pages: List["Page"] = Relationship(back_populates="crawl")
    issues: List["Issue"] = Relationship(back_populates="crawl")

class Page(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    crawl_id: int = Field(foreign_key="crawl.id")
    url: str = Field(index=True)
    status_code: int
    title: Optional[str] = None
    description: Optional[str] = None
    h1: Optional[str] = None
    load_time_ms: Optional[int] = None
    size_bytes: Optional[int] = None
    content_hash: Optional[str] = None  # To detect duplicates

    crawl: Crawl = Relationship(back_populates="pages")
    links: List["Link"] = Relationship(back_populates="page")
    issues: List["Issue"] = Relationship(back_populates="page")

class Link(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    page_id: int = Field(foreign_key="page.id")
    target_url: str
    type: str # internal, external
    anchor_text: Optional[str] = None

    page: Page = Relationship(back_populates="links")

class Issue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    crawl_id: int = Field(foreign_key="crawl.id")
    page_id: Optional[int] = Field(default=None, foreign_key="page.id")
    issue_type: str
    category: IssueCategory = Field(default=IssueCategory.TECHNICAL_SEO)
    severity: IssueSeverity
    status: IssueStatus = Field(default=IssueStatus.OPEN)
    description: Optional[str] = None
    fix_template: Optional[str] = None

    crawl: Crawl = Relationship(back_populates="issues")
    page: Optional[Page] = Relationship(back_populates="issues")

class Keyword(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    term: str
    target_url: Optional[str] = None
    current_rank: Optional[int] = None
    last_checked: Optional[datetime] = None

    project: Project = Relationship(back_populates="keywords")
    rank_history: List["RankHistory"] = Relationship(back_populates="keyword")


class RankHistory(SQLModel, table=True):
    __table_args__ = (
        Index("ix_rankhistory_keyword_checked_at", "keyword_id", "checked_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    keyword_id: int = Field(foreign_key="keyword.id")
    rank: Optional[int] = None
    url: Optional[str] = None
    checked_at: datetime = Field(default_factory=datetime.utcnow)

    keyword: Keyword = Relationship(back_populates="rank_history")


class CompetitorDomain(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    domain: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    project: Project = Relationship(back_populates="competitor_domains")


class VisibilityHistory(SQLModel, table=True):
    __table_args__ = (
        Index("ix_visibilityhistory_project_checked_at", "project_id", "checked_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    keyword_id: Optional[int] = Field(default=None, foreign_key="keyword.id", index=True)
    keyword_term: str
    source_domain: str = Field(index=True)
    rank: Optional[int] = None
    visibility_score: float = 0
    result_type: str = "organic"
    serp_features_json: str = "[]"
    competitor_positions_json: str = "{}"
    checked_at: datetime = Field(default_factory=datetime.utcnow)


class PagePerformanceSnapshot(SQLModel, table=True):
    __table_args__ = (
        Index("ix_pageperf_page_checked_at", "page_id", "checked_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    page_id: int = Field(foreign_key="page.id", index=True)
    checked_at: datetime = Field(default_factory=datetime.utcnow)
    lcp_ms: Optional[int] = None
    fcp_ms: Optional[int] = None
    cls: Optional[float] = None
    source: str = "unavailable"


class PageTrafficSnapshot(SQLModel, table=True):
    __table_args__ = (
        Index("ix_pagetraffic_project_url_date", "project_id", "url", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    url: str = Field(index=True)
    date: date
    sessions: int = 0
    conversions: int = 0


class DomainMetricSnapshot(SQLModel, table=True):
    __table_args__ = (
        Index("ix_domainmetric_project_date", "project_id", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    date: date
    domain_authority: float = 0


class BacklinkSnapshot(SQLModel, table=True):
    __table_args__ = (
        Index("ix_backlinksnapshot_project_date", "project_id", "date"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id", index=True)
    date: date
    backlinks_total: int = 0
    ref_domains: int = 0
    anchor_distribution_json: str = "{}"
    new_links_json: str = "[]"
    lost_links_json: str = "[]"
    notes_json: str = "[]"
    provider: str = "sample"
