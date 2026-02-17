from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional, Protocol
from urllib.parse import urlparse

from sqlmodel import Session, select

from app.backlink_service import backlink_service
from app.models import BacklinkSnapshot


@dataclass
class BacklinkGapDomainRow:
    referring_domain: str
    da: Optional[float]
    link_type: Optional[str]
    anchor_text: Optional[str]
    target_url: Optional[str]
    first_seen_at: Optional[datetime]


class BacklinkGapProviderAdapter(Protocol):
    provider: str
    source: str

    def fetch_rows(
        self,
        session: Session,
        *,
        project_id: int,
        domain: str,
        is_primary_project_domain: bool,
    ) -> list[BacklinkGapDomainRow]:
        ...


class _BaseBacklinkGapProvider:
    provider = "sample"
    source = "api"

    @staticmethod
    def _try_parse_datetime(value: Any) -> Optional[datetime]:
        if not value:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            sanitized = value.replace("Z", "+00:00")
            try:
                return datetime.fromisoformat(sanitized)
            except ValueError:
                return None
        return None

    @staticmethod
    def _extract_referring_domain(entry: dict[str, Any]) -> str:
        raw_domain = str(entry.get("referring_domain") or entry.get("source") or "").strip().lower()
        if raw_domain:
            return raw_domain

        url_candidates = [entry.get("target_url"), entry.get("url")]
        for candidate in url_candidates:
            if not candidate:
                continue
            parsed = urlparse(str(candidate))
            if parsed.netloc:
                return parsed.netloc.lower()
        return "unknown"

    def _normalize_rows(self, rows: list[dict[str, Any]]) -> list[BacklinkGapDomainRow]:
        normalized: list[BacklinkGapDomainRow] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            da_value = row.get("da")
            try:
                da = float(da_value) if da_value is not None else None
            except (TypeError, ValueError):
                da = None

            normalized.append(
                BacklinkGapDomainRow(
                    referring_domain=self._extract_referring_domain(row),
                    da=da,
                    link_type=(row.get("link_type") or row.get("type") or row.get("rel") or None),
                    anchor_text=(row.get("anchor_text") or row.get("anchor") or None),
                    target_url=(row.get("target_url") or row.get("url") or None),
                    first_seen_at=self._try_parse_datetime(row.get("first_seen_at") or row.get("date")),
                )
            )
        return normalized


class SnapshotBacklinkGapProvider(_BaseBacklinkGapProvider):
    source = "backlink_snapshot.top_backlinks_json"

    def fetch_rows(
        self,
        session: Session,
        *,
        project_id: int,
        domain: str,
        is_primary_project_domain: bool,
    ) -> list[BacklinkGapDomainRow]:
        if not is_primary_project_domain:
            return []

        latest = session.exec(
            select(BacklinkSnapshot)
            .where(BacklinkSnapshot.project_id == project_id)
            .order_by(BacklinkSnapshot.date.desc())
        ).first()
        if not latest or not latest.top_backlinks_json:
            return []

        import json

        try:
            payload = json.loads(latest.top_backlinks_json)
        except json.JSONDecodeError:
            return []
        if not isinstance(payload, list):
            return []
        self.provider = latest.provider or self.provider
        return self._normalize_rows(payload)


class AhrefsBacklinkGapProvider(_BaseBacklinkGapProvider):
    provider = "ahrefs"
    source = "provider_adapter"

    def fetch_rows(
        self,
        session: Session,
        *,
        project_id: int,
        domain: str,
        is_primary_project_domain: bool,
    ) -> list[BacklinkGapDomainRow]:
        metrics = backlink_service.get_metrics(domain)
        return self._normalize_rows(metrics.top_backlinks)


class MozBacklinkGapProvider(_BaseBacklinkGapProvider):
    provider = "moz"
    source = "provider_adapter"

    def fetch_rows(
        self,
        session: Session,
        *,
        project_id: int,
        domain: str,
        is_primary_project_domain: bool,
    ) -> list[BacklinkGapDomainRow]:
        metrics = backlink_service.get_metrics(domain)
        return self._normalize_rows(metrics.top_backlinks)


class BacklinkGapService:
    def __init__(self) -> None:
        self._snapshot_provider = SnapshotBacklinkGapProvider()
        self._provider_adapters: dict[str, BacklinkGapProviderAdapter] = {
            "ahrefs": AhrefsBacklinkGapProvider(),
            "moz": MozBacklinkGapProvider(),
        }

    def fetch_domain_rows(
        self,
        session: Session,
        *,
        project_id: int,
        domain: str,
        provider: str,
        is_primary_project_domain: bool,
    ) -> tuple[list[BacklinkGapDomainRow], str, str]:
        snapshot_rows = self._snapshot_provider.fetch_rows(
            session,
            project_id=project_id,
            domain=domain,
            is_primary_project_domain=is_primary_project_domain,
        )
        if snapshot_rows:
            return snapshot_rows, self._snapshot_provider.provider, self._snapshot_provider.source

        adapter = self._provider_adapters.get(provider.lower())
        if not adapter:
            adapter = self._provider_adapters.get("ahrefs")

        rows = adapter.fetch_rows(
            session,
            project_id=project_id,
            domain=domain,
            is_primary_project_domain=is_primary_project_domain,
        )
        return rows, adapter.provider, adapter.source


backlink_gap_service = BacklinkGapService()
