from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Any, Protocol

from app.config import settings


@dataclass
class KeywordResearchResult:
    keyword: str
    search_volume: int
    cpc: float
    difficulty: float
    intent: str
    provider_raw: dict[str, Any]


class KeywordResearchProviderClient(Protocol):
    provider_name: str

    def fetch_keywords(self, seed_term: str, locale: str, market: str, limit: int) -> list[KeywordResearchResult]:
        ...


class _BaseKeywordResearchClient:
    provider_name = "sample"

    def _generate_sample_results(self, seed_term: str, locale: str, market: str, limit: int) -> list[KeywordResearchResult]:
        intents = ["informational", "commercial", "transactional", "navigational"]
        normalized_seed = seed_term.strip().lower()
        seed = sum(ord(char) for char in f"{normalized_seed}:{locale}:{market}:{self.provider_name}")
        random.seed(seed)

        suggestions = [
            normalized_seed,
            f"{normalized_seed} tool",
            f"best {normalized_seed}",
            f"{normalized_seed} pricing",
            f"{normalized_seed} checklist",
            f"{normalized_seed} guide",
            f"{normalized_seed} for beginners",
            f"{normalized_seed} alternatives",
            f"{normalized_seed} template",
            f"{normalized_seed} strategy",
        ]
        results: list[KeywordResearchResult] = []
        for term in suggestions[: max(limit, 1)]:
            volume = random.randint(80, 20000)
            cpc = round(random.uniform(0.1, 12.0), 2)
            difficulty = round(random.uniform(5, 90), 1)
            intent = random.choice(intents)
            results.append(
                KeywordResearchResult(
                    keyword=term,
                    search_volume=volume,
                    cpc=cpc,
                    difficulty=difficulty,
                    intent=intent,
                    provider_raw={
                        "provider": self.provider_name,
                        "seed_term": seed_term,
                        "locale": locale,
                        "market": market,
                        "volume_bucket": "high" if volume > 5000 else "mid" if volume > 1000 else "low",
                    },
                )
            )
        return results


class DataForSeoKeywordResearchClient(_BaseKeywordResearchClient):
    provider_name = "dataforseo"

    def fetch_keywords(self, seed_term: str, locale: str, market: str, limit: int) -> list[KeywordResearchResult]:
        if not settings.DATAFORSEO_LOGIN or not settings.DATAFORSEO_PASSWORD:
            raise RuntimeError("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD are required")
        # Real API integration can be added later. For now we return deterministic sample data.
        return self._generate_sample_results(seed_term, locale, market, limit)


class SemrushKeywordResearchClient(_BaseKeywordResearchClient):
    provider_name = "semrush"

    def fetch_keywords(self, seed_term: str, locale: str, market: str, limit: int) -> list[KeywordResearchResult]:
        if not settings.SEMRUSH_API_KEY:
            raise RuntimeError("SEMRUSH_API_KEY is required")
        # Real API integration can be added later. For now we return deterministic sample data.
        return self._generate_sample_results(seed_term, locale, market, limit)


class SampleKeywordResearchClient(_BaseKeywordResearchClient):
    provider_name = "sample"

    def fetch_keywords(self, seed_term: str, locale: str, market: str, limit: int) -> list[KeywordResearchResult]:
        return self._generate_sample_results(seed_term, locale, market, limit)


class KeywordResearchService:
    def __init__(self) -> None:
        self._clients: dict[str, KeywordResearchProviderClient] = {
            "sample": SampleKeywordResearchClient(),
            "dataforseo": DataForSeoKeywordResearchClient(),
            "semrush": SemrushKeywordResearchClient(),
        }


    def current_provider(self) -> str:
        provider = (settings.KEYWORD_RESEARCH_PROVIDER or "sample").lower()
        if provider in self._clients:
            return provider
        return "sample"

    def get_keywords(self, seed_term: str, locale: str, market: str, limit: int) -> list[KeywordResearchResult]:
        provider = self.current_provider()
        client = self._clients.get(provider, self._clients["sample"])
        try:
            return client.fetch_keywords(seed_term=seed_term, locale=locale, market=market, limit=limit)
        except Exception:
            return self._clients["sample"].fetch_keywords(seed_term=seed_term, locale=locale, market=market, limit=limit)


keyword_research_service = KeywordResearchService()
