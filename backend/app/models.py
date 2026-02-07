from datetime import datetime
from typing import Optional, List
from sqlmodel import Field, SQLModel, Relationship
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

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    domain: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    crawls: List["Crawl"] = Relationship(back_populates="project")
    keywords: List["Keyword"] = Relationship(back_populates="project")

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
    severity: IssueSeverity
    status: IssueStatus = Field(default=IssueStatus.OPEN)
    description: Optional[str] = None

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
