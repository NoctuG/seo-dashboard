from __future__ import annotations

from datetime import date, datetime, timedelta
import random
from typing import Any, Dict, List

import requests

from app.config import settings


class AnalyticsService:
    def get_project_analytics(self, project_id: int, domain: str) -> Dict[str, Any]:
        provider = (settings.ANALYTICS_PROVIDER or "sample").lower()
        if provider == "matomo":
            try:
                return self._get_matomo_analytics(project_id)
            except Exception as exc:  # pragma: no cover - graceful fallback
                sample = self._build_sample_analytics(project_id, domain)
                sample["notes"].append(f"Matomo fetch failed, using sample data: {exc}")
                return sample

        if provider == "ga4":
            try:
                return self._get_ga4_analytics(project_id)
            except Exception as exc:  # pragma: no cover - graceful fallback
                sample = self._build_sample_analytics(project_id, domain)
                sample["notes"].append(f"GA4 fetch failed, using sample data: {exc}")
                return sample

        return self._build_sample_analytics(project_id, domain)

    def _get_matomo_analytics(self, project_id: int) -> Dict[str, Any]:
        if not settings.MATOMO_BASE_URL or not settings.MATOMO_SITE_ID or not settings.MATOMO_TOKEN_AUTH:
            raise ValueError("MATOMO_BASE_URL, MATOMO_SITE_ID and MATOMO_TOKEN_AUTH are required")

        params = {
            "module": "API",
            "method": "API.getBulkRequest",
            "format": "JSON",
            "token_auth": settings.MATOMO_TOKEN_AUTH,
            "urls[0]": "method=VisitsSummary.get&idSite={site}&period=day&date=last30".format(site=settings.MATOMO_SITE_ID),
            "urls[1]": "method=UserCountry.getCountry&idSite={site}&period=month&date=today".format(site=settings.MATOMO_SITE_ID),
            "urls[2]": "method=DevicesDetection.getType&idSite={site}&period=month&date=today".format(site=settings.MATOMO_SITE_ID),
            "urls[3]": "method=Actions.getPageUrls&idSite={site}&period=month&date=today".format(site=settings.MATOMO_SITE_ID),
        }
        response = requests.get(settings.MATOMO_BASE_URL.rstrip("/") + "/", params=params, timeout=20)
        response.raise_for_status()
        data = response.json()

        daily_raw = data[0] if len(data) > 0 and isinstance(data[0], dict) else {}
        daily_sessions = [{"date": d, "sessions": int(v.get("nb_visits", 0))} for d, v in sorted(daily_raw.items())]
        month_sessions = sum(day["sessions"] for day in daily_sessions)

        countries = data[1] if len(data) > 1 and isinstance(data[1], list) else []
        devices = data[2] if len(data) > 2 and isinstance(data[2], list) else []
        assets = data[3] if len(data) > 3 and isinstance(data[3], list) else []

        top_assets: List[Dict[str, Any]] = []
        for item in assets[:5]:
            sessions = int(item.get("nb_visits", 0))
            conversions = int(item.get("goal_nb_conversions", 0))
            top_assets.append(
                {
                    "path": item.get("label", "/"),
                    "sessions": sessions,
                    "conversions": conversions,
                    "conversion_rate": round((conversions / sessions) * 100, 2) if sessions else 0,
                }
            )

        bounce_rate = 0.0
        if daily_sessions:
            # Matomo per-day response includes bounce rate percentages in string for some configs.
            bounce_values = []
            for item in daily_raw.values():
                raw = item.get("bounce_rate")
                if isinstance(raw, (int, float)):
                    bounce_values.append(float(raw))
                if isinstance(raw, str):
                    bounce_values.append(float(raw.strip("%")))
            bounce_rate = round(sum(bounce_values) / len(bounce_values), 2) if bounce_values else 0.0

        return {
            "provider": "matomo",
            "source": "live",
            "period": self._build_period(month_sessions, month_sessions),
            "totals": {
                "sessions": month_sessions,
                "bounce_rate": bounce_rate,
                "conversions": sum(item["conversions"] for item in top_assets),
            },
            "audience": {
                "top_countries": [
                    {"country": item.get("label", "Unknown"), "sessions": int(item.get("nb_visits", 0))}
                    for item in countries[:5]
                ],
                "devices": [
                    {"device": item.get("label", "Unknown"), "sessions": int(item.get("nb_visits", 0))}
                    for item in devices[:5]
                ],
            },
            "top_assets": top_assets,
            "daily_sessions": daily_sessions,
            "notes": [],
        }

    def _get_ga4_analytics(self, project_id: int) -> Dict[str, Any]:
        if not settings.GA4_PROPERTY_ID or not settings.GA4_ACCESS_TOKEN:
            raise ValueError("GA4_PROPERTY_ID and GA4_ACCESS_TOKEN are required")

        endpoint = f"https://analyticsdata.googleapis.com/v1beta/properties/{settings.GA4_PROPERTY_ID}:runReport"
        body = {
            "dateRanges": [{"startDate": "30daysAgo", "endDate": "today"}],
            "metrics": [{"name": "sessions"}, {"name": "bounceRate"}, {"name": "conversions"}],
            "dimensions": [{"name": "date"}, {"name": "country"}, {"name": "deviceCategory"}, {"name": "landingPagePlusQueryString"}],
            "limit": 500,
        }
        headers = {"Authorization": f"Bearer {settings.GA4_ACCESS_TOKEN}"}
        response = requests.post(endpoint, json=body, headers=headers, timeout=20)
        response.raise_for_status()
        payload = response.json()

        rows = payload.get("rows", [])
        daily_map: Dict[str, int] = {}
        country_map: Dict[str, int] = {}
        device_map: Dict[str, int] = {}
        asset_map: Dict[str, Dict[str, float]] = {}
        bounce_values = []

        for row in rows:
            dims = [d.get("value", "") for d in row.get("dimensionValues", [])]
            mets = [m.get("value", "0") for m in row.get("metricValues", [])]
            if len(dims) < 4 or len(mets) < 3:
                continue
            raw_date, country, device, page = dims
            day = datetime.strptime(raw_date, "%Y%m%d").date().isoformat()
            sessions = int(float(mets[0] or 0))
            bounce = float(mets[1] or 0) * 100
            conversions = float(mets[2] or 0)

            daily_map[day] = daily_map.get(day, 0) + sessions
            country_map[country or "Unknown"] = country_map.get(country or "Unknown", 0) + sessions
            device_map[device or "Unknown"] = device_map.get(device or "Unknown", 0) + sessions
            bounce_values.append(bounce)

            asset = asset_map.setdefault(page or "/", {"sessions": 0.0, "conversions": 0.0})
            asset["sessions"] += sessions
            asset["conversions"] += conversions

        month_sessions = sum(daily_map.values())
        top_assets = sorted(asset_map.items(), key=lambda x: x[1]["sessions"], reverse=True)[:5]

        return {
            "provider": "ga4",
            "source": "live",
            "period": self._build_period(month_sessions, month_sessions),
            "totals": {
                "sessions": month_sessions,
                "bounce_rate": round(sum(bounce_values) / len(bounce_values), 2) if bounce_values else 0,
                "conversions": int(sum(v["conversions"] for v in asset_map.values())),
            },
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

    def _build_sample_analytics(self, project_id: int, domain: str) -> Dict[str, Any]:
        rng = random.Random(project_id)
        today = date.today()
        daily_sessions = []
        baseline = rng.randint(120, 240)

        for i in range(29, -1, -1):
            day = today - timedelta(days=i)
            trend_boost = int((29 - i) * rng.uniform(0.6, 1.8))
            jitter = rng.randint(-25, 40)
            sessions = max(20, baseline + trend_boost + jitter)
            daily_sessions.append({"date": day.isoformat(), "sessions": sessions})

        current_month = sum(item["sessions"] for item in daily_sessions)
        previous_month = int(current_month * rng.uniform(0.78, 0.98))
        growth_pct = ((current_month - previous_month) / previous_month * 100) if previous_month else 0
        conversions = int(current_month * rng.uniform(0.015, 0.045))

        pages = [
            "/",
            "/pricing",
            "/blog/technical-seo-checklist",
            "/blog/core-web-vitals-guide",
            "/contact",
        ]
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
            },
            "audience": {
                "top_countries": top_countries,
                "devices": devices,
            },
            "top_assets": top_assets,
            "daily_sessions": daily_sessions,
            "notes": ["Analytics provider is not configured. Showing realistic sample data."],
        }

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
