from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request
from sqlmodel import Session, func, select
from typing import List, Dict, Any, Optional, Literal
import json
from datetime import date, datetime
from fastapi.responses import Response
from collections import Counter

from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import Project, Crawl, Issue, CrawlStatus, DomainMetricSnapshot, BacklinkSnapshot, SeoCostConfig, Page, PagePerformanceSnapshot, ReportTemplate, ReportSchedule, ReportDeliveryLog, ProjectMember, ProjectRoleType, Role, User, AuditActionType
from app.schemas import (
    ProjectCreate,
    ProjectRead,
    CrawlRead,
    ContentPerformanceResponse,
    AuthorityResponse,
    AuthorityPoint,
    BacklinkSummaryResponse,
    BacklinkChangesResponse,
    BacklinkStatusResponse,
    VisibilityResponse,
    RoiFormulaBreakdownResponse,
    RoiCostBreakdown,
    ReportTemplateCreate,
    ReportTemplateRead,
    ReportScheduleCreate,
    ReportScheduleRead,
    ReportExportRequest,
    ReportDeliveryLogRead,
    ProjectSettingsUpdate,
    PaginatedResponse,
)
from app.crawler.crawler import crawler_service
from app.analytics_service import analytics_service
from app.content_performance_service import content_performance_service
from app.backlink_service import backlink_service
from app.visibility_service import visibility_service
from app.report_service import report_service
from app.scheduler_service import scheduler_service
from app.api.deps import get_current_user, require_project_role, write_audit_log
from app.config import settings
from app.metrics import update_crawl_status
from app.rate_limit import limiter

router = APIRouter()


def _project_to_read(project: Project) -> ProjectRead:
    try:
        brand_keywords = json.loads(project.brand_keywords_json or "[]")
        if not isinstance(brand_keywords, list):
            brand_keywords = []
    except json.JSONDecodeError:
        brand_keywords = []

    return ProjectRead(
        id=project.id,
        name=project.name,
        domain=project.domain,
        brand_keywords=brand_keywords,
        brand_regex=project.brand_regex,
        default_gl=project.default_gl,
        default_hl=project.default_hl,
        created_at=project.created_at,
    )


@router.post("/", response_model=ProjectRead)
def create_project(project: ProjectCreate, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    db_project = Project(
        name=project.name,
        domain=project.domain,
        brand_keywords_json=json.dumps(project.brand_keywords, ensure_ascii=False),
        brand_regex=project.brand_regex,
        default_gl=project.default_gl,
        default_hl=project.default_hl,
    )
    session.add(db_project)
    session.commit()
    session.refresh(db_project)

    admin_role = session.exec(select(Role).where(Role.name == ProjectRoleType.ADMIN)).first()
    if admin_role:
        session.add(ProjectMember(project_id=db_project.id, user_id=user.id, role_id=admin_role.id))
        session.commit()

    write_audit_log(session, AuditActionType.PROJECT_CREATE, user.id, "project", db_project.id, {"name": db_project.name})
    return _project_to_read(db_project)


@router.get("/", response_model=PaginatedResponse[ProjectRead])
def read_projects(page: int = 1, page_size: int = 20, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    if user.is_superuser:
        total = session.exec(select(func.count()).select_from(Project)).one()
        projects = session.exec(select(Project).offset(offset).limit(page_size)).all()
    else:
        memberships = session.exec(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)).all()
        if memberships:
            total = session.exec(
                select(func.count()).select_from(Project).where(Project.id.in_(memberships))
            ).one()
            projects = session.exec(select(Project).where(Project.id.in_(memberships)).offset(offset).limit(page_size)).all()
        else:
            total = 0
            projects = []

    return {
        "items": [_project_to_read(project) for project in projects],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{project_id}", response_model=ProjectRead)
def read_project(project_id: int, session: Session = Depends(get_session), _: User = Depends(require_project_role(ProjectRoleType.VIEWER))):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)
    return _project_to_read(project)




@router.patch("/{project_id}/settings", response_model=ProjectRead)
def update_project_settings(
    project_id: int,
    payload: ProjectSettingsUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    if payload.default_gl is not None:
        project.default_gl = payload.default_gl.strip().lower() or project.default_gl
    if payload.default_hl is not None:
        project.default_hl = payload.default_hl.strip().lower() or project.default_hl

    session.add(project)
    session.commit()
    session.refresh(project)
    return _project_to_read(project)

@router.delete("/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session), user: User = Depends(require_project_role(ProjectRoleType.ADMIN))):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)
    session.delete(project)
    session.commit()
    write_audit_log(session, AuditActionType.PROJECT_DELETE, user.id, "project", project_id, {"name": project.name})
    return {"ok": True}


@router.post("/{project_id}/crawl", response_model=CrawlRead)
@limiter.limit(settings.RATE_LIMIT_CRAWL_START)
def start_crawl(
    request: Request,
    project_id: int,
    background_tasks: BackgroundTasks,
    max_pages: Optional[int] = None,
    sitemap_url: Optional[str] = None,
    session: Session = Depends(get_session),
    user: User = Depends(require_project_role(ProjectRoleType.ADMIN))
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    crawl = Crawl(project_id=project_id, status=CrawlStatus.PENDING)
    session.add(crawl)
    session.commit()
    session.refresh(crawl)
    update_crawl_status(None, CrawlStatus.PENDING.value)

    background_tasks.add_task(crawler_service.run_crawl, crawl.id, max_pages, sitemap_url)
    write_audit_log(session, AuditActionType.CRAWL_START, user.id, "crawl", crawl.id, {"project_id": project_id})

    return crawl


@router.get("/{project_id}/crawls", response_model=PaginatedResponse[CrawlRead])
def read_crawls(
    project_id: int,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    total = session.exec(select(func.count()).select_from(Crawl).where(Crawl.project_id == project_id)).one()
    crawls = session.exec(
        select(Crawl)
        .where(Crawl.project_id == project_id)
        .order_by(Crawl.start_time.desc())
        .offset(offset)
        .limit(page_size)
    ).all()
    return {"items": crawls, "total": total, "page": page, "page_size": page_size}


@router.get("/{project_id}/dashboard", response_model=Dict[str, Any])
def get_dashboard(project_id: int, session: Session = Depends(get_session), _: User = Depends(require_project_role(ProjectRoleType.VIEWER))):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    crawls = session.exec(
        select(Crawl).where(Crawl.project_id == project_id).order_by(Crawl.start_time.desc()).limit(5)
    ).all()
    last_crawl = crawls[0] if crawls else None

    cost_config = session.exec(select(SeoCostConfig).where(SeoCostConfig.project_id == project_id)).first()
    analytics = analytics_service.get_project_analytics(
        project_id,
        project.domain,
        project.brand_keywords_json,
        project.brand_regex,
        cost_config.dict() if cost_config else None,
    )

    empty_technical_health = {
        "pass_rate": 0,
        "failed_items": 0,
        "trend": [],
        "cwv_scorecard": {"good": 0, "needs_improvement": 0, "poor": 0, "missing": 0},
        "indexability_anomalies": [],
        "structured_data_errors": [],
    }

    if not last_crawl:
        return {
            "last_crawl": None,
            "total_pages": 0,
            "issues_count": 0,
            "issues_breakdown": {"critical": 0, "warning": 0, "info": 0},
            "technical_health": empty_technical_health,
            "analytics": analytics,
        }

    issues = session.exec(select(Issue).where(Issue.crawl_id == last_crawl.id)).all()
    critical = len([i for i in issues if i.severity == "critical"])
    warning = len([i for i in issues if i.severity == "warning"])
    info = len([i for i in issues if i.severity == "info"])

    issue_counter = Counter(i.issue_type for i in issues)
    total_checks = max(last_crawl.total_pages, 1)
    failed_items = len([i for i in issues if i.severity in {"critical", "warning"}])
    pass_rate = round(max((total_checks - failed_items) / total_checks, 0) * 100, 2)

    trend = []
    for crawl in reversed(crawls):
        crawl_issues = session.exec(select(Issue).where(Issue.crawl_id == crawl.id)).all()
        crawl_failures = len([i for i in crawl_issues if i.severity in {"critical", "warning"}])
        denominator = max(crawl.total_pages, 1)
        crawl_pass_rate = round(max((denominator - crawl_failures) / denominator, 0) * 100, 2)
        trend.append({"crawl_id": crawl.id, "date": crawl.start_time.date().isoformat(), "pass_rate": crawl_pass_rate})

    perf_snapshots = session.exec(
        select(PagePerformanceSnapshot)
        .join(Page, Page.id == PagePerformanceSnapshot.page_id)
        .where(Page.crawl_id == last_crawl.id)
    ).all()

    cwv_scorecard = {"good": 0, "needs_improvement": 0, "poor": 0, "missing": 0}
    for snapshot in perf_snapshots:
        if snapshot.lcp_ms is None or snapshot.cls is None:
            cwv_scorecard["missing"] += 1
            continue
        if snapshot.lcp_ms <= 2500 and snapshot.cls <= 0.1:
            cwv_scorecard["good"] += 1
        elif snapshot.lcp_ms > 4000 or snapshot.cls > 0.25:
            cwv_scorecard["poor"] += 1
        else:
            cwv_scorecard["needs_improvement"] += 1

    indexability_anomalies = [
        {"issue_type": issue_type, "count": count}
        for issue_type, count in issue_counter.items()
        if issue_type in {
            "technical_seo.noindex_detected",
            "technical_seo.nofollow_detected",
            "technical_seo.missing_canonical",
        }
    ]
    structured_data_errors = [
        {"issue_type": issue_type, "count": count}
        for issue_type, count in issue_counter.items()
        if issue_type in {
            "technical_seo.structured_data_invalid",
            "technical_seo.structured_data_missing",
        }
    ]

    return {
        "last_crawl": last_crawl,
        "total_pages": last_crawl.total_pages,
        "issues_count": last_crawl.issues_count,
        "issues_breakdown": {"critical": critical, "warning": warning, "info": info},
        "technical_health": {
            "pass_rate": pass_rate,
            "failed_items": failed_items,
            "trend": trend,
            "cwv_scorecard": cwv_scorecard,
            "indexability_anomalies": indexability_anomalies,
            "structured_data_errors": structured_data_errors,
        },
        "analytics": analytics,
    }


@router.get("/{project_id}/roi", response_model=RoiFormulaBreakdownResponse)
def get_project_roi(
    project_id: int,
    time_range: Literal["30d", "90d", "12m"] = "30d",
    attribution_model: Literal["linear", "first_click", "last_click"] = "linear",
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    cost_config = session.exec(select(SeoCostConfig).where(SeoCostConfig.project_id == project_id)).first()
    if not cost_config:
        cost_config = SeoCostConfig(project_id=project_id)
        session.add(cost_config)
        session.commit()
        session.refresh(cost_config)

    analytics = analytics_service.get_project_analytics(
        project_id,
        project.domain,
        project.brand_keywords_json,
        project.brand_regex,
        cost_config.dict(),
    )

    months = {"30d": 1, "90d": 3, "12m": 12}[time_range]
    attribution_weight = {"linear": 0.6, "first_click": 0.45, "last_click": 0.8}[attribution_model]

    revenue = float(analytics["totals"].get("revenue", 0) or 0) * months
    pipeline_value = float(analytics["totals"].get("pipeline_value", 0) or 0) * months
    assisted_conversions = float(analytics["totals"].get("assisted_conversions", 0) or 0) * months
    direct_conversions = float(analytics["totals"].get("conversions", 0) or 0) * months

    gain = revenue + (pipeline_value - revenue) * attribution_weight

    monthly_total_cost = (
        cost_config.monthly_human_cost
        + cost_config.monthly_tool_cost
        + cost_config.monthly_outsourcing_cost
        + cost_config.monthly_content_cost
    )
    total_cost = monthly_total_cost * months
    roi = ((gain - total_cost) / total_cost) if total_cost > 0 else 0

    return RoiFormulaBreakdownResponse(
        project_id=project_id,
        provider=analytics.get("provider", "sample"),
        time_range=time_range,
        attribution_model=attribution_model,
        assisted_conversions=round(assisted_conversions, 2),
        conversions=round(direct_conversions, 2),
        revenue=round(revenue, 2),
        pipeline_value=round(pipeline_value, 2),
        gain=round(gain, 2),
        cost=RoiCostBreakdown(
            monthly_human_cost=cost_config.monthly_human_cost,
            monthly_tool_cost=cost_config.monthly_tool_cost,
            monthly_outsourcing_cost=cost_config.monthly_outsourcing_cost,
            monthly_content_cost=cost_config.monthly_content_cost,
            monthly_total_cost=round(monthly_total_cost, 2),
            currency=cost_config.currency,
        ),
        roi=round(roi, 4),
        roi_pct=round(roi * 100, 2),
        formula={
            "gain": "gain = revenue + (pipeline_value - revenue) * attribution_weight",
            "cost": "cost = monthly_total_cost * months",
            "roi": "roi = (gain - cost) / cost",
        },
    )

@router.get("/{project_id}/content-performance", response_model=ContentPerformanceResponse)
def get_content_performance(
    project_id: int,
    window: Literal["7d", "30d", "90d"] = "30d",
    sort: Literal["traffic", "conversion_rate", "decay"] = "traffic",
    session: Session = Depends(get_session),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    return content_performance_service.get_project_content_performance(
        session=session,
        project_id=project_id,
        window=window,
        sort=sort,
    )



@router.get("/{project_id}/visibility", response_model=VisibilityResponse)
def get_project_visibility(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    return visibility_service.get_project_visibility(session=session, project_id=project_id)


BACKLINK_CACHE_TTL_SECONDS = max(60, getattr(settings, "BACKLINK_CACHE_TTL_SECONDS", 6 * 3600))


def _json_loads(payload: str, default):
    try:
        value = json.loads(payload or "")
        return value if value is not None else default
    except json.JSONDecodeError:
        return default


def _is_snapshot_fresh(snapshot: Optional[BacklinkSnapshot]) -> bool:
    if not snapshot or snapshot.date != date.today() or not snapshot.last_fetched_at:
        return False
    age_seconds = (datetime.utcnow() - snapshot.last_fetched_at).total_seconds()
    return age_seconds <= BACKLINK_CACHE_TTL_SECONDS and snapshot.fetch_status == "success"


def _queue_backlink_refresh(project_id: int, domain: str) -> None:
    from app.db import engine

    with Session(engine) as worker_session:
        _sync_backlink_snapshot(worker_session, project_id=project_id, domain=domain, force_refresh=True)


def _sync_backlink_snapshot(session: Session, project_id: int, domain: str, force_refresh: bool = False):
    today = date.today()
    bs = session.exec(
        select(BacklinkSnapshot).where(
            BacklinkSnapshot.project_id == project_id,
            BacklinkSnapshot.date == today,
        )
    ).first()

    if bs and _is_snapshot_fresh(bs) and not force_refresh:
        return bs

    if not bs:
        bs = BacklinkSnapshot(project_id=project_id, date=today, fetch_status="pending")

    metrics = backlink_service.get_metrics(domain)
    now = datetime.utcnow()
    bs.provider = metrics.provider
    bs.last_fetched_at = now

    if metrics.success:
        dm = session.exec(
            select(DomainMetricSnapshot).where(
                DomainMetricSnapshot.project_id == project_id,
                DomainMetricSnapshot.date == today,
            )
        ).first()
        if not dm:
            dm = DomainMetricSnapshot(project_id=project_id, date=today)
        dm.domain_authority = metrics.domain_authority
        session.add(dm)

        bs.backlinks_total = metrics.backlinks_total
        bs.ref_domains = metrics.ref_domains
        bs.ahrefs_rank = metrics.ahrefs_rank
        bs.anchor_distribution_json = json.dumps(metrics.anchor_distribution, ensure_ascii=False)
        bs.new_links_json = json.dumps(metrics.new_links, ensure_ascii=False)
        bs.lost_links_json = json.dumps(metrics.lost_links, ensure_ascii=False)
        bs.top_backlinks_json = json.dumps(metrics.top_backlinks, ensure_ascii=False)
        bs.notes_json = json.dumps(metrics.notes, ensure_ascii=False)
        bs.fetch_status = "success"
    else:
        existing_notes = _json_loads(bs.notes_json, []) if bs.id else []
        bs.notes_json = json.dumps([*existing_notes, *metrics.notes][-10:], ensure_ascii=False)
        bs.fetch_status = "failed"

    session.add(bs)
    session.commit()
    session.refresh(bs)
    return bs


def _ensure_backlink_snapshot(
    session: Session,
    project_id: int,
    domain: str,
    background_tasks: Optional[BackgroundTasks],
) -> Optional[BacklinkSnapshot]:
    latest = session.exec(
        select(BacklinkSnapshot)
        .where(BacklinkSnapshot.project_id == project_id)
        .order_by(BacklinkSnapshot.date.desc())
    ).first()

    if _is_snapshot_fresh(latest):
        return latest

    if latest and latest.fetch_status == "pending":
        return latest

    today_row = session.exec(
        select(BacklinkSnapshot).where(
            BacklinkSnapshot.project_id == project_id,
            BacklinkSnapshot.date == date.today(),
        )
    ).first()
    if not today_row:
        today_row = BacklinkSnapshot(project_id=project_id, date=date.today(), fetch_status="pending")
    else:
        today_row.fetch_status = "pending"
    session.add(today_row)
    session.commit()

    if background_tasks is not None:
        background_tasks.add_task(_queue_backlink_refresh, project_id, domain)

    return latest or today_row


@router.get("/{project_id}/authority", response_model=AuthorityResponse)
def get_project_authority(project_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    backlink_row = _ensure_backlink_snapshot(session, project_id, project.domain, background_tasks)

    metrics_history = session.exec(
        select(DomainMetricSnapshot)
        .where(DomainMetricSnapshot.project_id == project_id)
        .order_by(DomainMetricSnapshot.date.asc())
        .limit(90)
    ).all()

    history = [
        AuthorityPoint(date=str(item.date), domain_authority=item.domain_authority)
        for item in metrics_history
    ]

    return AuthorityResponse(
        project_id=project_id,
        provider=backlink_row.provider if backlink_row else "sample",
        domain_authority=history[-1].domain_authority if history else 0,
        ahrefs_rank=backlink_row.ahrefs_rank if backlink_row else None,
        last_fetched_at=backlink_row.last_fetched_at if backlink_row else None,
        fetch_status=backlink_row.fetch_status if backlink_row else "pending",
        history=history,
        notes=_json_loads(backlink_row.notes_json, []) if backlink_row else [],
    )


@router.get("/{project_id}/backlinks", response_model=BacklinkSummaryResponse)
def get_project_backlinks(project_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    _ensure_backlink_snapshot(session, project_id, project.domain, background_tasks)

    latest = session.exec(
        select(BacklinkSnapshot)
        .where(BacklinkSnapshot.project_id == project_id)
        .order_by(BacklinkSnapshot.date.desc())
    ).first()

    history_rows = session.exec(
        select(BacklinkSnapshot)
        .where(BacklinkSnapshot.project_id == project_id)
        .order_by(BacklinkSnapshot.date.asc())
        .limit(90)
    ).all()

    return BacklinkSummaryResponse(
        project_id=project_id,
        provider=latest.provider if latest else "sample",
        backlinks_total=latest.backlinks_total if latest else 0,
        ref_domains=latest.ref_domains if latest else 0,
        ahrefs_rank=latest.ahrefs_rank if latest else None,
        top_backlinks=_json_loads(latest.top_backlinks_json, []) if latest else [],
        last_fetched_at=latest.last_fetched_at if latest else None,
        fetch_status=latest.fetch_status if latest else "pending",
        anchor_distribution=_json_loads(latest.anchor_distribution_json, {}) if latest else {},
        history=[
            {
                "date": str(row.date),
                "backlinks_total": row.backlinks_total,
                "ref_domains": row.ref_domains,
            }
            for row in history_rows
        ],
        notes=_json_loads(latest.notes_json, []) if latest else [],
    )


@router.get("/{project_id}/backlinks/status", response_model=BacklinkStatusResponse)
def get_project_backlink_status(project_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    latest = _ensure_backlink_snapshot(session, project_id, project.domain, background_tasks)

    return {
        "project_id": project_id,
        "provider": latest.provider if latest else "sample",
        "last_fetched_at": latest.last_fetched_at if latest else None,
        "fetch_status": latest.fetch_status if latest else "pending",
    }


@router.get("/{project_id}/backlinks/changes", response_model=BacklinkChangesResponse)
def get_project_backlink_changes(project_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    _ensure_backlink_snapshot(session, project_id, project.domain, background_tasks)

    latest = session.exec(
        select(BacklinkSnapshot)
        .where(BacklinkSnapshot.project_id == project_id)
        .order_by(BacklinkSnapshot.date.desc())
    ).first()

    if not latest:
        return BacklinkChangesResponse(project_id=project_id, provider="sample", new_links=[], lost_links=[], notes=["No backlink data available."])

    return BacklinkChangesResponse(
        project_id=project_id,
        provider=latest.provider,
        new_links=_json_loads(latest.new_links_json, []),
        lost_links=_json_loads(latest.lost_links_json, []),
        notes=_json_loads(latest.notes_json, []),
    )


def _template_to_read(template: ReportTemplate) -> ReportTemplateRead:
    return ReportTemplateRead(
        id=template.id,
        project_id=template.project_id,
        name=template.name,
        indicators=json.loads(template.indicators_json or "[]"),
        brand_styles=json.loads(template.brand_styles_json or "{}"),
        time_range=template.time_range,
        locale=template.locale,
        created_at=template.created_at,
        updated_at=template.updated_at,
    )


@router.get("/{project_id}/reports/templates", response_model=List[ReportTemplateRead])
def list_report_templates(project_id: int, session: Session = Depends(get_session)):
    templates = session.exec(
        select(ReportTemplate).where(ReportTemplate.project_id == project_id).order_by(ReportTemplate.created_at.desc())
    ).all()
    return [_template_to_read(template) for template in templates]


@router.post("/{project_id}/reports/templates", response_model=ReportTemplateRead)
def create_report_template(project_id: int, payload: ReportTemplateCreate, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    template = ReportTemplate(
        project_id=project_id,
        name=payload.name,
        indicators_json=json.dumps(payload.indicators, ensure_ascii=False),
        brand_styles_json=json.dumps(payload.brand_styles, ensure_ascii=False),
        time_range=payload.time_range,
        locale=payload.locale,
    )
    session.add(template)
    session.commit()
    session.refresh(template)
    return _template_to_read(template)


@router.put("/{project_id}/reports/templates/{template_id}", response_model=ReportTemplateRead)
def update_report_template(project_id: int, template_id: int, payload: ReportTemplateCreate, session: Session = Depends(get_session)):
    template = session.get(ReportTemplate, template_id)
    if not template or template.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.TEMPLATE_NOT_FOUND)

    template.name = payload.name
    template.indicators_json = json.dumps(payload.indicators, ensure_ascii=False)
    template.brand_styles_json = json.dumps(payload.brand_styles, ensure_ascii=False)
    template.time_range = payload.time_range
    template.locale = payload.locale
    template.updated_at = datetime.utcnow()
    session.add(template)
    session.commit()
    session.refresh(template)
    return _template_to_read(template)


@router.post("/{project_id}/reports/export")
def export_report(project_id: int, payload: ReportExportRequest, session: Session = Depends(get_session)):
    template = session.get(ReportTemplate, payload.template_id)
    if not template or template.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.TEMPLATE_NOT_FOUND)

    try:
        if payload.locale:
            template.locale = payload.locale
        report_payload = report_service.build_report_payload(session, project_id, template)
        content, media_type = report_service.render(report_payload, payload.format)
    except ValueError as exc:
        report_service.create_delivery_log(
            session,
            project_id=project_id,
            template_id=template.id,
            schedule_id=None,
            recipient_email=None,
            export_format=payload.format,
            retries=0,
            status="failed",
            error_message=report_service.format_delivery_error(exc),
        )
        raise HTTPException(status_code=400, detail=ErrorCode.UNEXPECTED_ERROR) from exc

    report_service.create_delivery_log(
        session,
        project_id=project_id,
        template_id=template.id,
        schedule_id=None,
        recipient_email=None,
        export_format=payload.format,
        retries=0,
        status="success",
    )

    report_service.dispatch_report_generated(
        session,
        project_id=project_id,
        template_id=template.id,
        export_format=payload.format,
        trigger="manual_export",
    )

    filename = f"report-{project_id}-{template.id}.{payload.format.lower()}"
    return Response(content=content, media_type=media_type, headers={"Content-Disposition": f"attachment; filename={filename}"})


@router.get("/{project_id}/reports/schedules", response_model=List[ReportScheduleRead])
def list_report_schedules(project_id: int, session: Session = Depends(get_session)):
    schedules = session.exec(
        select(ReportSchedule).where(ReportSchedule.project_id == project_id).order_by(ReportSchedule.created_at.desc())
    ).all()
    return schedules


@router.post("/{project_id}/reports/schedules", response_model=ReportScheduleRead)
def create_report_schedule(project_id: int, payload: ReportScheduleCreate, session: Session = Depends(get_session)):
    template = session.get(ReportTemplate, payload.template_id)
    if not template or template.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.TEMPLATE_NOT_FOUND)

    schedule = ReportSchedule(project_id=project_id, **payload.model_dump())
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    scheduler_service.reload_jobs()
    return schedule


@router.delete("/{project_id}/reports/schedules/{schedule_id}")
def delete_report_schedule(project_id: int, schedule_id: int, session: Session = Depends(get_session)):
    schedule = session.get(ReportSchedule, schedule_id)
    if not schedule or schedule.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.SCHEDULE_NOT_FOUND)
    session.delete(schedule)
    session.commit()
    scheduler_service.reload_jobs()
    return {"ok": True}


@router.get("/{project_id}/reports/logs", response_model=List[ReportDeliveryLogRead])
def list_report_logs(project_id: int, session: Session = Depends(get_session)):
    logs = session.exec(
        select(ReportDeliveryLog).where(ReportDeliveryLog.project_id == project_id).order_by(ReportDeliveryLog.created_at.desc()).limit(200)
    ).all()
    return logs


@router.get("/{project_id}/permissions")
def get_project_permissions(project_id: int, session: Session = Depends(get_session), user: User = Depends(get_current_user)):
    if user.is_superuser:
        return {"role": "admin"}
    membership = session.exec(select(ProjectMember).join(Role, Role.id == ProjectMember.role_id).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)).first()
    if not membership:
        raise HTTPException(status_code=403, detail=ErrorCode.NO_PROJECT_ACCESS)
    role = session.get(Role, membership.role_id)
    return {"role": role.name.value}
