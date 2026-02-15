from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from app.models import CrawlStatus, IssueCategory, IssueSeverity, IssueStatus

class ProjectCreate(BaseModel):
    name: str
    domain: str
    brand_keywords: List[str] = Field(default_factory=list)
    brand_regex: Optional[str] = None
    default_gl: str = "us"
    default_hl: str = "en"


class ProjectSettingsUpdate(BaseModel):
    default_gl: Optional[str] = None
    default_hl: Optional[str] = None

class ProjectRead(BaseModel):
    id: int
    name: str
    domain: str
    brand_keywords: List[str] = Field(default_factory=list)
    brand_regex: Optional[str] = None
    default_gl: str
    default_hl: str
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
    category: IssueCategory
    severity: IssueSeverity
    status: IssueStatus
    description: Optional[str]
    fix_template: Optional[str]

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
    locale: Optional[str] = None
    market: Optional[str] = None


class KeywordRead(BaseModel):
    id: int
    project_id: int
    term: str
    target_url: Optional[str]
    locale: Optional[str]
    market: Optional[str]
    current_rank: Optional[int]
    last_checked: Optional[datetime]

    class Config:
        from_attributes = True


class RankHistoryRead(BaseModel):
    id: int
    keyword_id: int
    rank: Optional[int]
    url: Optional[str]
    gl: Optional[str]
    hl: Optional[str]
    checked_at: datetime

    class Config:
        from_attributes = True


class CompetitorDomainCreate(BaseModel):
    domain: str


class CompetitorDomainRead(BaseModel):
    id: int
    project_id: int
    domain: str
    created_at: datetime

    class Config:
        from_attributes = True


class VisibilityHistoryRead(BaseModel):
    keyword_id: Optional[int]
    keyword_term: str
    source_domain: str
    rank: Optional[int]
    visibility_score: float
    result_type: str
    serp_features: List[str]
    competitor_positions: dict
    checked_at: datetime


class VisibilityGroupRead(BaseModel):
    group: str
    visibility_score: float


class VisibilityTrendPointRead(BaseModel):
    date: str
    visibility_score: float


class VisibilityResponse(BaseModel):
    project_id: int
    overall_visibility: float
    groups: List[VisibilityGroupRead]
    trend: List[VisibilityTrendPointRead]
    serp_feature_coverage: dict[str, float]


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


class RoiCostBreakdown(BaseModel):
    monthly_human_cost: float
    monthly_tool_cost: float
    monthly_outsourcing_cost: float
    monthly_content_cost: float
    monthly_total_cost: float
    currency: str


class RoiFormulaBreakdownResponse(BaseModel):
    project_id: int
    provider: str
    time_range: str
    attribution_model: str
    assisted_conversions: float
    conversions: float
    revenue: float
    pipeline_value: float
    gain: float
    cost: RoiCostBreakdown
    roi: float
    roi_pct: float
    formula: dict[str, str]


class ReportTemplateBase(BaseModel):
    name: str
    indicators: List[str] = Field(default_factory=list)
    brand_styles: dict = Field(default_factory=dict)
    time_range: str = "30d"
    locale: str = "en-US"


class ReportTemplateCreate(ReportTemplateBase):
    pass


class ReportTemplateRead(ReportTemplateBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReportScheduleBase(BaseModel):
    template_id: int
    cron_expression: str
    timezone: str = "UTC"
    recipient_email: str
    active: bool = True
    retry_limit: int = 2


class ReportScheduleCreate(ReportScheduleBase):
    pass


class ReportScheduleRead(ReportScheduleBase):
    id: int
    project_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ReportExportRequest(BaseModel):
    template_id: int
    format: str = "csv"
    locale: Optional[str] = None


class ReportDeliveryLogRead(BaseModel):
    id: int
    project_id: int
    template_id: Optional[int]
    schedule_id: Optional[int]
    format: str
    status: str
    retries: int
    recipient_email: Optional[str]
    error_message: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class WebhookConfigBase(BaseModel):
    url: str
    secret: str
    subscribed_events: List[str] = Field(default_factory=list)
    enabled: bool = True


class WebhookConfigCreate(WebhookConfigBase):
    pass


class WebhookConfigUpdate(BaseModel):
    url: Optional[str] = None
    secret: Optional[str] = None
    subscribed_events: Optional[List[str]] = None
    enabled: Optional[bool] = None


class WebhookConfigRead(BaseModel):
    id: int
    url: str
    secret: str
    subscribed_events: List[str]
    enabled: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
