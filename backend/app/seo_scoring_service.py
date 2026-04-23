from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable, List


_WORD_RE = re.compile(r"[A-Za-z0-9]+")
_CJK_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
_SENTENCE_SPLIT_RE = re.compile(r"[。！？!?\n]+")


@dataclass
class SeoScoreContext:
    content: str
    primary_keyword: str
    secondary_keywords: List[str]
    search_intent: str
    keyword_clusters: List[List[str]]
    target_word_count: int | None
    competitor_word_counts: List[int]



def _normalize(text: str) -> str:
    return text.lower().strip()



def _contains_phrase(content: str, phrase: str) -> bool:
    phrase = phrase.strip()
    if not phrase:
        return False
    return phrase.lower() in content.lower()



def _count_occurrences(content: str, phrase: str) -> int:
    phrase = phrase.strip()
    if not phrase:
        return 0
    escaped = re.escape(phrase)
    return len(re.findall(escaped, content, flags=re.IGNORECASE))



def _content_length_units(content: str) -> int:
    ascii_words = _WORD_RE.findall(content)
    cjk_chars = _CJK_CHAR_RE.findall(content)
    return max(len(ascii_words) + len(cjk_chars), 1)



def _clamp(score: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, score))



def _metric(search_name: str, score: float, detail: str) -> dict:
    return {
        "metric": search_name,
        "score": round(_clamp(score), 1),
        "detail": detail,
    }



def _intent_match_score(content: str, primary: str, secondary: Iterable[str], intent: str) -> tuple[float, str]:
    intent_tokens = [token for token in re.split(r"[\s,，、;；]+", intent) if len(token.strip()) >= 2]
    hit_intent = sum(1 for token in intent_tokens if _contains_phrase(content, token))
    intent_coverage = hit_intent / max(len(intent_tokens), 1)

    keywords = [primary, *secondary]
    keyword_hits = sum(1 for kw in keywords if kw and _contains_phrase(content, kw))
    keyword_coverage = keyword_hits / max(len([kw for kw in keywords if kw]), 1)

    score = 55 * intent_coverage + 45 * keyword_coverage
    detail = f"意图词覆盖 {hit_intent}/{max(len(intent_tokens), 1)}，关键词覆盖 {keyword_hits}/{max(len([kw for kw in keywords if kw]), 1)}"
    return score, detail



def _keyword_density_score(content: str, primary: str, secondary: Iterable[str]) -> tuple[float, str]:
    total_units = _content_length_units(content)
    core_keywords = [kw for kw in [primary, *secondary] if kw.strip()]
    total_hits = sum(_count_occurrences(content, kw) for kw in core_keywords)
    density = (total_hits / total_units) * 100

    ideal_center = 1.8
    tolerance = 1.6
    deviation = abs(density - ideal_center)
    score = 100 if deviation <= 0.2 else 100 - ((deviation - 0.2) / tolerance) * 100
    detail = f"关键词密度约 {density:.2f}%（命中 {total_hits} 次）"
    return score, detail



def _cluster_coverage_score(content: str, clusters: List[List[str]], fallback_keywords: Iterable[str]) -> tuple[float, str]:
    normalized_clusters = [[kw.strip() for kw in cluster if kw.strip()] for cluster in clusters if cluster]
    if not normalized_clusters:
        normalized_clusters = [[kw.strip()] for kw in fallback_keywords if kw.strip()]

    covered = 0
    for cluster in normalized_clusters:
        if any(_contains_phrase(content, kw) for kw in cluster):
            covered += 1

    total = max(len(normalized_clusters), 1)
    coverage = covered / total
    return coverage * 100, f"关键词簇覆盖 {covered}/{total}"



def _length_gap_score(content: str, target_word_count: int | None, competitor_counts: List[int]) -> tuple[float, str]:
    content_units = _content_length_units(content)
    benchmark = None
    if target_word_count and target_word_count > 0:
        benchmark = target_word_count
    elif competitor_counts:
        benchmark = max(int(sum(competitor_counts) / len(competitor_counts)), 1)

    if not benchmark:
        return 75.0, f"内容篇幅约 {content_units}，未提供目标篇幅，按中性评分"

    gap_ratio = abs(content_units - benchmark) / benchmark
    score = 100 - gap_ratio * 160
    return score, f"当前篇幅 {content_units}，目标/竞品基准 {benchmark}"



def _readability_score(content: str) -> tuple[float, str]:
    sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(content) if s.strip()]
    sentence_count = max(len(sentences), 1)
    total_units = _content_length_units(content)
    avg_sentence_units = total_units / sentence_count

    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
    long_paragraph_penalty = sum(1 for p in paragraphs if len(p) > 300) * 8

    bullets = content.count("- ") + content.count("* ") + content.count("1. ")
    bullet_bonus = min(12, bullets * 2)

    base = 100 - abs(avg_sentence_units - 22) * 2.5 - long_paragraph_penalty + bullet_bonus
    return base, f"平均句长约 {avg_sentence_units:.1f} 单位，段落数 {len(paragraphs)}"



def score_seo_content(context: SeoScoreContext) -> dict:
    content = context.content.strip()
    if not content:
        return {
            "score_total": 0,
            "score_breakdown": [],
            "issues": ["内容为空，无法进行 SEO 质量评级。"],
            "recommendations": ["请先生成或粘贴正文内容后再评分。"],
        }

    intent_score, intent_detail = _intent_match_score(content, context.primary_keyword, context.secondary_keywords, context.search_intent)
    density_score, density_detail = _keyword_density_score(content, context.primary_keyword, context.secondary_keywords)
    cluster_score, cluster_detail = _cluster_coverage_score(content, context.keyword_clusters, [context.primary_keyword, *context.secondary_keywords])
    length_score, length_detail = _length_gap_score(content, context.target_word_count, context.competitor_word_counts)
    readability_score, readability_detail = _readability_score(content)

    breakdown = [
        _metric("搜索意图匹配", intent_score, intent_detail),
        _metric("关键词密度", density_score, density_detail),
        _metric("关键词聚类覆盖", cluster_score, cluster_detail),
        _metric("内容篇幅差距", length_score, length_detail),
        _metric("可读性评分", readability_score, readability_detail),
    ]

    weights = {
        "搜索意图匹配": 0.28,
        "关键词密度": 0.18,
        "关键词聚类覆盖": 0.2,
        "内容篇幅差距": 0.14,
        "可读性评分": 0.2,
    }
    total = 0.0
    for item in breakdown:
        total += item["score"] * weights[item["metric"]]
    total = round(_clamp(total), 1)

    issues: List[str] = []
    recommendations: List[str] = []
    for item in breakdown:
        if item["score"] >= 75:
            continue
        metric = item["metric"]
        issues.append(f"{metric}偏弱：{item['detail']}")
        if metric == "搜索意图匹配":
            recommendations.append("在导语和小标题中明确回答用户搜索意图，并补齐意图词。")
        elif metric == "关键词密度":
            recommendations.append("将主关键词自然分布在标题、首段、小标题与结论，避免堆砌。")
        elif metric == "关键词聚类覆盖":
            recommendations.append("每个关键词簇至少覆盖 1 个代表词，强化主题完整度。")
        elif metric == "内容篇幅差距":
            recommendations.append("将正文长度向目标字数靠拢，优先补充案例、步骤和FAQ。")
        elif metric == "可读性评分":
            recommendations.append("压缩长句和长段，增加列表、子标题和过渡句提升扫读体验。")

    if not issues:
        recommendations.append("当前 SEO 质量良好，可优先进行事实校验与转化 CTA 微调。")

    # 去重并保持顺序
    recommendations = list(dict.fromkeys(recommendations))

    return {
        "score_total": total,
        "score_breakdown": breakdown,
        "issues": issues,
        "recommendations": recommendations,
    }
