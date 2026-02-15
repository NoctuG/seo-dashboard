from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional, Literal
import json
from datetime import date
from collections import Counter

from app.db import get_session
from app.models import Project, Crawl, Issue, CrawlStatus, DomainMetricSnapshot, BacklinkSnapshot, SeoCostConfig, Page, PagePerformanceSnapshot
from app.schemas import (
    ProjectCreate,
    ProjectRead,
    CrawlRead,
    ContentPerformanceResponse,
    AuthorityResponse,
    AuthorityPoint,
    BacklinkSummaryResponse,
    BacklinkChangesResponse,
    VisibilityResponse,
    RoiFormulaBreakdownResponse,
    RoiCostBreakdown,
)
from app.crawler.crawler import crawler_service
from app.analytics_service import analytics_service
from app.content_performance_service import content_performance_service
from app.backlink_service import backlink_service
from app.visibility_service import visibility_service

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
        created_at=project.created_at,
    )


@router.post("/", response_model=ProjectRead)
def create_project(project: ProjectCreate, session: Session = Depends(get_session)):
    db_project = Project(
        name=project.name,
        domain=project.domain,
        brand_keywords_json=json.dumps(project.brand_keywords, ensure_ascii=False),
        brand_regex=project.brand_regex,
    )
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return _project_to_read(db_project)


@router.get("/", response_model=List[ProjectRead])
def read_projects(skip: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    projects = session.exec(select(Project).offset(skip).limit(limit)).all()
    return [_project_to_read(project) for project in projects]


@router.get("/{project_id}", response_model=ProjectRead)
def read_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return _project_to_read(project)


@router.delete("/{project_id}")
def delete_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    session.delete(project)
    session.commit()
    return {"ok": True}


@router.post("/{project_id}/crawl", response_model=CrawlRead)
def start_crawl(
    project_id: int,
    background_tasks: BackgroundTasks,
    max_pages: Optional[int] = None,
    sitemap_url: Optional[str] = None,
    session: Session = Depends(get_session)
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    crawl = Crawl(project_id=project_id, status=CrawlStatus.PENDING)
    session.add(crawl)
    session.commit()
    session.refresh(crawl)

    background_tasks.add_task(crawler_service.run_crawl, crawl.id, max_pages, sitemap_url)

    return crawl


@router.get("/{project_id}/crawls", response_model=List[CrawlRead])
def read_crawls(project_id: int, session: Session = Depends(get_session)):
    crawls = session.exec(select(Crawl).where(Crawl.project_id == project_id).order_by(Crawl.start_time.desc())).all()
    return crawls


@router.get("/{project_id}/dashboard", response_model=Dict[str, Any])
def get_dashboard(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

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
        raise HTTPException(status_code=404, detail="Project not found")

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
        raise HTTPException(status_code=404, detail="Project not found")

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
        raise HTTPException(status_code=404, detail="Project not found")

    return visibility_service.get_project_visibility(session=session, project_id=project_id)


def _sync_backlink_snapshot(session: Session, project_id: int, domain: str):
    metrics = backlink_service.get_metrics(domain)
    today = date.today()

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

    bs = session.exec(
        select(BacklinkSnapshot).where(
            BacklinkSnapshot.project_id == project_id,
            BacklinkSnapshot.date == today,
        )
    ).first()
    if not bs:
        bs = BacklinkSnapshot(project_id=project_id, date=today)

    bs.backlinks_total = metrics.backlinks_total
    bs.ref_domains = metrics.ref_domains
    bs.anchor_distribution_json = json.dumps(metrics.anchor_distribution, ensure_ascii=False)
    bs.new_links_json = json.dumps(metrics.new_links, ensure_ascii=False)
    bs.lost_links_json = json.dumps(metrics.lost_links, ensure_ascii=False)
    bs.notes_json = json.dumps(metrics.notes, ensure_ascii=False)
    bs.provider = metrics.provider
    session.add(bs)

    session.commit()


@router.get("/{project_id}/authority", response_model=AuthorityResponse)
def get_project_authority(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _sync_backlink_snapshot(session, project_id, project.domain)

    metrics_history = session.exec(
        select(DomainMetricSnapshot)
        .where(DomainMetricSnapshot.project_id == project_id)
        .order_by(DomainMetricSnapshot.date.asc())
        .limit(90)
    ).all()

    backlink_row = session.exec(
        select(BacklinkSnapshot)
        .where(BacklinkSnapshot.project_id == project_id)
        .order_by(BacklinkSnapshot.date.desc())
    ).first()

    history = [
        AuthorityPoint(date=str(item.date), domain_authority=item.domain_authority)
        for item in metrics_history
    ]

    return AuthorityResponse(
        project_id=project_id,
        provider=backlink_row.provider if backlink_row else "sample",
        domain_authority=history[-1].domain_authority if history else 0,
        history=history,
        notes=json.loads(backlink_row.notes_json) if backlink_row else [],
    )


@router.get("/{project_id}/backlinks", response_model=BacklinkSummaryResponse)
def get_project_backlinks(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _sync_backlink_snapshot(session, project_id, project.domain)

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
        anchor_distribution=json.loads(latest.anchor_distribution_json) if latest else {},
        history=[
            {
                "date": str(row.date),
                "backlinks_total": row.backlinks_total,
                "ref_domains": row.ref_domains,
            }
            for row in history_rows
        ],
        notes=json.loads(latest.notes_json) if latest else [],
    )


@router.get("/{project_id}/backlinks/changes", response_model=BacklinkChangesResponse)
def get_project_backlink_changes(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    _sync_backlink_snapshot(session, project_id, project.domain)

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
        new_links=json.loads(latest.new_links_json),
        lost_links=json.loads(latest.lost_links_json),
        notes=json.loads(latest.notes_json),
    )
