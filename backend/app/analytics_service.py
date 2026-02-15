from __future__ import annotations

from datetime import date, datetime, timedelta
import json
import random
import re
from typing import Any, Dict, List, Optional

import requests

from app.config import settings
from app.runtime_settings import get_runtime_settings


class AnalyticsService:
    def get_project_analytics(
        self,
        project_id: int,
        domain: str,
        brand_keywords_json: str = "[]",
        brand_regex: Optional[str] = None,
        cost_config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        runtime = get_runtime_settings()
        provider = (runtime.analytics_provider or "sample").lower()
        rules = self._build_brand_rules(brand_keywords_json, brand_regex)
        if provider == "matomo":
            try:
                data = self._get_matomo_analytics(project_id, rules)
            except Exception as exc:  # pragma: no cover - graceful fallback
                data = self._build_sample_analytics(project_id, domain, rules)
                data["notes"].append(f"Matomo fetch failed, using sample data: {exc}")
            return self._attach_roi_metrics(data, cost_config)

        if provider == "ga4":
            try:
                data = self._get_ga4_analytics(project_id, rules)
            except Exception as exc:  # pragma: no cover - graceful fallback
                data = self._build_sample_analytics(project_id, domain, rules)
                data["notes"].append(f"GA4 fetch failed, using sample data: {exc}")
            return self._attach_roi_metrics(data, cost_config)

        return self._attach_roi_metrics(self._build_sample_analytics(project_id, domain, rules), cost_config)

    def _get_matomo_analytics(self, project_id: int, brand_rules: Dict[str, Any]) -> Dict[str, Any]:
        runtime = get_runtime_settings()
        if not runtime.matomo_base_url or not runtime.matomo_site_id or not runtime.matomo_token_auth:
            raise ValueError("MATOMO_BASE_URL, MATOMO_SITE_ID and MATOMO_TOKEN_AUTH are required")

        params = {
            "module": "API",
            "method": "API.getBulkRequest",
            "format": "JSON",
            "token_auth": runtime.matomo_token_auth,
            "urls[0]": "method=VisitsSummary.get&idSite={site}&period=day&date=last30".format(site=runtime.matomo_site_id),
            "urls[1]": "method=UserCountry.getCountry&idSite={site}&period=month&date=today".format(site=runtime.matomo_site_id),
            "urls[2]": "method=DevicesDetection.getType&idSite={site}&period=month&date=today".format(site=runtime.matomo_site_id),
            "urls[3]": "method=Actions.getPageUrls&idSite={site}&period=day&date=last30".format(site=runtime.matomo_site_id),
        }
        response = requests.get(runtime.matomo_base_url.rstrip("/") + "/", params=params, timeout=20)
        response.raise_for_status()
        data = response.json()

        daily_raw = data[0] if len(data) > 0 and isinstance(data[0], dict) else {}
        daily_sessions = [{"date": d, "sessions": int(v.get("nb_visits", 0))} for d, v in sorted(daily_raw.items())]
        month_sessions = sum(day["sessions"] for day in daily_sessions)

        countries = data[1] if len(data) > 1 and isinstance(data[1], list) else []
        devices = data[2] if len(data) > 2 and isinstance(data[2], list) else []
        assets_by_day = data[3] if len(data) > 3 and isinstance(data[3], dict) else {}

        asset_map: Dict[str, Dict[str, float]] = {}
        daily_brand_segments = []
        raw_revenue = 0.0
        for day, rows in sorted(assets_by_day.items()):
            day_brand_sessions = 0
            day_non_brand_sessions = 0
            day_brand_conversions = 0
            day_non_brand_conversions = 0
            for row in rows if isinstance(rows, list) else []:
                page = row.get("label", "/")
                sessions = int(row.get("nb_visits", 0))
                conversions = float(row.get("goal_nb_conversions", 0))
                matomo_revenue = float(row.get("goal_revenue", row.get("revenue", 0)) or 0)
                raw_revenue += matomo_revenue
                asset = asset_map.setdefault(page, {"sessions": 0.0, "conversions": 0.0})
                asset["sessions"] += sessions
                asset["conversions"] += conversions
                if self._is_brand(page, brand_rules):
                    day_brand_sessions += sessions
                    day_brand_conversions += int(conversions)
                else:
                    day_non_brand_sessions += sessions
                    day_non_brand_conversions += int(conversions)

            daily_brand_segments.append(
                {
                    "date": day,
                    "brand_sessions": day_brand_sessions,
                    "non_brand_sessions": day_non_brand_sessions,
                    "brand_conversions": day_brand_conversions,
                    "non_brand_conversions": day_non_brand_conversions,
                }
            )

        top_assets = sorted(asset_map.items(), key=lambda x: x[1]["sessions"], reverse=True)[:5]

        bounce_rate = 0.0
        if daily_sessions:
            bounce_values = []
            for item in daily_raw.values():
                raw = item.get("bounce_rate")
                if isinstance(raw, (int, float)):
                    bounce_values.append(float(raw))
                if isinstance(raw, str):
                    bounce_values.append(float(raw.strip("%")))
            bounce_rate = round(sum(bounce_values) / len(bounce_values), 2) if bounce_values else 0.0

        conversions = int(sum(v["conversions"] for v in asset_map.values()))
        assisted_conversions = round(conversions * 0.35, 2)
        revenue, pipeline_value = self._normalize_provider_value(
            provider="matomo",
            raw_revenue=raw_revenue,
            conversions=conversions,
            assisted_conversions=assisted_conversions,
        )

        notes = [
            "Matomo provider does not expose engaged_sessions/avg_engagement_time/pages_per_session/key_events in this integration; returning null.",
        ]
        return {
            "provider": "matomo",
            "source": "live",
            "period": self._build_period(month_sessions, month_sessions),
            "totals": {
                "sessions": month_sessions,
                "bounce_rate": bounce_rate,
                "conversions": conversions,
                "assisted_conversions": assisted_conversions,
                "revenue": revenue,
                "pipeline_value": pipeline_value,
                "roi": None,
            },
            "quality_metrics": {
                "engaged_sessions": None,
                "avg_engagement_time": None,
                "pages_per_session": None,
                "key_events": None,
            },
            "brand_rules": brand_rules,
            "brand_split": self._aggregate_brand_split(daily_brand_segments),
            "daily_brand_segments": daily_brand_segments,
            "audience": {
                "top_countries": [
                    {
                        "country": item.get("label", "Unknown"),
                        "sessions": int(item.get("nb_visits", 0)),
                    }
                    for item in countries[:5]
                ],
                "devices": [
                    {
                        "device": item.get("label", "Unknown"),
                        "sessions": int(item.get("nb_visits", 0)),
                    }
                    for item in devices[:5]
                ],
            },
            "top_assets": [
                {
                    "path": path,
                    "sessions": int(values["sessions"]),
                    "conversions": int(values["conversions"]),
                    "conversion_rate": round((values["conversions"] / values["sessions"]) * 100, 2) if values["sessions"] else 0,
                }
                for path, values in top_assets
            ],
            "daily_sessions": daily_sessions,
            "notes": notes,
        }

    def _get_ga4_analytics(self, project_id: int, brand_rules: Dict[str, Any]) -> Dict[str, Any]:
        runtime = get_runtime_settings()
        if not runtime.ga4_property_id or not runtime.ga4_access_token:
            raise ValueError("GA4_PROPERTY_ID and GA4_ACCESS_TOKEN are required")

        endpoint = f"https://analyticsdata.googleapis.com/v1beta/properties/{runtime.ga4_property_id}:runReport"
        body = {
            "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
            "metrics": [
                {"name": "sessions"},
                {"name": "bounceRate"},
                {"name": "conversions"},
                {"name": "engagedSessions"},
                {"name": "userEngagementDuration"},
                {"name": "screenPageViews"},
                {"name": "keyEvents"},
                {"name": "totalRevenue"},
            ],
            "dimensions": [{"name": "date"}, {"name": "country"}, {"name": "deviceCategory"}, {"name": "landingPagePlusQueryString"}],
            "limit": 10000,
        }
        headers = {"Authorization": f"Bearer {runtime.ga4_access_token}"}
        response = requests.post(endpoint, json=body, headers=headers, timeout=20)
        response.raise_for_status()
        payload = response.json()

        rows = payload.get("rows", [])
        daily_map: Dict[str, int] = {}
        country_map: Dict[str, int] = {}
        device_map: Dict[str, int] = {}
        asset_map: Dict[str, Dict[str, float]] = {}
        daily_brand_map: Dict[str, Dict[str, float]] = {}
        bounce_values = []

        total_engaged_sessions = 0
        total_engagement_duration = 0.0
        total_screen_page_views = 0.0
        total_key_events = 0.0
        raw_revenue = 0.0

        for row in rows:
            dims = [d.get("value", "") for d in row.get("dimensionValues", [])]
            mets = [m.get("value", "0") for m in row.get("metricValues", [])]
            if len(dims) < 4 or len(mets) < 8:
                continue
            raw_date, country, device, page = dims
            day = datetime.strptime(raw_date, "%Y%m%d").date().isoformat()
            sessions = int(float(mets[0] or 0))
            bounce = float(mets[1] or 0) * 100
            conversions = float(mets[2] or 0)
            engaged_sessions = int(float(mets[3] or 0))
            engagement_duration = float(mets[4] or 0)
            screen_page_views = float(mets[5] or 0)
            key_events = float(mets[6] or 0)
            revenue = float(mets[7] or 0)

            daily_map[day] = daily_map.get(day, 0) + sessions
            country_map[country or "Unknown"] = country_map.get(country or "Unknown", 0) + sessions
            device_map[device or "Unknown"] = device_map.get(device or "Unknown", 0) + sessions
            bounce_values.append(bounce)

            total_engaged_sessions += engaged_sessions
            total_engagement_duration += engagement_duration
            total_screen_page_views += screen_page_views
            total_key_events += key_events
            raw_revenue += revenue

            asset = asset_map.setdefault(page or "/", {"sessions": 0.0, "conversions": 0.0})
            asset["sessions"] += sessions
            asset["conversions"] += conversions

            brand_bucket = daily_brand_map.setdefault(
                day,
                {
                    "brand_sessions": 0.0,
                    "non_brand_sessions": 0.0,
                    "brand_conversions": 0.0,
                    "non_brand_conversions": 0.0,
                },
            )
            if self._is_brand(page, brand_rules):
                brand_bucket["brand_sessions"] += sessions
                brand_bucket["brand_conversions"] += conversions
            else:
                brand_bucket["non_brand_sessions"] += sessions
                brand_bucket["non_brand_conversions"] += conversions

        month_sessions = sum(daily_map.values())
        top_assets = sorted(asset_map.items(), key=lambda x: x[1]["sessions"], reverse=True)[:5]
        daily_brand_segments = [{"date": day, **{k: int(v) for k, v in vals.items()}} for day, vals in sorted(daily_brand_map.items())]

        conversions = int(sum(v["conversions"] for v in asset_map.values()))
        assisted_conversions = round(total_key_events * 0.25, 2)
        revenue, pipeline_value = self._normalize_provider_value(
            provider="ga4",
            raw_revenue=raw_revenue,
            conversions=conversions,
            assisted_conversions=assisted_conversions,
        )

        return {
            "provider": "ga4",
            "source": "live",
            "period": self._build_period(month_sessions, month_sessions),
            "totals": {
                "sessions": month_sessions,
                "bounce_rate": round(sum(bounce_values) / len(bounce_values), 2) if bounce_values else 0,
                "conversions": conversions,
                "assisted_conversions": assisted_conversions,
                "revenue": revenue,
                "pipeline_value": pipeline_value,
                "roi": None,
            },
            "quality_metrics": {
                "engaged_sessions": total_engaged_sessions,
                "avg_engagement_time": round(total_engagement_duration / month_sessions, 2) if month_sessions else None,
                "pages_per_session": round(total_screen_page_views / month_sessions, 2) if month_sessions else None,
                "key_events": int(total_key_events),
            },
            "brand_rules": brand_rules,
            "brand_split": self._aggregate_brand_split(daily_brand_segments),
            "daily_brand_segments": daily_brand_segments,
            "audience": {
                "top_countries": [
                    {"country": k, "sessions": v}
                    for k, v in sorted(country_map.items(), key=lambda x: x[1], reverse=True)[:5]
                ],
                "devices": [
                    {"device": k, "sessions": v}
                    for k, v in sorted(device_map.items(), key=lambda x: x[1], reverse=True)[:5]
                ],
            },
            "top_assets": [
                {
                    "path": path,
                    "sessions": int(values["sessions"]),
                    "conversions": int(values["conversions"]),
                    "conversion_rate": round((values["conversions"] / values["sessions"]) * 100, 2)
                    if values["sessions"]
                    else 0,
                }
                for path, values in top_assets
            ],
            "daily_sessions": [
                {"date": k, "sessions": v} for k, v in sorted(daily_map.items(), key=lambda x: x[0])
            ],
            "notes": [],
        }

    def _build_sample_analytics(self, project_id: int, domain: str, brand_rules: Dict[str, Any]) -> Dict[str, Any]:
        rng = random.Random(project_id)
        today = date.today()
        daily_sessions = []
        daily_brand_segments = []
        baseline = rng.randint(120, 240)

        for i in range(29, -1, -1):
            day = today - timedelta(days=i)
            trend_boost = int((29 - i) * rng.uniform(0.6, 1.8))
            jitter = rng.randint(-25, 40)
            sessions = max(20, baseline + trend_boost + jitter)
            daily_sessions.append({"date": day.isoformat(), "sessions": sessions})

            brand_sessions = int(sessions * rng.uniform(0.2, 0.45))
            non_brand_sessions = sessions - brand_sessions
            daily_brand_segments.append(
                {
                    "date": day.isoformat(),
                    "brand_sessions": brand_sessions,
                    "non_brand_sessions": non_brand_sessions,
                    "brand_conversions": int(brand_sessions * rng.uniform(0.03, 0.08)),
                    "non_brand_conversions": int(non_brand_sessions * rng.uniform(0.01, 0.05)),
                }
            )

        current_month = sum(item["sessions"] for item in daily_sessions)
        previous_month = int(current_month * rng.uniform(0.78, 0.98))
        conversions = sum(item["brand_conversions"] + item["non_brand_conversions"] for item in daily_brand_segments)
        assisted_conversions = round(conversions * 0.42, 2)
        revenue, pipeline_value = self._normalize_provider_value(
            provider="sample",
            raw_revenue=0,
            conversions=conversions,
            assisted_conversions=assisted_conversions,
        )

        pages = ["/", "/pricing", "/blog/technical-seo-checklist", "/blog/core-web-vitals-guide", "/contact"]
        top_assets = []
        remaining_sessions = current_month
        remaining_conversions = conversions
        for idx, path in enumerate(pages):
            if idx == len(pages) - 1:
                asset_sessions = max(30, remaining_sessions)
                asset_conversions = max(1, remaining_conversions)
            else:
                asset_sessions = max(40, int(current_month * rng.uniform(0.08, 0.26)))
                asset_conversions = max(1, int(asset_sessions * rng.uniform(0.01, 0.09)))
                remaining_sessions -= asset_sessions
                remaining_conversions -= asset_conversions
            top_assets.append(
                {
                    "path": path,
                    "sessions": asset_sessions,
                    "conversions": asset_conversions,
                    "conversion_rate": round((asset_conversions / asset_sessions) * 100, 2),
                    "ab_test_variant": "A" if idx % 2 == 0 else "B",
                }
            )

        top_countries = [
            {"country": "United States", "sessions": int(current_month * 0.32)},
            {"country": "China", "sessions": int(current_month * 0.21)},
            {"country": "Germany", "sessions": int(current_month * 0.13)},
            {"country": "United Kingdom", "sessions": int(current_month * 0.11)},
            {"country": "Canada", "sessions": int(current_month * 0.08)},
        ]
        devices = [
            {"device": "mobile", "sessions": int(current_month * 0.58)},
            {"device": "desktop", "sessions": int(current_month * 0.36)},
            {"device": "tablet", "sessions": int(current_month * 0.06)},
        ]

        return {
            "provider": "sample",
            "source": "sample",
            "domain": domain,
            "period": self._build_period(current_month, previous_month),
            "totals": {
                "sessions": current_month,
                "bounce_rate": round(rng.uniform(28, 52), 2),
                "conversions": conversions,
                "assisted_conversions": assisted_conversions,
                "revenue": revenue,
                "pipeline_value": pipeline_value,
                "roi": None,
            },
            "quality_metrics": {
                "engaged_sessions": int(current_month * rng.uniform(0.45, 0.75)),
                "avg_engagement_time": round(rng.uniform(42, 110), 2),
                "pages_per_session": round(rng.uniform(1.4, 3.8), 2),
                "key_events": int(conversions * rng.uniform(1.2, 2.4)),
            },
            "brand_rules": brand_rules,
            "brand_split": self._aggregate_brand_split(daily_brand_segments),
            "daily_brand_segments": daily_brand_segments,
            "audience": {
                "top_countries": top_countries,
                "devices": devices,
            },
            "top_assets": top_assets,
            "daily_sessions": daily_sessions,
            "notes": ["Analytics provider is not configured. Showing realistic sample data."],
        }

    def _normalize_provider_value(
        self,
        provider: str,
        raw_revenue: float,
        conversions: float,
        assisted_conversions: float,
    ) -> tuple[float, float]:
        if raw_revenue > 0:
            revenue = raw_revenue
        elif provider == "ga4":
            revenue = conversions * 220
        elif provider == "matomo":
            revenue = conversions * 200
        else:
            revenue = conversions * 180
        pipeline_value = revenue + assisted_conversions * 120
        return round(revenue, 2), round(pipeline_value, 2)

    def _attach_roi_metrics(self, payload: Dict[str, Any], cost_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        monthly_cost = self._monthly_cost(cost_config)
        pipeline_value = float(payload.get("totals", {}).get("pipeline_value", 0) or 0)
        roi = ((pipeline_value - monthly_cost) / monthly_cost) if monthly_cost > 0 else None
        payload["totals"]["roi"] = round(roi, 4) if roi is not None else None
        return payload

    def _monthly_cost(self, cost_config: Optional[Dict[str, Any]]) -> float:
        if not cost_config:
            return 0
        return round(
            float(cost_config.get("monthly_human_cost", 0) or 0)
            + float(cost_config.get("monthly_tool_cost", 0) or 0)
            + float(cost_config.get("monthly_outsourcing_cost", 0) or 0)
            + float(cost_config.get("monthly_content_cost", 0) or 0),
            2,
        )

    def _aggregate_brand_split(self, segments: List[Dict[str, Any]]) -> Dict[str, Dict[str, int]]:
        brand_sessions = sum(int(item.get("brand_sessions", 0)) for item in segments)
        non_brand_sessions = sum(int(item.get("non_brand_sessions", 0)) for item in segments)
        brand_conversions = sum(int(item.get("brand_conversions", 0)) for item in segments)
        non_brand_conversions = sum(int(item.get("non_brand_conversions", 0)) for item in segments)
        return {
            "brand": {"sessions": brand_sessions, "conversions": brand_conversions},
            "non_brand": {"sessions": non_brand_sessions, "conversions": non_brand_conversions},
        }

    def _build_brand_rules(self, brand_keywords_json: str, brand_regex: Optional[str]) -> Dict[str, Any]:
        try:
            keywords = json.loads(brand_keywords_json or "[]")
            if not isinstance(keywords, list):
                keywords = []
        except json.JSONDecodeError:
            keywords = []

        return {
            "keywords": [str(keyword).lower() for keyword in keywords if isinstance(keyword, str) and keyword.strip()],
            "regex": brand_regex or None,
        }

    def _is_brand(self, text: str, rules: Dict[str, Any]) -> bool:
        lowered = (text or "").lower()
        for keyword in rules.get("keywords", []):
            if keyword in lowered:
                return True

        pattern = rules.get("regex")
        if pattern:
            try:
                return re.search(pattern, text or "", flags=re.IGNORECASE) is not None
            except re.error:
                return False

        return False

    def _build_period(self, monthly_total: int, previous_month_total: int) -> Dict[str, Any]:
        growth_pct = ((monthly_total - previous_month_total) / previous_month_total * 100) if previous_month_total else 0
        return {
            "daily_average": round(monthly_total / 30, 2),
            "monthly_total": monthly_total,
            "previous_month_total": previous_month_total,
            "growth_pct": round(growth_pct, 2),
            "meaningful_growth": growth_pct >= settings.ANALYTICS_MEANINGFUL_GROWTH_PCT,
        }


analytics_service = AnalyticsService()
