"""SERP API integration for keyword rank checking and top-result analysis.

Supports SerpApi (serpapi.com) and ValueSERP (valueserp.com).
Falls back to deterministic sample results when no API key is configured.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass, field
from urllib.parse import urlparse

import requests

from app.config import settings
from app.schemas import SERP_FEATURE_SOURCE_KEYS

logger = logging.getLogger(__name__)


@dataclass
class RankResult:
    rank: int | None
    url: str | None
    serp_features: list[str] = field(default_factory=list)
    competitor_positions: dict[str, int | None] = field(default_factory=dict)
    result_type: str = "organic"


@dataclass
class SerpOverviewItem:
    rank: int
    title: str
    url: str
    snippet: str
    content_type: str
    title_angle: str
    structure_features: list[str]
    word_count: int
    word_count_range: str
    content_gap: str


def _matches_domain(link: str, domain: str) -> bool:
    try:
        hostname = urlparse(link).hostname or ""
    except Exception:
        hostname = ""
    clean_domain = domain.replace("https://", "").replace("http://", "").strip("/")
    return clean_domain in hostname or clean_domain in link


def _extract_serp_features(data: dict) -> list[str]:
    return [name for name, source_key in SERP_FEATURE_SOURCE_KEYS.items() if data.get(source_key)]


def check_keyword_rank(term: str, domain: str, competitor_domains: list[str] | None = None, gl: str = "us", hl: str = "en") -> RankResult:
    """Check the SERP rank for a keyword against a domain."""
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

    data = _fetch_serp_payload(term=term, gl=gl, hl=hl, num=100)
    if not data:
        return RankResult(rank=None, url=None)
    return _build_rank_result(data, domain, competitor_domains)


def get_serp_overview(term: str, gl: str = "us", hl: str = "en", limit: int = 10) -> list[SerpOverviewItem]:
    data = _fetch_serp_payload(term=term, gl=gl, hl=hl, num=max(limit, 10))
    if not data:
        return _sample_serp_overview(term=term, limit=limit)

    organic_results = data.get("organic_results", []) or []
    items: list[SerpOverviewItem] = []
    for index, result in enumerate(organic_results[:limit], start=1):
        title = str(result.get("title") or f"{term} result {index}").strip()
        snippet = str(result.get("snippet") or result.get("snippet_highlighted_words") or "").strip()
        url = str(result.get("link") or result.get("displayed_link") or "").strip()
        content_type = _classify_content_type(title, url, snippet)
        title_angle = _infer_title_angle(title)
        structure_features = _infer_structure_features(title, snippet, content_type)
        word_count = _estimate_word_count(title, snippet, content_type)
        items.append(
            SerpOverviewItem(
                rank=int(result.get("position") or index),
                title=title,
                url=url,
                snippet=snippet,
                content_type=content_type,
                title_angle=title_angle,
                structure_features=structure_features,
                word_count=word_count,
                word_count_range=_word_count_range(word_count),
                content_gap=_infer_content_gap(content_type, title_angle, structure_features),
            )
        )
    return items or _sample_serp_overview(term=term, limit=limit)


def _fetch_serp_payload(term: str, gl: str, hl: str, num: int) -> dict | None:
    if not settings.SERP_API_KEY:
        return None
    provider = settings.SERP_API_PROVIDER.lower()
    if provider == "valueserp":
        return _request_payload(
            "https://api.valueserp.com/search",
            {"q": term, "api_key": settings.SERP_API_KEY, "num": num, "gl": gl, "hl": hl},
            provider_name="ValueSERP",
        )
    return _request_payload(
        "https://serpapi.com/search",
        {"q": term, "api_key": settings.SERP_API_KEY, "num": num, "gl": gl, "hl": hl},
        provider_name="SerpApi",
    )


def _request_payload(url: str, params: dict[str, object], provider_name: str) -> dict | None:
    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.exception("%s request failed", provider_name)
        return None


def _build_rank_result(data: dict, domain: str, competitor_domains: list[str] | None) -> RankResult:
    organic_results = data.get("organic_results", [])
    rank = None
    url = None
    result_type = "organic" if organic_results else "mixed"
    competitor_positions: dict[str, int | None] = {d: None for d in (competitor_domains or [])}

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


def _sample_serp_overview(term: str, limit: int) -> list[SerpOverviewItem]:
    templates = [
        ("终极指南", "guide"),
        ("完整教程", "how_to"),
        ("最佳实践清单", "listicle"),
        ("案例拆解", "case_study"),
        ("模板合集", "template"),
        ("常见问题", "faq"),
        ("对比评测", "comparison"),
        ("新手入门", "beginner_guide"),
        ("策略框架", "framework"),
        ("工具推荐", "tool_list"),
    ]
    items: list[SerpOverviewItem] = []
    for index in range(limit):
        variant_title, variant_type = templates[index % len(templates)]
        content_type = _content_type_from_variant(variant_type)
        title_angle = variant_title
        structure_features = _structure_for_variant(variant_type)
        word_count = 900 + (_stable_int(f"{term}:{index}") % 1800)
        items.append(
            SerpOverviewItem(
                rank=index + 1,
                title=f"{term} {variant_title}",
                url=f"https://example{index + 1}.com/{_slugify(term)}-{index + 1}",
                snippet=f"围绕 {term} 的 {variant_title} 内容，强调步骤、案例与 FAQ。",
                content_type=content_type,
                title_angle=title_angle,
                structure_features=structure_features,
                word_count=word_count,
                word_count_range=_word_count_range(word_count),
                content_gap=_infer_content_gap(content_type, title_angle, structure_features),
            )
        )
    return items


def _classify_content_type(title: str, url: str, snippet: str) -> str:
    haystack = f"{title} {url} {snippet}".lower()
    if any(token in haystack for token in ("template", "模板", "checklist", "清单")):
        return "template/list"
    if any(token in haystack for token in ("vs", "versus", "compare", "comparison", "对比")):
        return "comparison"
    if any(token in haystack for token in ("faq", "questions", "常见问题")):
        return "faq"
    if any(token in haystack for token in ("case study", "case", "案例")):
        return "case study"
    if any(token in haystack for token in ("tool", "software", "platform", "工具")):
        return "tool roundup"
    if any(token in haystack for token in ("guide", "tutorial", "how to", "教程", "指南")):
        return "guide"
    return "article"


def _infer_title_angle(title: str) -> str:
    lower = title.lower()
    if any(token in lower for token in ("best", "top", "最佳", "top ")):
        return "best-of roundup"
    if any(token in lower for token in ("how to", "教程", "指南", "complete guide")):
        return "step-by-step guide"
    if any(token in lower for token in ("template", "模板")):
        return "template-led"
    if any(token in lower for token in ("vs", "compare", "comparison", "对比")):
        return "comparison"
    if any(token in lower for token in ("case", "案例")):
        return "case-study proof"
    if any(token in lower for token in ("faq", "questions", "常见问题")):
        return "question-driven"
    return "educational overview"


def _infer_structure_features(title: str, snippet: str, content_type: str) -> list[str]:
    features: list[str] = []
    haystack = f"{title} {snippet}".lower()
    if content_type in {"guide", "article"}:
        features.append("problem -> steps -> examples")
    if content_type == "comparison":
        features.extend(["feature comparison", "pros & cons"])
    if content_type == "faq":
        features.append("question clusters")
    if content_type == "template/list":
        features.append("checklist or template section")
    if content_type == "tool roundup":
        features.append("tool-by-tool breakdown")
    if any(token in haystack for token in ("faq", "questions", "常见问题")):
        features.append("faq block")
    if any(token in haystack for token in ("example", "case", "案例")):
        features.append("examples or case studies")
    if not features:
        features.append("intro -> body -> recap")
    return list(dict.fromkeys(features))


def _estimate_word_count(title: str, snippet: str, content_type: str) -> int:
    base = {
        "guide": 1800,
        "article": 1400,
        "comparison": 1600,
        "faq": 1200,
        "case study": 1500,
        "tool roundup": 1900,
        "template/list": 1100,
    }.get(content_type, 1400)
    variance = _stable_int(f"{title}:{snippet}:{content_type}") % 800
    return base + variance


def _word_count_range(word_count: int) -> str:
    lower = max(300, (word_count // 250) * 250)
    upper = lower + 250
    return f"{lower}-{upper}"


def _infer_content_gap(content_type: str, title_angle: str, structure_features: list[str]) -> str:
    if content_type == "comparison":
        return "增加真实使用场景和决策建议，避免只停留在功能罗列。"
    if content_type == "template/list":
        return "可补充可下载模板、执行示例和适用边界。"
    if "faq block" not in structure_features:
        return "补上 FAQ 与常见误区，提高长尾问题覆盖。"
    if title_angle == "educational overview":
        return "加入更强的信息增量，如案例、数据或步骤清单。"
    return "补充最新案例、可执行 checklist 与差异化观点。"


def _content_type_from_variant(variant_type: str) -> str:
    mapping = {
        "guide": "guide",
        "how_to": "guide",
        "listicle": "template/list",
        "case_study": "case study",
        "template": "template/list",
        "faq": "faq",
        "comparison": "comparison",
        "beginner_guide": "guide",
        "framework": "article",
        "tool_list": "tool roundup",
    }
    return mapping.get(variant_type, "article")


def _structure_for_variant(variant_type: str) -> list[str]:
    mapping = {
        "guide": ["problem -> steps -> examples", "faq block"],
        "how_to": ["step-by-step workflow", "examples or case studies"],
        "listicle": ["checklist or template section", "quick-scan sections"],
        "case_study": ["context -> actions -> outcomes", "examples or case studies"],
        "template": ["template section", "usage instructions"],
        "faq": ["question clusters", "faq block"],
        "comparison": ["feature comparison", "pros & cons"],
        "beginner_guide": ["intro -> glossary -> steps", "faq block"],
        "framework": ["framework overview", "examples or case studies"],
        "tool_list": ["tool-by-tool breakdown", "selection criteria"],
    }
    return mapping.get(variant_type, ["intro -> body -> recap"])


def _stable_int(value: str) -> int:
    return int(hashlib.sha256(value.encode("utf-8")).hexdigest()[:8], 16)


def _slugify(value: str) -> str:
    return "-".join(part for part in "".join(ch.lower() if ch.isalnum() else " " for ch in value).split() if part) or "keyword"
