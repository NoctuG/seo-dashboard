"""SERP API integration for keyword rank checking.

Supports SerpApi (serpapi.com) and ValueSERP (valueserp.com).
Falls back to simulated results when no API key is configured.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import urlparse

import requests

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RankResult:
    rank: Optional[int]
    url: Optional[str]
    serp_features: list[str] = field(default_factory=list)
    competitor_positions: dict[str, Optional[int]] = field(default_factory=dict)
    result_type: str = "organic"


def _matches_domain(link: str, domain: str) -> bool:
    try:
        hostname = urlparse(link).hostname or ""
    except Exception:
        hostname = ""
    clean_domain = domain.replace("https://", "").replace("http://", "").strip("/")
    return clean_domain in hostname or clean_domain in link


def _extract_serp_features(data: dict) -> list[str]:
    known_features = {
        "featured_snippet": "answer_box",
        "people_also_ask": "related_questions",
        "top_stories": "top_stories",
        "video": "video_results",
        "local_pack": "local_results",
        "image_pack": "images_results",
        "knowledge_graph": "knowledge_graph",
        "shopping": "shopping_results",
    }
    return [name for name, source_key in known_features.items() if data.get(source_key)]


def check_keyword_rank(term: str, domain: str, competitor_domains: Optional[list[str]] = None) -> RankResult:
    """Check the SERP rank for a keyword against a domain.

    Returns the position and URL of the first result matching the domain.
    """
    if not settings.SERP_API_KEY:
        logger.warning("No SERP_API_KEY configured – returning empty result")
        competitors = competitor_domains or []
        return RankResult(
            rank=None,
            url=None,
            serp_features=[],
            competitor_positions={d: None for d in competitors},
            result_type="unknown",
        )

    provider = settings.SERP_API_PROVIDER.lower()
    if provider == "valueserp":
        return _check_valueserp(term, domain, competitor_domains)
    return _check_serpapi(term, domain, competitor_domains)


def _build_rank_result(data: dict, domain: str, competitor_domains: Optional[list[str]]) -> RankResult:
    organic_results = data.get("organic_results", [])
    rank = None
    url = None
    result_type = "organic" if organic_results else "mixed"
    competitor_positions: dict[str, Optional[int]] = {d: None for d in (competitor_domains or [])}

    for result in organic_results:
        link = result.get("link", "")
        if not link:
            continue

        if rank is None and _matches_domain(link, domain):
            rank = result.get("position")
            url = link
            result_type = result.get("type") or "organic"

        for competitor_domain in competitor_positions:
            if competitor_positions[competitor_domain] is None and _matches_domain(link, competitor_domain):
                competitor_positions[competitor_domain] = result.get("position")

    return RankResult(
        rank=rank,
        url=url,
        serp_features=_extract_serp_features(data),
        competitor_positions=competitor_positions,
        result_type=result_type,
    )


def _check_serpapi(term: str, domain: str, competitor_domains: Optional[list[str]]) -> RankResult:
    """Query SerpApi (https://serpapi.com)."""
    try:
        resp = requests.get(
            "https://serpapi.com/search",
            params={
                "q": term,
                "api_key": settings.SERP_API_KEY,
                "num": 100,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return _build_rank_result(resp.json(), domain, competitor_domains)
    except Exception:
        logger.exception("SerpApi request failed")
        return RankResult(rank=None, url=None)


def _check_valueserp(term: str, domain: str, competitor_domains: Optional[list[str]]) -> RankResult:
    """Query ValueSERP (https://www.valueserp.com)."""
    try:
        resp = requests.get(
            "https://api.valueserp.com/search",
            params={
                "q": term,
                "api_key": settings.SERP_API_KEY,
                "num": 100,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return _build_rank_result(resp.json(), domain, competitor_domains)
    except Exception:
        logger.exception("ValueSERP request failed")
        return RankResult(rank=None, url=None)
