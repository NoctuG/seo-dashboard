from __future__ import annotations

import random
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, List, Protocol

from app.config import settings


@dataclass
class BacklinkMetrics:
    domain_authority: float
    backlinks_total: int
    ref_domains: int
    ahrefs_rank: int | None
    top_backlinks: List[Dict[str, str]]
    anchor_distribution: Dict[str, int]
    new_links: List[Dict[str, str]]
    lost_links: List[Dict[str, str]]
    notes: List[str]
    provider: str
    success: bool = True


class BacklinkProviderClient(Protocol):
    provider_name: str

    def fetch_metrics(self, domain: str) -> BacklinkMetrics:
        ...


class _BaseBacklinkProvider:
    provider_name = "sample"

    def _normalize_payload(self, payload: Dict[str, Any]) -> BacklinkMetrics:
        return BacklinkMetrics(
            domain_authority=float(payload.get("domain_authority") or 0),
            backlinks_total=int(payload.get("backlinks") or payload.get("backlinks_total") or 0),
            ref_domains=int(payload.get("referring_domains") or payload.get("ref_domains") or 0),
            ahrefs_rank=payload.get("ahrefs_rank"),
            top_backlinks=list(payload.get("top_backlinks") or []),
            anchor_distribution=dict(payload.get("anchor_distribution") or {}),
            new_links=list(payload.get("new_links") or []),
            lost_links=list(payload.get("lost_links") or []),
            notes=list(payload.get("notes") or []),
            provider=str(payload.get("provider") or self.provider_name),
            success=bool(payload.get("success", True)),
        )

    def _build_sample(self, domain: str, authority_seed: int) -> BacklinkMetrics:
        seed = sum(ord(c) for c in domain) + authority_seed
        random.seed(seed)
        ref_domains = max(10, random.randint(40, 400))
        backlinks_total = ref_domains * random.randint(3, 9)
        authority = round(min(95.0, 15 + ref_domains / 6), 1)
        anchors = {
            "brand": int(backlinks_total * 0.35),
            "naked_url": int(backlinks_total * 0.25),
            "generic": int(backlinks_total * 0.20),
            "money": backlinks_total - int(backlinks_total * 0.35) - int(backlinks_total * 0.25) - int(backlinks_total * 0.20),
        }

        new_links = [
            {
                "url": f"https://news{i}.{domain}/mentions/{i}",
                "source": f"news{i}.{domain}",
                "anchor": random.choice(["brand", "naked url", "best tools", "click here"]),
                "date": str(date.today() - timedelta(days=i % 7)),
            }
            for i in range(1, 6)
        ]
        lost_links = [
            {
                "url": f"https://blog{i}.{domain}/old-link/{i}",
                "source": f"blog{i}.{domain}",
                "anchor": random.choice(["brand", "guide", "pricing", "homepage"]),
                "date": str(date.today() - timedelta(days=7 + i)),
            }
            for i in range(1, 4)
        ]

        raw_payload = {
            "domain_authority": authority,
            "backlinks": backlinks_total,
            "referring_domains": ref_domains,
            "ahrefs_rank": max(1, 1_000_000 - ref_domains * 100),
            "top_backlinks": new_links[:3],
            "anchor_distribution": anchors,
            "new_links": new_links,
            "lost_links": lost_links,
            "notes": [f"Using {self.provider_name} provider sample response."],
            "provider": self.provider_name,
        }
        return self._normalize_payload(raw_payload)


class MozClient(_BaseBacklinkProvider):
    provider_name = "moz"

    def fetch_metrics(self, domain: str) -> BacklinkMetrics:
        if not settings.MOZ_API_KEY:
            raise RuntimeError("MOZ_API_KEY is not configured")
        return self._build_sample(domain, authority_seed=1)


class AhrefsClient(_BaseBacklinkProvider):
    provider_name = "ahrefs"

    def fetch_metrics(self, domain: str) -> BacklinkMetrics:
        if not settings.AHREFS_API_KEY:
            raise RuntimeError("AHREFS_API_KEY is not configured")
        return self._build_sample(domain, authority_seed=2)


class MajesticClient(_BaseBacklinkProvider):
    provider_name = "majestic"

    def fetch_metrics(self, domain: str) -> BacklinkMetrics:
        if not settings.MAJESTIC_API_KEY:
            raise RuntimeError("MAJESTIC_API_KEY is not configured")
        return self._build_sample(domain, authority_seed=3)


class SampleClient(_BaseBacklinkProvider):
    provider_name = "sample"

    def fetch_metrics(self, domain: str) -> BacklinkMetrics:
        return self._build_sample(domain, authority_seed=0)


class BacklinkService:
    def __init__(self) -> None:
        self._clients = {
            "moz": MozClient(),
            "ahrefs": AhrefsClient(),
            "majestic": MajesticClient(),
            "sample": SampleClient(),
        }

    def _empty_payload(self, provider: str, reason: str) -> BacklinkMetrics:
        return BacklinkMetrics(
            domain_authority=0,
            backlinks_total=0,
            ref_domains=0,
            ahrefs_rank=None,
            top_backlinks=[],
            anchor_distribution={},
            new_links=[],
            lost_links=[],
            notes=[reason, "Keeping previous successful snapshot to avoid dashboard jitter."],
            provider=provider,
            success=False,
        )

    def get_metrics(self, domain: str) -> BacklinkMetrics:
        provider = (settings.BACKLINK_PROVIDER or "sample").lower()
        client = self._clients.get(provider, self._clients["sample"])

        try:
            return client.fetch_metrics(domain)
        except Exception as exc:
            return self._empty_payload(provider=client.provider_name, reason=f"{client.provider_name} provider failed: {exc}")


backlink_service = BacklinkService()
