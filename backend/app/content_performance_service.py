from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, date
from typing import Dict, List, Literal, Tuple

from sqlmodel import Session, select

from app.models import Keyword, PageTrafficSnapshot, RankHistory

WindowType = Literal["7d", "30d", "90d"]
SortType = Literal["traffic", "conversion_rate", "decay"]

WINDOW_DAYS_MAP: Dict[WindowType, int] = {"7d": 7, "30d": 30, "90d": 90}
CTR_CURVE = {
    1: 0.30,
    2: 0.17,
    3: 0.11,
    4: 0.08,
    5: 0.06,
    6: 0.04,
    7: 0.03,
    8: 0.02,
    9: 0.015,
    10: 0.01,
}
DECAY_WINDOWS = 3
DECAY_DROP_THRESHOLD = -20.0


@dataclass
class UrlKeywordMetrics:
    keyword_count: int = 0
    rank_sum: float = 0.0
    rank_count: int = 0


class ContentPerformanceService:
    def get_project_content_performance(
        self,
        session: Session,
        project_id: int,
        window: WindowType = "30d",
        sort: SortType = "traffic",
    ) -> Dict[str, object]:
        window_days = WINDOW_DAYS_MAP[window]
        end_date = date.today()
        start_date = end_date - timedelta(days=window_days - 1)

        keyword_metrics = self._build_keyword_metrics(session, project_id, start_date)
        traffic_metrics = self._build_traffic_metrics(session, project_id)

        urls = set(keyword_metrics.keys()) | set(traffic_metrics.keys())
        items: List[Dict[str, object]] = []
        for url in urls:
            kw = keyword_metrics.get(url, UrlKeywordMetrics())
            current_sessions, current_conversions = self._sum_traffic_window(
                traffic_metrics.get(url, {}), start_date, end_date
            )
            conversion_rate = self._safe_rate(current_conversions, current_sessions)

            change_7d = self._window_change_pct(traffic_metrics.get(url, {}), 7, end_date)
            change_30d = self._window_change_pct(traffic_metrics.get(url, {}), 30, end_date)

            avg_rank = round(kw.rank_sum / kw.rank_count, 2) if kw.rank_count else None
            estimated_click_contribution = self._estimate_click_contribution(avg_rank, kw.keyword_count)

            decay_flag, suggested_action = self._evaluate_decay(traffic_metrics.get(url, {}), window_days, end_date, conversion_rate)

            items.append(
                {
                    "url": url,
                    "keyword_count": kw.keyword_count,
                    "avg_rank": avg_rank,
                    "estimated_click_contribution": estimated_click_contribution,
                    "sessions": current_sessions,
                    "conversions": current_conversions,
                    "conversion_rate": conversion_rate,
                    "change_7d": change_7d,
                    "change_30d": change_30d,
                    "decay_flag": decay_flag,
                    "suggested_action": suggested_action,
                }
            )

        sorted_items = self._sort_items(items, sort)
        return {
            "window": window,
            "sort": sort,
            "items": sorted_items,
            "top_content": sorted(items, key=lambda i: i["sessions"], reverse=True)[:10],
            "top_conversion": sorted(items, key=lambda i: i["conversion_rate"], reverse=True)[:10],
            "decaying_content": [item for item in sorted(items, key=lambda i: i["change_30d"]) if item["decay_flag"]][:10],
        }

    def _build_keyword_metrics(
        self,
        session: Session,
        project_id: int,
        start_date: date,
    ) -> Dict[str, UrlKeywordMetrics]:
        keywords = session.exec(select(Keyword).where(Keyword.project_id == project_id)).all()
        keyword_map: Dict[int, Keyword] = {keyword.id: keyword for keyword in keywords if keyword.id is not None}

        metrics: Dict[str, UrlKeywordMetrics] = defaultdict(UrlKeywordMetrics)
        if not keyword_map:
            return metrics

        history = session.exec(
            select(RankHistory).where(
                RankHistory.keyword_id.in_(list(keyword_map.keys())),
                RankHistory.checked_at >= datetime.combine(start_date, datetime.min.time()),
            )
        ).all()

        for entry in history:
            keyword = keyword_map.get(entry.keyword_id)
            if not keyword:
                continue
            target_url = entry.url or keyword.target_url
            if not target_url:
                continue

            bucket = metrics[target_url]
            if entry.rank is not None:
                bucket.rank_sum += entry.rank
                bucket.rank_count += 1

        keyword_count_per_url = defaultdict(set)
        for keyword in keywords:
            if keyword.target_url:
                keyword_count_per_url[keyword.target_url].add(keyword.id)
        for url, keyword_ids in keyword_count_per_url.items():
            metrics[url].keyword_count = len(keyword_ids)

        return metrics

    def _build_traffic_metrics(self, session: Session, project_id: int) -> Dict[str, Dict[date, Tuple[int, int]]]:
        snapshots = session.exec(
            select(PageTrafficSnapshot).where(PageTrafficSnapshot.project_id == project_id)
        ).all()

        traffic: Dict[str, Dict[date, Tuple[int, int]]] = defaultdict(dict)
        for snap in snapshots:
            traffic[snap.url][snap.date] = (snap.sessions, snap.conversions)
        return traffic

    def _sum_traffic_window(
        self,
        daily: Dict[date, Tuple[int, int]],
        start_date: date,
        end_date: date,
    ) -> Tuple[int, int]:
        sessions = 0
        conversions = 0
        current = start_date
        while current <= end_date:
            day_sessions, day_conversions = daily.get(current, (0, 0))
            sessions += day_sessions
            conversions += day_conversions
            current += timedelta(days=1)
        return sessions, conversions

    def _window_change_pct(self, daily: Dict[date, Tuple[int, int]], days: int, end_date: date) -> float:
        current_start = end_date - timedelta(days=days - 1)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=days - 1)

        current_sessions, _ = self._sum_traffic_window(daily, current_start, end_date)
        previous_sessions, _ = self._sum_traffic_window(daily, previous_start, previous_end)

        if previous_sessions == 0:
            if current_sessions == 0:
                return 0.0
            return 100.0
        return round(((current_sessions - previous_sessions) / previous_sessions) * 100, 2)

    def _safe_rate(self, numerator: int, denominator: int) -> float:
        if denominator <= 0:
            return 0.0
        return round((numerator / denominator) * 100, 2)

    def _estimate_click_contribution(self, avg_rank: float | None, keyword_count: int) -> float:
        if avg_rank is None or keyword_count <= 0:
            return 0.0
        normalized_rank = max(1, min(10, int(round(avg_rank))))
        return round(CTR_CURVE.get(normalized_rank, 0.005) * keyword_count * 100, 2)

    def _evaluate_decay(
        self,
        daily: Dict[date, Tuple[int, int]],
        window_days: int,
        end_date: date,
        conversion_rate: float,
    ) -> Tuple[bool, str | None]:
        window_totals: List[int] = []
        for index in range(DECAY_WINDOWS + 1):
            win_end = end_date - timedelta(days=index * window_days)
            win_start = win_end - timedelta(days=window_days - 1)
            sessions, _ = self._sum_traffic_window(daily, win_start, win_end)
            window_totals.append(sessions)

        consecutive_decline = all(
            window_totals[i] < window_totals[i + 1]
            for i in range(len(window_totals) - 1)
        )
        yoy_drop = self._window_change_pct(daily, window_days, end_date) <= DECAY_DROP_THRESHOLD

        decay_flag = consecutive_decline or yoy_drop
        if not decay_flag:
            return False, None

        if conversion_rate < 1.0:
            return True, "Refresh content intent alignment and test stronger CTAs"
        return True, "Update content freshness and strengthen internal linking"

    def _sort_items(self, items: List[Dict[str, object]], sort: SortType) -> List[Dict[str, object]]:
        if sort == "conversion_rate":
            return sorted(items, key=lambda i: i["conversion_rate"], reverse=True)
        if sort == "decay":
            return sorted(
                items,
                key=lambda i: (not i["decay_flag"], i["change_30d"]),
            )
        return sorted(items, key=lambda i: i["sessions"], reverse=True)


content_performance_service = ContentPerformanceService()
