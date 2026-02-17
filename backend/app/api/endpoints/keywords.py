import json
from datetime import datetime, timedelta
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, func, select

from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import CompetitorDomain, Keyword, KeywordRankSchedule, KeywordScheduleFrequency, RankHistory, Project, ProjectRoleType, User
from app.keyword_research_service import keyword_research_service
from app.schemas import (
    CompetitorDomainCreate,
    CompetitorDomainRead,
    KeywordBulkCreateRequest,
    KeywordBulkCreateResponse,
    KeywordCreate,
    KeywordRead,
    KeywordRankScheduleRead,
    KeywordRankScheduleUpsert,
    KeywordResearchRequest,
    KeywordResearchResponse,
    RankHistoryRead,
    VisibilityHistoryRead,
    PaginatedResponse,
    RankingDistributionPoint,
    RankingDistributionResponse,
    RankingDistributionSummary,
)
from app.serp_service import check_keyword_rank
from app.visibility_service import visibility_service
from app.api.deps import require_project_role
from app.scheduler_service import scheduler_service

router = APIRouter()



def _resolve_geo_language(project: Project, keyword: Keyword) -> tuple[str, str]:
    gl = (keyword.market or project.default_gl or "us").strip().lower()
    hl = (keyword.locale or project.default_hl or "en").strip().lower()
    return gl, hl


def _bucket_start_for_dt(value: datetime, bucket: str) -> datetime:
    if bucket == "week":
        start = value - timedelta(days=value.weekday())
        return datetime(start.year, start.month, start.day)
    return datetime(value.year, value.month, value.day)


def _build_distribution_row(ranks: list[int]) -> dict[str, int]:
    return {
        "top3_count": sum(1 for rank in ranks if rank <= 3),
        "top10_count": sum(1 for rank in ranks if rank <= 10),
        "top100_count": sum(1 for rank in ranks if rank <= 100),
    }


@router.get("/{project_id}/rankings/distribution", response_model=RankingDistributionResponse)
def get_rankings_distribution(
    project_id: int,
    window_days: int = 30,
    bucket: str = "day",
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    if window_days not in {7, 30, 90}:
        raise HTTPException(status_code=400, detail="window_days must be one of 7, 30, 90")
    if bucket not in {"day", "week"}:
        raise HTTPException(status_code=400, detail="bucket must be one of day, week")

    now = datetime.utcnow()
    current_window_start = now - timedelta(days=window_days)
    lookback_start = current_window_start - timedelta(days=7)

    rows = session.exec(
        select(RankHistory)
        .join(Keyword, Keyword.id == RankHistory.keyword_id)
        .where(
            Keyword.project_id == project_id,
            RankHistory.checked_at >= lookback_start,
        )
        .order_by(RankHistory.checked_at.asc())
    ).all()

    latest_per_keyword_bucket: dict[tuple[int, datetime], RankHistory] = {}
    for row in rows:
        if row.rank is None:
            continue
        bucket_start = _bucket_start_for_dt(row.checked_at, bucket)
        key = (row.keyword_id, bucket_start)
        previous = latest_per_keyword_bucket.get(key)
        if not previous or previous.checked_at < row.checked_at:
            latest_per_keyword_bucket[key] = row

    bucket_ranks: dict[datetime, list[int]] = {}
    for (_keyword_id, bucket_start), row in latest_per_keyword_bucket.items():
        bucket_ranks.setdefault(bucket_start, []).append(row.rank)

    series: list[RankingDistributionPoint] = []
    for bucket_start in sorted(bucket_ranks.keys()):
        if bucket_start < _bucket_start_for_dt(current_window_start, bucket):
            continue
        counts = _build_distribution_row(bucket_ranks[bucket_start])
        series.append(RankingDistributionPoint(bucket_start=bucket_start, **counts))

    latest_bucket_counts = {"top3_count": 0, "top10_count": 0, "top100_count": 0}
    previous_bucket_counts = {"top3_count": 0, "top10_count": 0, "top100_count": 0}

    if series:
        latest_bucket = series[-1].bucket_start
        latest_bucket_counts = {
            "top3_count": series[-1].top3_count,
            "top10_count": series[-1].top10_count,
            "top100_count": series[-1].top100_count,
        }
        compare_bucket_start = latest_bucket - timedelta(days=7)
        for point in series:
            if point.bucket_start == compare_bucket_start:
                previous_bucket_counts = {
                    "top3_count": point.top3_count,
                    "top10_count": point.top10_count,
                    "top100_count": point.top100_count,
                }
                break

    summary = RankingDistributionSummary(
        top3_count=latest_bucket_counts["top3_count"],
        top10_count=latest_bucket_counts["top10_count"],
        top100_count=latest_bucket_counts["top100_count"],
        top3_change=latest_bucket_counts["top3_count"] - previous_bucket_counts["top3_count"],
        top10_change=latest_bucket_counts["top10_count"] - previous_bucket_counts["top10_count"],
        top100_change=latest_bucket_counts["top100_count"] - previous_bucket_counts["top100_count"],
    )

    return RankingDistributionResponse(
        project_id=project_id,
        bucket=bucket,
        window_days=window_days,
        summary=summary,
        series=series,
    )


@router.get("/{project_id}/competitors", response_model=PaginatedResponse[CompetitorDomainRead])
def list_competitors(
    project_id: int,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    query = (
        select(CompetitorDomain)
        .where(CompetitorDomain.project_id == project_id)
        .order_by(CompetitorDomain.created_at.desc())
    )
    total = session.exec(
        select(func.count()).select_from(CompetitorDomain).where(CompetitorDomain.project_id == project_id)
    ).one()
    items = session.exec(query.offset(offset).limit(page_size)).all()
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/{project_id}/competitors", response_model=CompetitorDomainRead)
def create_competitor(
    project_id: int,
    payload: CompetitorDomainCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    normalized_domain = payload.domain.strip().lower()
    exists = session.exec(
        select(CompetitorDomain).where(
            CompetitorDomain.project_id == project_id,
            CompetitorDomain.domain == normalized_domain,
        )
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail=ErrorCode.COMPETITOR_DOMAIN_ALREADY_EXISTS)

    competitor = CompetitorDomain(project_id=project_id, domain=normalized_domain)
    session.add(competitor)
    session.commit()
    session.refresh(competitor)
    return competitor


@router.delete("/{project_id}/competitors/{competitor_id}")
def delete_competitor(project_id: int, competitor_id: int, session: Session = Depends(get_session), _: User = Depends(require_project_role(ProjectRoleType.ADMIN))):
    competitor = session.get(CompetitorDomain, competitor_id)
    if not competitor or competitor.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.COMPETITOR_NOT_FOUND)

    session.delete(competitor)
    session.commit()
    return {"ok": True}


@router.get("/{project_id}/keywords", response_model=PaginatedResponse[KeywordRead])
def list_keywords(
    project_id: int,
    page: int = 1,
    page_size: int = 20,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    offset = (page - 1) * page_size

    total = session.exec(select(func.count()).select_from(Keyword).where(Keyword.project_id == project_id)).one()
    keywords = session.exec(
        select(Keyword).where(Keyword.project_id == project_id).offset(offset).limit(page_size)
    ).all()
    return {"items": keywords, "total": total, "page": page, "page_size": page_size}


def _validate_keyword_schedule(payload: KeywordRankScheduleUpsert) -> None:
    if payload.frequency == KeywordScheduleFrequency.WEEKLY and payload.day_of_week is None:
        raise HTTPException(status_code=400, detail="day_of_week is required for weekly frequency")


@router.get("/{project_id}/keyword-rank-schedule", response_model=KeywordRankScheduleRead | None)
def get_keyword_rank_schedule(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    schedule = session.exec(
        select(KeywordRankSchedule).where(KeywordRankSchedule.project_id == project_id)
    ).first()
    return schedule


@router.post("/{project_id}/keyword-rank-schedule", response_model=KeywordRankScheduleRead)
def create_or_update_keyword_rank_schedule(
    project_id: int,
    payload: KeywordRankScheduleUpsert,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    _validate_keyword_schedule(payload)

    schedule = session.exec(
        select(KeywordRankSchedule).where(KeywordRankSchedule.project_id == project_id)
    ).first()
    if not schedule:
        schedule = KeywordRankSchedule(project_id=project_id)

    values = payload.model_dump()
    for field, value in values.items():
        setattr(schedule, field, value)
    if schedule.frequency == KeywordScheduleFrequency.DAILY:
        schedule.day_of_week = None
    schedule.updated_at = datetime.utcnow()

    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    scheduler_service.reload_jobs()
    return schedule


@router.post("/{project_id}/keyword-rank-schedule/toggle", response_model=KeywordRankScheduleRead)
def toggle_keyword_rank_schedule(
    project_id: int,
    active: bool,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    schedule = session.exec(
        select(KeywordRankSchedule).where(KeywordRankSchedule.project_id == project_id)
    ).first()
    if not schedule:
        raise HTTPException(status_code=404, detail="KEYWORD_RANK_SCHEDULE_NOT_FOUND")

    schedule.active = active
    schedule.updated_at = datetime.utcnow()
    session.add(schedule)
    session.commit()
    session.refresh(schedule)
    scheduler_service.reload_jobs()
    return schedule



@router.post("/{project_id}/keywords", response_model=KeywordRead)
def create_keyword(
    project_id: int,
    payload: KeywordCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keyword = Keyword(
        project_id=project_id,
        term=payload.term,
        target_url=payload.target_url,
        locale=payload.locale,
        market=payload.market,
    )
    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return keyword




@router.post("/{project_id}/keyword-research", response_model=KeywordResearchResponse)
def run_keyword_research(
    project_id: int,
    payload: KeywordResearchRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    locale = (payload.locale or project.default_hl or "en").strip().lower()
    market = (payload.market or project.default_gl or "us").strip().lower()
    seed_term = payload.seed_term.strip()
    if not seed_term:
        raise HTTPException(status_code=400, detail="seed_term is required")

    results = keyword_research_service.get_keywords(
        seed_term=seed_term,
        locale=locale,
        market=market,
        limit=payload.limit,
    )
    return {"provider": keyword_research_service.current_provider(), "items": results}


@router.post("/{project_id}/keywords/bulk-create", response_model=KeywordBulkCreateResponse)
def bulk_create_keywords(
    project_id: int,
    payload: KeywordBulkCreateRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    normalized_terms: list[str] = []
    seen_terms: set[str] = set()
    for term in payload.keywords:
        normalized = term.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen_terms:
            continue
        seen_terms.add(key)
        normalized_terms.append(normalized)

    if not normalized_terms:
        return {"created": [], "skipped_existing": []}

    existing_rows = session.exec(
        select(Keyword.term).where(
            Keyword.project_id == project_id,
            func.lower(Keyword.term).in_([value.lower() for value in normalized_terms]),
        )
    ).all()
    existing_lower = {term.lower() for term in existing_rows}

    to_create = [term for term in normalized_terms if term.lower() not in existing_lower]
    created: list[Keyword] = []
    for term in to_create:
        keyword = Keyword(
            project_id=project_id,
            term=term,
            locale=payload.locale,
            market=payload.market,
        )
        session.add(keyword)
        created.append(keyword)

    session.commit()
    for item in created:
        session.refresh(item)

    skipped_existing = [term for term in normalized_terms if term.lower() in existing_lower]
    return {"created": created, "skipped_existing": skipped_existing}

@router.delete("/{project_id}/keywords/{keyword_id}")
def delete_keyword(
    project_id: int,
    keyword_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.KEYWORD_NOT_FOUND)

    session.delete(keyword)
    session.commit()
    return {"ok": True}


@router.post("/{project_id}/keywords/{keyword_id}/check", response_model=KeywordRead)
def check_rank(
    project_id: int,
    keyword_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.KEYWORD_NOT_FOUND)

    project = session.get(Project, project_id)
    competitors = session.exec(select(CompetitorDomain).where(CompetitorDomain.project_id == project_id)).all()
    gl, hl = _resolve_geo_language(project, keyword)
    result = check_keyword_rank(keyword.term, project.domain, [c.domain for c in competitors], gl=gl, hl=hl)

    keyword.current_rank = result.rank
    keyword.last_checked = datetime.utcnow()

    history = RankHistory(
        keyword_id=keyword.id,
        rank=result.rank,
        url=result.url,
        gl=gl,
        hl=hl,
    )
    session.add(history)
    session.add(keyword)
    session.commit()
    session.refresh(keyword)
    return keyword


@router.post("/{project_id}/keywords/check-all", response_model=List[KeywordRead])
def check_all_ranks(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keywords = session.exec(
        select(Keyword).where(Keyword.project_id == project_id)
    ).all()

    for keyword in keywords:
        gl, hl = _resolve_geo_language(project, keyword)
        result = check_keyword_rank(keyword.term, project.domain, gl=gl, hl=hl)
        keyword.current_rank = result.rank
        keyword.last_checked = datetime.utcnow()

        history = RankHistory(
            keyword_id=keyword.id,
            rank=result.rank,
            url=result.url,
            gl=gl,
            hl=hl,
        )
        session.add(history)
        session.add(keyword)

    session.commit()
    for keyword in keywords:
        session.refresh(keyword)
    return keywords


@router.post("/{project_id}/keywords/check-all-compare", response_model=List[VisibilityHistoryRead])
def check_all_compare(
    project_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    keywords = session.exec(select(Keyword).where(Keyword.project_id == project_id)).all()
    competitors = session.exec(select(CompetitorDomain).where(CompetitorDomain.project_id == project_id)).all()
    competitor_domains = [c.domain for c in competitors]

    rows = []
    now = datetime.utcnow()
    for keyword in keywords:
        gl, hl = _resolve_geo_language(project, keyword)
        result = check_keyword_rank(keyword.term, project.domain, competitor_domains, gl=gl, hl=hl)

        keyword.current_rank = result.rank
        keyword.last_checked = now
        session.add(keyword)
        session.add(RankHistory(keyword_id=keyword.id, rank=result.rank, url=result.url, gl=gl, hl=hl, checked_at=now))

        base_row = visibility_service.create_visibility_row(
            project_id=project_id,
            keyword_id=keyword.id,
            keyword_term=keyword.term,
            source_domain=project.domain,
            rank=result.rank,
            result_type=result.result_type,
            serp_features=result.serp_features,
            competitor_positions=result.competitor_positions,
            checked_at=now,
        )
        rows.append(base_row)
        session.add(base_row)

        for domain, rank in result.competitor_positions.items():
            comp_positions = dict(result.competitor_positions)
            comp_positions[project.domain] = result.rank
            competitor_row = visibility_service.create_visibility_row(
                project_id=project_id,
                keyword_id=keyword.id,
                keyword_term=keyword.term,
                source_domain=domain,
                rank=rank,
                result_type=result.result_type,
                serp_features=result.serp_features,
                competitor_positions=comp_positions,
                checked_at=now,
            )
            rows.append(competitor_row)
            session.add(competitor_row)

    session.commit()

    return [
        VisibilityHistoryRead(
            keyword_id=r.keyword_id,
            keyword_term=r.keyword_term,
            source_domain=r.source_domain,
            rank=r.rank,
            visibility_score=r.visibility_score,
            result_type=r.result_type,
            serp_features=json.loads(r.serp_features_json),
            competitor_positions=json.loads(r.competitor_positions_json),
            checked_at=r.checked_at,
        )
        for r in rows
    ]


@router.get(
    "/{project_id}/keywords/{keyword_id}/ranking-history",
    response_model=List[RankHistoryRead],
)
@router.get(
    "/{project_id}/keywords/{keyword_id}/history",
    response_model=List[RankHistoryRead],
)
def get_rank_history(
    project_id: int,
    keyword_id: int,
    limit: int = 90,
    days: int | None = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.ADMIN)),
):
    keyword = session.get(Keyword, keyword_id)
    if not keyword or keyword.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.KEYWORD_NOT_FOUND)

    query = select(RankHistory).where(RankHistory.keyword_id == keyword_id)
    if days:
        query = query.where(RankHistory.checked_at >= datetime.utcnow() - timedelta(days=days))

    history = session.exec(
        query
        .order_by(RankHistory.checked_at.asc())
        .limit(limit)
    ).all()
    return history
