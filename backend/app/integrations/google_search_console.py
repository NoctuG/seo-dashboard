from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import os
from typing import Any

import requests

from app.integrations.provider import (
    IntegrationCategory,
    IntegrationHealth,
    IntegrationProvider,
    IntegrationResult,
    IntegrationStatus,
    register_provider,
)


class GoogleSearchConsoleProvider(IntegrationProvider):
    @property
    def name(self) -> str:
        return "google_search_console"

    @property
    def display_name(self) -> str:
        return "Google Search Console"

    @property
    def category(self) -> str:
        return IntegrationCategory.SEARCH_CONSOLE.value

    def is_configured(self) -> bool:
        return bool(os.getenv("GSC_ACCESS_TOKEN"))

    def validate_credentials(self) -> IntegrationStatus:
        if not self.is_configured():
            return IntegrationStatus(
                healthy=False,
                health=IntegrationHealth.NOT_CONFIGURED,
                message="GSC_ACCESS_TOKEN is not configured.",
            )
        try:
            response = requests.get(
                "https://www.googleapis.com/webmasters/v3/sites",
                headers={"Authorization": f"Bearer {os.getenv('GSC_ACCESS_TOKEN', '')}"},
                timeout=15,
            )
            if response.status_code == 200:
                payload = response.json() if response.content else {}
                entries = payload.get("siteEntry", []) if isinstance(payload, dict) else []
                return IntegrationStatus(
                    healthy=True,
                    health=IntegrationHealth.OK,
                    message="Connected",
                    metadata={"site_count": len(entries), "checked_at": datetime.now(timezone.utc).isoformat()},
                )
            if response.status_code in {401, 403}:
                return IntegrationStatus(
                    healthy=False,
                    health=IntegrationHealth.ERROR,
                    message="Invalid or unauthorized GSC token.",
                    metadata={"status_code": response.status_code},
                )
            return IntegrationStatus(
                healthy=False,
                health=IntegrationHealth.DEGRADED,
                message=f"GSC returned unexpected status: {response.status_code}",
                metadata={"status_code": response.status_code},
            )
        except Exception as exc:
            return IntegrationStatus(
                healthy=False,
                health=IntegrationHealth.ERROR,
                message=f"GSC credential check failed: {exc}",
            )

    def fetch_data(self, params: dict[str, Any]) -> IntegrationResult:
        if not self.is_configured():
            return IntegrationResult(success=False, error="GSC_ACCESS_TOKEN is not configured")

        site_url = str(params.get("site_url") or "").strip()
        if not site_url:
            return IntegrationResult(success=False, error="site_url is required")

        row_limit = max(1, min(int(params.get("row_limit") or 25), 100))
        end_date = self._parse_date(params.get("end_date")) or date.today()
        start_date = self._parse_date(params.get("start_date")) or (end_date - timedelta(days=6))

        body = {
            "startDate": start_date.isoformat(),
            "endDate": end_date.isoformat(),
            "dimensions": ["query"],
            "rowLimit": row_limit,
        }
        if params.get("dimension_filter_groups"):
            body["dimensionFilterGroups"] = params["dimension_filter_groups"]

        try:
            encoded_site = requests.utils.quote(site_url, safe="")
            response = requests.post(
                f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query",
                headers={
                    "Authorization": f"Bearer {os.getenv('GSC_ACCESS_TOKEN', '')}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=20,
            )
            if response.status_code != 200:
                return IntegrationResult(
                    success=False,
                    error=f"GSC query failed with status {response.status_code}",
                    metadata={"status_code": response.status_code, "response_text": response.text[:300]},
                )

            payload = response.json() if response.content else {}
            rows = payload.get("rows", []) if isinstance(payload, dict) else []
            normalized_rows = [
                {
                    "query": (row.get("keys") or [""])[0],
                    "clicks": float(row.get("clicks") or 0),
                    "impressions": float(row.get("impressions") or 0),
                    "ctr": float(row.get("ctr") or 0),
                    "position": float(row.get("position") or 0),
                }
                for row in rows
                if isinstance(row, dict)
            ]
            total_clicks = sum(item["clicks"] for item in normalized_rows)
            total_impressions = sum(item["impressions"] for item in normalized_rows)
            avg_position = round(
                sum(item["position"] for item in normalized_rows) / len(normalized_rows), 2
            ) if normalized_rows else None
            ctr = round((total_clicks / total_impressions) * 100, 2) if total_impressions else 0.0

            return IntegrationResult(
                success=True,
                data={
                    "site_url": site_url,
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "rows": normalized_rows,
                    "summary": {
                        "total_clicks": int(total_clicks),
                        "total_impressions": int(total_impressions),
                        "avg_ctr_percent": ctr,
                        "avg_position": avg_position,
                    },
                },
                metadata={
                    "source": "google_search_console",
                    "retrieved_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception as exc:
            return IntegrationResult(success=False, error=f"GSC fetch failed: {exc}")

    def _parse_date(self, value: Any) -> date | None:
        if not value:
            return None
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value))
        except ValueError:
            return None


register_provider(GoogleSearchConsoleProvider())
