from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional, Literal
import json
from datetime import date

from app.db import get_session
from app.models import Project, Crawl, Issue, CrawlStatus, DomainMetricSnapshot, BacklinkSnapshot
from app.schemas import (
    ProjectCreate,
    ProjectRead,
    CrawlRead,
    ContentPerformanceResponse,
    AuthorityResponse,
    AuthorityPoint,
    BacklinkSummaryResponse,
    BacklinkChangesResponse,
)
from app.crawler.crawler import crawler_service
from app.analytics_service import analytics_service
from app.content_performance_service import content_performance_service
from app.backlink_service import backlink_service

router = APIRouter()


@router.post("/", response_model=ProjectRead)
def create_project(project: ProjectCreate, session: Session = Depends(get_session)):
    db_project = Project.model_validate(project)
    session.add(db_project)
    session.commit()
    session.refresh(db_project)
    return db_project


@router.get("/", response_model=List[ProjectRead])
def read_projects(skip: int = 0, limit: int = 100, session: Session = Depends(get_session)):
    projects = session.exec(select(Project).offset(skip).limit(limit)).all()
    return projects


@router.get("/{project_id}", response_model=ProjectRead)
def read_project(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


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

    statement = select(Crawl).where(Crawl.project_id == project_id).order_by(Crawl.start_time.desc())
    last_crawl = session.exec(statement).first()
    analytics = analytics_service.get_project_analytics(project_id, project.domain)

    if not last_crawl:
        return {
            "last_crawl": None,
            "total_pages": 0,
            "issues_count": 0,
            "issues_breakdown": {
                "critical": 0,
                "warning": 0,
                "info": 0,
            },
            "analytics": analytics,
        }

    issues = session.exec(select(Issue).where(Issue.crawl_id == last_crawl.id)).all()
    critical = len([i for i in issues if i.severity == "critical"])
    warning = len([i for i in issues if i.severity == "warning"])
    info = len([i for i in issues if i.severity == "info"])

    return {
        "last_crawl": last_crawl,
        "total_pages": last_crawl.total_pages,
        "issues_count": last_crawl.issues_count,
        "issues_breakdown": {
            "critical": critical,
            "warning": warning,
            "info": info
        },
        "analytics": analytics,
    }


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
