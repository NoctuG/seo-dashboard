from datetime import datetime
from typing import Generic, List, Literal, Optional, TypeAlias, TypeVar
from pydantic import BaseModel, Field
from app.models import CrawlStatus, IssueCategory, IssueSeverity, IssueStatus, KeywordScheduleFrequency

class ProjectCreate(BaseModel):
    name: str
    domain: str
    brand_keywords: List[str] = Field(default_factory=list)
    brand_regex: Optional[str] = None
    default_gl: str = "us"
    default_hl: str = "en"


SERP_FEATURE_SOURCE_KEYS = {
    "featured_snippet": "answer_box",
    "people_also_ask": "related_questions",
    "top_stories": "top_stories",
    "video": "video_results",
    "local_pack": "local_results",
    "image_pack": "images_results",
    "knowledge_graph": "knowledge_graph",
    "shopping": "shopping_results",
}

SERP_FEATURES = tuple(SERP_FEATURE_SOURCE_KEYS.keys())
SerpFeature: TypeAlias = Literal[
    "featured_snippet",
    "people_also_ask",
    "top_stories",
    "video",
    "local_pack",
    "image_pack",
    "knowledge_graph",
    "shopping",
]


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int


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


class SiteAuditHistoryPoint(BaseModel):
    project_id: int
    crawl_id: int
    score: int
    calculated_at: datetime

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
    serp_features_json: str = "[]"

    class Config:
        from_attributes = True






class KeywordRankScheduleBase(BaseModel):
    frequency: KeywordScheduleFrequency = KeywordScheduleFrequency.DAILY
    day_of_week: Optional[int] = Field(default=None, ge=0, le=6)
    hour: int = Field(default=9, ge=0, le=23)
    timezone: str = "UTC"
    active: bool = True


class KeywordRankScheduleUpsert(KeywordRankScheduleBase):
    pass


class KeywordRankScheduleRead(KeywordRankScheduleBase):
    id: int
    project_id: int
    last_run_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class KeywordResearchRequest(BaseModel):
    seed_term: str
    locale: str = "en"
    market: str = "us"
    limit: int = Field(default=20, ge=1, le=100)


class KeywordResearchItem(BaseModel):
    keyword: str
    search_volume: int
    cpc: float
    difficulty: float
    intent: str
    provider_raw: dict


class KeywordResearchResponse(BaseModel):
    provider: str
    items: List[KeywordResearchItem]


class KeywordBulkCreateRequest(BaseModel):
    keywords: List[str] = Field(default_factory=list)
    locale: Optional[str] = None
    market: Optional[str] = None


class KeywordBulkCreateResponse(BaseModel):
    created: List[KeywordRead]
    skipped_existing: List[str]
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


class RankingDistributionPoint(BaseModel):
    bucket_start: datetime
    top3_count: int
    top10_count: int
    top100_count: int


class RankingDistributionSummary(BaseModel):
    top3_count: int
    top10_count: int
    top100_count: int
    top3_change: int
    top10_change: int
    top100_change: int


class RankingDistributionResponse(BaseModel):
    project_id: int
    bucket: str
    window_days: int
    summary: RankingDistributionSummary
    series: List[RankingDistributionPoint]


class CompetitorDomainCreate(BaseModel):
    domain: str


class CompetitorDomainUpdate(BaseModel):
    domain: str


class CompetitorDomainRead(BaseModel):
    id: int
    project_id: int
    domain: str
    created_at: datetime

    class Config:
        from_attributes = True


class KeywordGapRow(BaseModel):
    keyword: str
    search_volume: Optional[int] = None
    my_rank: Optional[int] = None
    competitor_a_rank: Optional[int] = None
    competitor_b_rank: Optional[int] = None
    competitor_c_rank: Optional[int] = None
    difficulty: Optional[float] = None
    opportunity_score: float = 0


class KeywordGapStats(BaseModel):
    common: int = 0
    gap: int = 0
    unique: int = 0


class KeywordGapResponse(BaseModel):
    project_id: int
    competitor_ids: List[int]
    competitor_domains: List[str]
    data_source: str
    stats: KeywordGapStats
    common: List[KeywordGapRow]
    gap: List[KeywordGapRow]
    unique: List[KeywordGapRow]


class BacklinkGapRow(BaseModel):
    referring_domain: str
    da: Optional[float] = None
    link_type: Optional[str] = None
    anchor_text: Optional[str] = None
    target_url: Optional[str] = None
    first_seen_at: Optional[datetime] = None


class BacklinkGapStats(BaseModel):
    shared_ref_domains: int = 0
    gap_ref_domains: int = 0
    unique_ref_domains: int = 0


class BacklinkGapResponse(BaseModel):
    project_id: int
    competitor_id: int
    competitor_domain: str
    provider: str
    source: str
    stats: BacklinkGapStats
    rows: List[BacklinkGapRow]
    total: int
    page: int
    page_size: int
    sort_by: str
    sort_order: str


class TrafficOverviewTrendPoint(BaseModel):
    month: str
    my_site: float
    competitor: float


class TrafficOverviewTopPage(BaseModel):
    url: str
    estimated_traffic: float
    keyword_count: int


class TrafficOverviewTopKeyword(BaseModel):
    keyword: str
    rank: Optional[int] = None
    search_volume: int = 0
    estimated_clicks: float = 0


class CompetitorTrafficOverviewResponse(BaseModel):
    project_id: int
    competitor_id: int
    data_source: str
    monthly_trend: List[TrafficOverviewTrendPoint]
    top_pages: List[TrafficOverviewTopPage]
    top_keywords: List[TrafficOverviewTopKeyword]
    notes: List[str] = Field(default_factory=list)


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
    ahrefs_rank: Optional[int] = None
    last_fetched_at: Optional[datetime] = None
    fetch_status: str = "pending"
    history: List[AuthorityPoint]
    notes: List[str]


class BacklinkSummaryResponse(BaseModel):
    project_id: int
    provider: str
    backlinks_total: int
    ref_domains: int
    ahrefs_rank: Optional[int] = None
    top_backlinks: List[dict] = Field(default_factory=list)
    last_fetched_at: Optional[datetime] = None
    fetch_status: str = "pending"
    anchor_distribution: dict[str, int]
    history: List[dict]
    notes: List[str]


class BacklinkStatusResponse(BaseModel):
    project_id: int
    provider: str
    last_fetched_at: Optional[datetime] = None
    fetch_status: str


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


class RefDomainListItem(BaseModel):
    domain: str
    backlinks_count: int
    da: Optional[float] = None
    first_seen: Optional[str] = None
    last_seen: Optional[str] = None


class RefDomainLinkItem(BaseModel):
    source_url: Optional[str] = None
    target_url: Optional[str] = None
    anchor: Optional[str] = None
    first_seen: Optional[str] = None
    lost_seen: Optional[str] = None
    status: str


class RefDomainDetailResponse(BaseModel):
    project_id: int
    domain: str
    total: int
    items: List[RefDomainLinkItem] = Field(default_factory=list)


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


class ApiKeyCreate(BaseModel):
    name: str
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime] = None


class ApiKeyRead(BaseModel):
    id: int
    project_id: int
    name: str
    key_prefix: str
    scopes: List[str] = Field(default_factory=list)
    expires_at: Optional[datetime]
    revoked_at: Optional[datetime]
    created_by_user_id: Optional[int]
    created_at: datetime


class ApiKeyCreateResponse(ApiKeyRead):
    plain_key: str
