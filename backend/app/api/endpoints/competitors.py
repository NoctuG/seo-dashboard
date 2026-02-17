from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.api.deps import require_project_role
from app.core.error_codes import ErrorCode
from app.db import get_session
from app.models import CompetitorDomain, Keyword, Project, ProjectRoleType, RankHistory, User, VisibilityHistory
from app.schemas import KeywordGapResponse, KeywordGapRow, KeywordGapStats

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
