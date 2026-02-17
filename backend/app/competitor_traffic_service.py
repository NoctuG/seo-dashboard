from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
import json
import logging
import time

import requests
from sqlmodel import Session, select

from app.config import settings
from app.models import CompetitorDomain, Keyword, Project, VisibilityHistory
from app.schemas import (
    CompetitorTrafficOverviewResponse,
    TrafficOverviewTopKeyword,
    TrafficOverviewTopPage,
    TrafficOverviewTrendPoint,
)

logger = logging.getLogger(__name__)


@dataclass
class _LocalOverviewPayload:
    monthly_trend: list[TrafficOverviewTrendPoint]
    top_pages: list[TrafficOverviewTopPage]
    top_keywords: list[TrafficOverviewTopKeyword]


class CompetitorTrafficService:
    def get_overview(
        self,
        session: Session,
        *,
        project: Project,
        competitor: CompetitorDomain,
    ) -> CompetitorTrafficOverviewResponse:
        notes: list[str] = []

        similarweb_payload = self._fetch_similarweb_payload(project=project, competitor=competitor, notes=notes)
        if similarweb_payload is not None:
            similarweb_payload.notes = notes
            return similarweb_payload

        external_payload = self._fetch_external_payload(project=project, competitor=competitor, notes=notes)
        if external_payload is not None:
            external_payload.notes = notes
            return external_payload

        local_payload = self._build_local_payload(session=session, project=project, competitor=competitor)
        return CompetitorTrafficOverviewResponse(
            project_id=project.id,
            competitor_id=competitor.id,
            data_source="local_estimation",
            monthly_trend=local_payload.monthly_trend,
            top_pages=local_payload.top_pages,
            top_keywords=local_payload.top_keywords,
            notes=notes,
        )

    def _fetch_similarweb_payload(
        self,
        *,
        project: Project,
        competitor: CompetitorDomain,
        notes: list[str],
    ) -> CompetitorTrafficOverviewResponse | None:
        api_key = (settings.SIMILARWEB_API_KEY or "").strip()
        base_url = (settings.SIMILARWEB_BASE_URL or "").rstrip("/")
        if not api_key or not base_url:
            return None

        endpoint = f"{base_url}/v1/website/{competitor.domain}/traffic-and-engagement/overview"
        max_retries = max(0, settings.SIMILARWEB_MAX_RETRIES)

        for attempt in range(max_retries + 1):
            try:
                response = requests.get(
                    endpoint,
                    params={
                        "api_key": api_key,
                        "start_date": self._date_months_ago(11),
                        "end_date": self._date_months_ago(0),
                        "main_domain_only": "false",
                        "granularity": "monthly",
                        "format": "json",
                    },
                    timeout=max(1, settings.SIMILARWEB_TIMEOUT_SECONDS),
                )
            except requests.RequestException as exc:
                note = f"similarweb_request_error: {exc}"
                logger.warning("SimilarWeb request failed for %s: %s", competitor.domain, exc)
                notes.append(note)
                return None

            if response.status_code >= 400:
                classified_note = self._classify_http_error(
                    provider="similarweb",
                    status_code=response.status_code,
                    body=response.text,
                )
                notes.append(classified_note)
                if response.status_code == 429 and attempt < max_retries:
                    time.sleep(max(0.0, settings.SIMILARWEB_RETRY_BACKOFF_SECONDS) * (2**attempt))
                    continue
                return None

            try:
                payload = response.json()
            except ValueError:
                note = "similarweb_invalid_json: unable to decode response payload"
                logger.warning("SimilarWeb returned invalid JSON for %s", competitor.domain)
                notes.append(note)
                return None

            trend_data = payload.get("monthly_trend")
            if not isinstance(trend_data, list):
                trend_data = payload.get("visits")

            monthly_trend = []
            if isinstance(trend_data, list):
                for row in trend_data:
                    month = str(row.get("month") or row.get("date") or "").strip()
                    if not month:
                        continue
                    my_site = self._to_float(row.get("my_site") or row.get("project_visits") or 0)
                    competitor_visits = self._to_float(
                        row.get("competitor")
                        or row.get("competitor_visits")
                        or row.get("visits")
                        or row.get("value")
                        or 0
                    )
                    monthly_trend.append(
                        TrafficOverviewTrendPoint(
                            month=month,
                            my_site=my_site,
                            competitor=competitor_visits,
                        )
                    )

            top_pages = [
                TrafficOverviewTopPage(
                    url=str(item.get("url") or item.get("page") or "").strip(),
                    estimated_traffic=self._to_float(item.get("estimated_traffic") or item.get("visits") or 0),
                    keyword_count=int(item.get("keyword_count") or item.get("keywords") or 0),
                )
                for item in (payload.get("top_pages") or [])
                if str(item.get("url") or item.get("page") or "").strip()
            ]

            top_keywords = [
                TrafficOverviewTopKeyword(
                    keyword=str(item.get("keyword") or item.get("term") or "").strip(),
                    rank=self._to_int(item.get("rank")),
                    search_volume=max(0, self._to_int(item.get("search_volume")) or 0),
                    estimated_clicks=self._to_float(item.get("estimated_clicks") or item.get("traffic") or 0),
                )
                for item in (payload.get("top_keywords") or [])
                if str(item.get("keyword") or item.get("term") or "").strip()
            ]

            top_pages.sort(key=lambda item: item.estimated_traffic, reverse=True)
            top_keywords.sort(key=lambda item: item.estimated_clicks, reverse=True)

            return CompetitorTrafficOverviewResponse(
                project_id=project.id,
                competitor_id=competitor.id,
                data_source="similarweb",
                monthly_trend=monthly_trend,
                top_pages=top_pages[:20],
                top_keywords=top_keywords[:20],
            )

        return None

    def _fetch_external_payload(
        self,
        *,
        project: Project,
        competitor: CompetitorDomain,
        notes: list[str],
    ) -> CompetitorTrafficOverviewResponse | None:
        api_url = (settings.TRAFFIC_OVERVIEW_EXTERNAL_API_URL or "").strip()
        if not api_url:
            return None

        try:
            response = requests.get(
                api_url,
                params={
                    "project_id": project.id,
                    "project_domain": project.domain,
                    "competitor_id": competitor.id,
                    "competitor_domain": competitor.domain,
                },
                timeout=max(1, settings.TRAFFIC_OVERVIEW_EXTERNAL_API_TIMEOUT_SECONDS),
            )
        except requests.RequestException as exc:
            logger.warning("External traffic overview request failed for %s: %s", competitor.domain, exc)
            notes.append(f"external_api_request_error: {exc}")
            return None

        if response.status_code >= 400:
            notes.append(
                self._classify_http_error(
                    provider="external_api",
                    status_code=response.status_code,
                    body=response.text,
                )
            )
            return None

        try:
            payload = response.json()
        except ValueError:
            logger.warning("External traffic overview returned invalid JSON for %s", competitor.domain)
            notes.append("external_api_invalid_json: unable to decode response payload")
            return None
        monthly_trend = [TrafficOverviewTrendPoint(**item) for item in payload.get("monthly_trend", [])]
        top_pages = [TrafficOverviewTopPage(**item) for item in payload.get("top_pages", [])]
        top_keywords = [TrafficOverviewTopKeyword(**item) for item in payload.get("top_keywords", [])]
        return CompetitorTrafficOverviewResponse(
            project_id=project.id,
            competitor_id=competitor.id,
            data_source="external_api",
            monthly_trend=monthly_trend,
            top_pages=top_pages,
            top_keywords=top_keywords,
        )

    def _build_local_payload(
        self,
        session: Session,
        *,
        project: Project,
        competitor: CompetitorDomain,
    ) -> _LocalOverviewPayload:
        tracked_domains = [project.domain, competitor.domain]
        rows = session.exec(
            select(VisibilityHistory)
            .where(
                VisibilityHistory.project_id == project.id,
                VisibilityHistory.source_domain.in_(tracked_domains),
            )
            .order_by(VisibilityHistory.checked_at.desc())
        ).all()

        if not rows:
            return _LocalOverviewPayload(monthly_trend=[], top_pages=[], top_keywords=[])

        default_search_volume = max(0, settings.TRAFFIC_ESTIMATION_DEFAULT_SEARCH_VOLUME)
        search_volume_map = {
            keyword.term.strip().lower(): default_search_volume
            for keyword in session.exec(select(Keyword).where(Keyword.project_id == project.id)).all()
            if keyword.term.strip()
        }

        now = datetime.utcnow()
        months = []
        for idx in range(11, -1, -1):
            year = now.year
            month = now.month - idx
            while month <= 0:
                month += 12
                year -= 1
            months.append(f"{year:04d}-{month:02d}")

        latest_month_domain_keyword_rank: dict[tuple[str, str, str], int | None] = {}
        latest_keyword_rank: dict[str, int | None] = {}

        for row in rows:
            month_key = row.checked_at.strftime("%Y-%m")
            normalized_term = row.keyword_term.strip().lower()
            if not normalized_term:
                continue

            month_domain_keyword_key = (month_key, row.source_domain, normalized_term)
            if month_domain_keyword_key not in latest_month_domain_keyword_rank:
                latest_month_domain_keyword_rank[month_domain_keyword_key] = row.rank

            if row.source_domain == competitor.domain and normalized_term not in latest_keyword_rank:
                latest_keyword_rank[normalized_term] = row.rank

        month_domain_traffic: dict[tuple[str, str], float] = defaultdict(float)
        for (month_key, source_domain, normalized_term), rank in latest_month_domain_keyword_rank.items():
            if month_key not in months:
                continue
            search_volume = search_volume_map.get(normalized_term, default_search_volume)
            month_domain_traffic[(month_key, source_domain)] += search_volume * self._ctr_for_rank(rank)

        monthly_trend = [
            TrafficOverviewTrendPoint(
                month=month_key,
                my_site=round(month_domain_traffic.get((month_key, project.domain), 0.0), 2),
                competitor=round(month_domain_traffic.get((month_key, competitor.domain), 0.0), 2),
            )
            for month_key in months
        ]

        top_keywords = []
        for normalized_term, rank in latest_keyword_rank.items():
            search_volume = search_volume_map.get(normalized_term, default_search_volume)
            top_keywords.append(
                TrafficOverviewTopKeyword(
                    keyword=normalized_term,
                    rank=rank,
                    search_volume=search_volume,
                    estimated_clicks=round(search_volume * self._ctr_for_rank(rank), 2),
                )
            )
        top_keywords.sort(key=lambda item: item.estimated_clicks, reverse=True)

        top_pages: list[TrafficOverviewTopPage] = self._extract_top_pages_from_visibility(rows=rows, target_domain=competitor.domain)

        return _LocalOverviewPayload(
            monthly_trend=monthly_trend,
            top_pages=top_pages,
            top_keywords=top_keywords[:20],
        )

    def _extract_top_pages_from_visibility(
        self,
        *,
        rows: list[VisibilityHistory],
        target_domain: str,
    ) -> list[TrafficOverviewTopPage]:
        url_traffic: dict[str, float] = defaultdict(float)
        url_keywords: dict[str, set[str]] = defaultdict(set)

        for row in rows:
            if row.source_domain != target_domain:
                continue
            try:
                competitor_positions = json.loads(row.competitor_positions_json)
            except json.JSONDecodeError:
                continue
            raw_url = competitor_positions.get("url")
            if not isinstance(raw_url, str) or not raw_url.strip():
                continue

            normalized_keyword = row.keyword_term.strip().lower()
            ctr = self._ctr_for_rank(row.rank)
            url_traffic[raw_url] += max(0.0, settings.TRAFFIC_ESTIMATION_DEFAULT_SEARCH_VOLUME * ctr)
            if normalized_keyword:
                url_keywords[raw_url].add(normalized_keyword)

        top_pages = [
            TrafficOverviewTopPage(
                url=url,
                estimated_traffic=round(url_traffic[url], 2),
                keyword_count=len(url_keywords[url]),
            )
            for url in url_traffic
        ]
        top_pages.sort(key=lambda item: item.estimated_traffic, reverse=True)
        return top_pages[:20]

    def _ctr_for_rank(self, rank: int | None) -> float:
        if rank is None or rank <= 0:
            return 0.0

        points = self._parse_ctr_curve()
        if rank <= len(points):
            return points[rank - 1]
        return points[-1] if points else 0.0

    def _parse_ctr_curve(self) -> list[float]:
        raw_value = (settings.TRAFFIC_ESTIMATION_CTR_CURVE or "").strip()
        if not raw_value:
            return []

        values: list[float] = []
        for token in raw_value.split(","):
            cleaned = token.strip()
            if not cleaned:
                continue
            try:
                values.append(max(0.0, float(cleaned)))
            except ValueError:
                continue
        return values or [0.32, 0.17, 0.11, 0.08, 0.06, 0.05, 0.04, 0.03, 0.025, 0.02]

    def _date_months_ago(self, months_ago: int) -> str:
        now = datetime.utcnow()
        year = now.year
        month = now.month - months_ago
        while month <= 0:
            month += 12
            year -= 1
        return f"{year:04d}-{month:02d}-01"

    def _to_float(self, value: object) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _to_int(self, value: object) -> int | None:
        if value is None:
            return None
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def _classify_http_error(self, *, provider: str, status_code: int, body: str) -> str:
        body_excerpt = (body or "").strip().replace("\n", " ")[:160]
        if status_code == 401:
            logger.error("%s unauthorized (401): %s", provider, body_excerpt)
            return f"{provider}_auth_error_401: unauthorized"
        if status_code == 403:
            logger.error("%s forbidden (403): %s", provider, body_excerpt)
            return f"{provider}_auth_error_403: forbidden"
        if status_code == 429:
            logger.warning("%s rate limited (429): %s", provider, body_excerpt)
            return f"{provider}_rate_limited_429: too many requests"
        if status_code >= 500:
            logger.error("%s server error (%s): %s", provider, status_code, body_excerpt)
            return f"{provider}_server_error_{status_code}: upstream service failure"

        logger.warning("%s unexpected http status (%s): %s", provider, status_code, body_excerpt)
        return f"{provider}_http_error_{status_code}: request failed"


competitor_traffic_service = CompetitorTrafficService()
