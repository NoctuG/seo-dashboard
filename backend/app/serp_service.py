"""SERP API integration for keyword rank checking.

Supports SerpApi (serpapi.com) and ValueSERP (valueserp.com).
Falls back to simulated results when no API key is configured.
"""

import logging
from typing import Optional
from dataclasses import dataclass

import requests

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class RankResult:
    rank: Optional[int]
    url: Optional[str]


def check_keyword_rank(term: str, domain: str) -> RankResult:
    """Check the SERP rank for a keyword against a domain.

    Returns the position and URL of the first result matching the domain.
    If no API key is configured, returns a simulated result.
    """
    if not settings.SERP_API_KEY:
        logger.warning("No SERP_API_KEY configured – returning empty result")
        return RankResult(rank=None, url=None)

    provider = settings.SERP_API_PROVIDER.lower()
    if provider == "valueserp":
        return _check_valueserp(term, domain)
    return _check_serpapi(term, domain)


def _check_serpapi(term: str, domain: str) -> RankResult:
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
        data = resp.json()

        for result in data.get("organic_results", []):
            link = result.get("link", "")
            if domain in link:
                return RankResult(
                    rank=result.get("position"),
                    url=link,
                )

        return RankResult(rank=None, url=None)
    except Exception:
        logger.exception("SerpApi request failed")
        return RankResult(rank=None, url=None)


def _check_valueserp(term: str, domain: str) -> RankResult:
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
        data = resp.json()

        for result in data.get("organic_results", []):
            link = result.get("link", "")
            if domain in link:
                return RankResult(
                    rank=result.get("position"),
                    url=link,
                )

        return RankResult(rank=None, url=None)
    except Exception:
        logger.exception("ValueSERP request failed")
        return RankResult(rank=None, url=None)
