from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from app.api.deps import require_project_role
from app.backlink_gap_service import BacklinkGapDomainRow, backlink_gap_service
from app.config import settings
from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import CompetitorDomain, Keyword, Project, ProjectRoleType, RankHistory, User, VisibilityHistory
from app.schemas import (
    BacklinkGapResponse,
    BacklinkGapRow,
    BacklinkGapStats,
    KeywordGapResponse,
    KeywordGapRow,
    KeywordGapStats,
)

router = APIRouter()


@dataclass
class _GapComputation:
    common: list[KeywordGapRow]
    gap: list[KeywordGapRow]
    unique: list[KeywordGapRow]


def _normalize_term(term: str) -> str:
    return term.strip().lower()


def _resolve_competitor_ids(primary_competitor_id: int, competitor_ids: Optional[List[int]]) -> list[int]:
    merged = [primary_competitor_id, *(competitor_ids or [])]
    deduped: list[int] = []
    for competitor_id in merged:
        if competitor_id in deduped:
            continue
        deduped.append(competitor_id)
    return deduped[:3]


def _compute_keyword_gap(
    keyword_terms: list[str],
    my_ranks: Dict[str, Optional[int]],
    competitor_ranks: list[Dict[str, Optional[int]]],
) -> _GapComputation:
    rows: list[KeywordGapRow] = []
    seen_terms: set[str] = set()

    for raw_term in keyword_terms:
        normalized = _normalize_term(raw_term)
        if not normalized or normalized in seen_terms:
            continue
        seen_terms.add(normalized)

        my_rank = my_ranks.get(normalized)
        competitor_values = [rank_map.get(normalized) for rank_map in competitor_ranks]

        row = KeywordGapRow(
            keyword=raw_term.strip(),
            search_volume=None,
            my_rank=my_rank,
            competitor_a_rank=competitor_values[0] if len(competitor_values) > 0 else None,
            competitor_b_rank=competitor_values[1] if len(competitor_values) > 1 else None,
            competitor_c_rank=competitor_values[2] if len(competitor_values) > 2 else None,
            difficulty=None,
            opportunity_score=0.0,
        )
        rows.append(row)

    common: list[KeywordGapRow] = []
    gap: list[KeywordGapRow] = []
    unique: list[KeywordGapRow] = []

    for row in rows:
        competitor_has_rank = any(
            rank is not None
            for rank in (row.competitor_a_rank, row.competitor_b_rank, row.competitor_c_rank)
        )
        if row.my_rank is not None and competitor_has_rank:
            common.append(row)
        elif row.my_rank is None and competitor_has_rank:
            gap.append(row)
        elif row.my_rank is not None and not competitor_has_rank:
            unique.append(row)

    return _GapComputation(common=common, gap=gap, unique=unique)


@router.get("/{project_id}/competitors/{competitor_id}/keyword-gap", response_model=KeywordGapResponse)
def get_keyword_gap(
    project_id: int,
    competitor_id: int,
    competitor_ids: Optional[List[int]] = Query(default=None),
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    selected_competitor_ids = _resolve_competitor_ids(competitor_id, competitor_ids)
    if not selected_competitor_ids:
        raise HTTPException(status_code=400, detail="at least one competitor is required")

    competitors = session.exec(
        select(CompetitorDomain).where(
            CompetitorDomain.project_id == project_id,
            CompetitorDomain.id.in_(selected_competitor_ids),
        )
    ).all()
    if len(competitors) != len(selected_competitor_ids):
        raise HTTPException(status_code=404, detail=ErrorCode.COMPETITOR_NOT_FOUND)

    competitor_by_id = {competitor.id: competitor for competitor in competitors}
    ordered_competitors = [competitor_by_id[cid] for cid in selected_competitor_ids]
    competitor_domains = [competitor.domain for competitor in ordered_competitors]

    keywords = session.exec(select(Keyword).where(Keyword.project_id == project_id)).all()

    keyword_terms: list[str] = [keyword.term for keyword in keywords]
    my_ranks: dict[str, Optional[int]] = {}

    for keyword in keywords:
        normalized = _normalize_term(keyword.term)
        if not normalized:
            continue
        if normalized not in my_ranks:
            my_ranks[normalized] = keyword.current_rank

    histories = session.exec(
        select(RankHistory, Keyword)
        .join(Keyword, Keyword.id == RankHistory.keyword_id)
        .where(Keyword.project_id == project_id)
        .order_by(RankHistory.checked_at.desc())
    ).all()
    for history, keyword in histories:
        normalized = _normalize_term(keyword.term)
        if normalized in my_ranks and my_ranks[normalized] is not None:
            continue
        my_ranks[normalized] = history.rank

    tracked_domains = [project.domain, *competitor_domains]
    visibility_rows = session.exec(
        select(VisibilityHistory)
        .where(
            VisibilityHistory.project_id == project_id,
            VisibilityHistory.source_domain.in_(tracked_domains),
        )
        .order_by(VisibilityHistory.checked_at.desc())
    ).all()

    latest_domain_term_rank: dict[tuple[str, str], Optional[int]] = {}
    for row in visibility_rows:
        normalized = _normalize_term(row.keyword_term)
        if not normalized:
            continue
        key = (row.source_domain, normalized)
        if key in latest_domain_term_rank:
            continue
        latest_domain_term_rank[key] = row.rank
        keyword_terms.append(row.keyword_term)

    for term in list(my_ranks.keys()):
        project_key = (project.domain, term)
        if project_key in latest_domain_term_rank:
            my_ranks[term] = latest_domain_term_rank[project_key]

    competitor_rank_maps: list[dict[str, Optional[int]]] = []
    for domain in competitor_domains:
        rank_map: dict[str, Optional[int]] = {}
        for (row_domain, term), rank in latest_domain_term_rank.items():
            if row_domain != domain:
                continue
            rank_map[term] = rank
        competitor_rank_maps.append(rank_map)

    computed = _compute_keyword_gap(keyword_terms, my_ranks, competitor_rank_maps)

    return KeywordGapResponse(
        project_id=project_id,
        competitor_ids=selected_competitor_ids,
        competitor_domains=competitor_domains,
        data_source="keyword+rank_history+visibility_history",
        stats=KeywordGapStats(
            common=len(computed.common),
            gap=len(computed.gap),
            unique=len(computed.unique),
        ),
        common=computed.common,
        gap=computed.gap,
        unique=computed.unique,
    )


def _sort_backlink_rows(
    rows: list[BacklinkGapDomainRow],
    sort_by: Literal["da", "first_seen_at"],
    sort_order: Literal["asc", "desc"],
) -> list[BacklinkGapDomainRow]:
    populated: list[BacklinkGapDomainRow]
    missing: list[BacklinkGapDomainRow]

    if sort_by == "da":
        populated = [row for row in rows if row.da is not None]
        missing = [row for row in rows if row.da is None]
        populated = sorted(populated, key=lambda row: row.da or 0, reverse=sort_order == "desc")
        return [*populated, *missing]

    populated = [row for row in rows if row.first_seen_at is not None]
    missing = [row for row in rows if row.first_seen_at is None]
    populated = sorted(
        populated,
        key=lambda row: row.first_seen_at or datetime.min,
        reverse=sort_order == "desc",
    )
    return [*populated, *missing]


def _to_response_rows(rows: list[BacklinkGapDomainRow]) -> list[BacklinkGapRow]:
    return [
        BacklinkGapRow(
            referring_domain=row.referring_domain,
            da=row.da,
            link_type=row.link_type,
            anchor_text=row.anchor_text,
            target_url=row.target_url,
            first_seen_at=row.first_seen_at,
        )
        for row in rows
    ]


def _render_backlink_gap_csv(rows: list[BacklinkGapDomainRow]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["referring_domain", "da", "link_type", "anchor_text", "target_url", "first_seen_at"])
    for row in rows:
        writer.writerow(
            [
                row.referring_domain,
                row.da if row.da is not None else "",
                row.link_type or "",
                row.anchor_text or "",
                row.target_url or "",
                row.first_seen_at.isoformat() if row.first_seen_at else "",
            ]
        )
    return buffer.getvalue()


@router.get("/{project_id}/competitors/{competitor_id}/backlink-gap", response_model=BacklinkGapResponse)
def get_backlink_gap(
    project_id: int,
    competitor_id: int,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: Literal["da", "first_seen_at"] = Query(default="da"),
    sort_order: Literal["asc", "desc"] = Query(default="desc"),
    export: Optional[Literal["csv"]] = Query(default=None),
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    competitor = session.get(CompetitorDomain, competitor_id)
    if not competitor or competitor.project_id != project_id:
        raise HTTPException(status_code=404, detail=ErrorCode.COMPETITOR_NOT_FOUND)

    configured_provider = (settings.BACKLINK_PROVIDER or "ahrefs").lower()

    project_rows, provider, source = backlink_gap_service.fetch_domain_rows(
        session,
        project_id=project_id,
        domain=project.domain,
        provider=configured_provider,
        is_primary_project_domain=True,
    )
    competitor_rows, competitor_provider, competitor_source = backlink_gap_service.fetch_domain_rows(
        session,
        project_id=project_id,
        domain=competitor.domain,
        provider=configured_provider,
        is_primary_project_domain=False,
    )

    if not project_rows and competitor_rows:
        provider = competitor_provider
        source = competitor_source

    project_domains = {row.referring_domain for row in project_rows}
    competitor_domains = {row.referring_domain for row in competitor_rows}

    shared_domains = project_domains & competitor_domains
    gap_domains = competitor_domains - project_domains
    unique_domains = project_domains - competitor_domains

    selected_rows = [row for row in competitor_rows if row.referring_domain in gap_domains]
    sorted_rows = _sort_backlink_rows(selected_rows, sort_by=sort_by, sort_order=sort_order)

    if export == "csv":
        csv_payload = _render_backlink_gap_csv(sorted_rows)
        filename = f"backlink_gap_{project_id}_{competitor_id}.csv"
        return StreamingResponse(
            iter([csv_payload]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    total = len(sorted_rows)
    offset = (page - 1) * page_size
    paged_rows = sorted_rows[offset : offset + page_size]

    return BacklinkGapResponse(
        project_id=project_id,
        competitor_id=competitor_id,
        competitor_domain=competitor.domain,
        provider=provider,
        source=source,
        stats=BacklinkGapStats(
            shared_ref_domains=len(shared_domains),
            gap_ref_domains=len(gap_domains),
            unique_ref_domains=len(unique_domains),
        ),
        rows=_to_response_rows(paged_rows),
        total=total,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
    )
