from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from typing import List, Dict, Any, Optional

from app.db import get_session
from app.models import Project, Crawl, Issue, CrawlStatus
from app.schemas import ProjectCreate, ProjectRead, CrawlRead
from app.crawler.crawler import crawler_service

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
    statement = select(Crawl).where(Crawl.project_id == project_id).order_by(Crawl.start_time.desc())
    last_crawl = session.exec(statement).first()

    if not last_crawl:
        return {"stats": None}

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
        }
    }
