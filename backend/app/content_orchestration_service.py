from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from sqlmodel import Session, select

from app.content_performance_service import content_performance_service
from app.keyword_research_service import keyword_research_service
from app.models import AiContentDraft, Keyword, PageTrafficSnapshot, Project, RankHistory
from app.runtime_settings import get_runtime_settings
from app.serp_service import SerpOverviewItem, get_serp_overview


@dataclass
class ArticleBriefResult:
    audience: str
    intent: str
    outline: list[str]
    entities: list[str]
    internal_links: list[str]
    cta: str
    metadata: dict[str, str]
    execution: dict[str, dict[str, str]]


class ContentOrchestrationService:
    def suggest_keywords(self, seed_term: str, locale: str, market: str, limit: int = 20) -> dict[str, Any]:
        results = keyword_research_service.get_keywords(seed_term=seed_term, locale=locale, market=market, limit=limit)
        seed_clean = seed_term.strip()
        seen: set[str] = set()
        ordered_terms: list[str] = []
        for item in results:
            term = item.keyword.strip()
            normalized = term.lower()
            if not term or normalized in seen:
                continue
            seen.add(normalized)
            ordered_terms.append(term)

        primary_keyword = seed_clean or (ordered_terms[0] if ordered_terms else "")
        secondary_keywords = [term for term in ordered_terms if term.lower() != primary_keyword.lower()][:5]
        questions = self._build_question_candidates(seed_clean, ordered_terms)
        intents = Counter(item.intent for item in results if item.intent)

        return {
            "provider": keyword_research_service.current_provider(),
            "primary_keyword": primary_keyword,
            "secondary_keywords": secondary_keywords,
            "long_tail_questions": questions,
            "supporting_metrics": [
                {
                    "keyword": item.keyword,
                    "search_volume": item.search_volume,
                    "cpc": item.cpc,
                    "difficulty": item.difficulty,
                    "intent": item.intent,
                }
                for item in results[:10]
            ],
            "intent_signals": [f"{intent}: {count}" for intent, count in intents.most_common()],
        }

    def analyze_serp(self, term: str, locale: str, market: str, limit: int = 10) -> dict[str, Any]:
        overview = get_serp_overview(term=term, gl=market, hl=self._to_hl(locale), limit=limit)
        content_types = Counter(item.content_type for item in overview if item.content_type)
        title_angles = Counter(item.title_angle for item in overview if item.title_angle)
        structure_patterns = Counter(feature for item in overview for feature in item.structure_features)
        gaps = [item.content_gap for item in overview if item.content_gap]

        avg_word_count = round(sum(item.word_count for item in overview) / len(overview)) if overview else 0
        summary_parts = [
            f"前 {len(overview)} 名以 {', '.join(f'{name}×{count}' for name, count in content_types.most_common(3)) or '混合内容'} 为主。",
            f"常见标题角度包括 {', '.join(name for name, _ in title_angles.most_common(3)) or '综合指南'}。",
            f"常见结构特征为 {', '.join(name for name, _ in structure_patterns.most_common(4)) or '分步说明'}。",
            f"估算主流字数约 {avg_word_count} 字。",
        ]

        return {
            "summary": " ".join(summary_parts),
            "top_results": [self._serialize_serp_item(item) for item in overview],
            "patterns": [name for name, _ in content_types.most_common(5)],
            "title_angles": [name for name, _ in title_angles.most_common(5)],
            "structure_features": [name for name, _ in structure_patterns.most_common(6)],
            "content_gaps": gaps[:10],
        }

    async def generate_brief(
        self,
        *,
        project: Project | None,
        topic: str,
        tone: str,
        language: str,
        target_word_count: int,
        keyword_plan: dict[str, Any],
        serp_analysis: dict[str, Any],
    ) -> ArticleBriefResult:
        fallback = self._default_brief(project=project, topic=topic, keyword_plan=keyword_plan, serp_analysis=serp_analysis)
        system_prompt = (
            "你是一名资深 SEO 内容策略总监。请根据关键词规划与 SERP 洞察，输出适合内容创作的 brief。"
            f"{'请使用中文。' if language.startswith('zh') else f'Please respond in {language}.'}"
        )
        serp_rows = "\n".join(
            f"- #{item.get('rank')}: {item.get('title_angle')} / {item.get('content_type')} / {item.get('structure')} / 字数{item.get('word_count')} / 缺口{item.get('content_gap')}"
            for item in serp_analysis.get("top_results", [])
        ) or "- 无"
        user_prompt = (
            f"[主题]\n{topic}\n\n"
            f"[目标字数]\n{target_word_count}\n\n"
            f"[语气]\n{tone}\n\n"
            f"[关键词规划]\n"
            f"主关键词: {keyword_plan.get('primary_keyword') or topic}\n"
            f"次关键词: {', '.join(keyword_plan.get('secondary_keywords', [])) or '无'}\n"
            f"长尾问题: {' | '.join(keyword_plan.get('long_tail_questions', [])) or '无'}\n\n"
            f"[SERP]\n总结: {serp_analysis.get('summary') or '无'}\n{serp_rows}\n\n"
            f"请只输出 JSON，结构如下：\n"
            "{\n"
            '  "audience": string,\n'
            '  "intent": string,\n'
            '  "outline": string[],\n'
            '  "entities": string[],\n'
            '  "internal_links": string[],\n'
            '  "cta": string,\n'
            '  "metadata": {"seo_title": string, "meta_description": string, "slug": string},\n'
            '  "execution": {\n'
            '    "draft_generation": {"goal": string, "notes": string},\n'
            '    "on_page_optimization": {"goal": string, "notes": string},\n'
            '    "quality_review": {"goal": string, "notes": string},\n'
            '    "retrospective_record": {"goal": string, "notes": string}\n'
            '  }\n'
            "}"
        )

        parsed = await self._call_ai_json(system_prompt, user_prompt)
        if not isinstance(parsed, dict):
            return fallback

        return ArticleBriefResult(
            audience=str(parsed.get("audience") or fallback.audience).strip(),
            intent=str(parsed.get("intent") or fallback.intent).strip(),
            outline=self._string_list(parsed.get("outline")) or fallback.outline,
            entities=self._string_list(parsed.get("entities")) or fallback.entities,
            internal_links=self._string_list(parsed.get("internal_links")) or fallback.internal_links,
            cta=str(parsed.get("cta") or fallback.cta).strip(),
            metadata={
                "seo_title": str(((parsed.get("metadata") or {}) if isinstance(parsed.get("metadata"), dict) else {}).get("seo_title") or fallback.metadata["seo_title"]).strip(),
                "meta_description": str(((parsed.get("metadata") or {}) if isinstance(parsed.get("metadata"), dict) else {}).get("meta_description") or fallback.metadata["meta_description"]).strip(),
                "slug": str(((parsed.get("metadata") or {}) if isinstance(parsed.get("metadata"), dict) else {}).get("slug") or fallback.metadata["slug"]).strip(),
            },
            execution=self._normalize_execution(parsed.get("execution"), fallback.execution),
        )

    async def generate_draft_package(self, payload: dict[str, Any]) -> dict[str, Any]:
        strategy = payload.get("strategy", {})
        brief = payload.get("brief", {})
        research = payload.get("research", {})
        execution = payload.get("execution", {})
        keyword_plan = strategy.get("keyword_plan", {})
        serp_analysis = research.get("serp_analysis", {})

        fallback = self._default_draft_package(payload)
        language = str(strategy.get('language', 'zh-CN'))
        language_hint = '请使用中文。' if language.startswith('zh') else f'Please respond in {language}.'
        system_prompt = (
            "你是一名资深 SEO 内容主编。请严格根据 brief 输出结构化 JSON，"
            "并把 brief、draft、on-page、quality review、publish review 全部补全。"
            f"{language_hint}"
        )
        serp_rows = "\n".join(
            f"- #{item.get('rank')}: 类型={item.get('content_type')}; 角度={item.get('title_angle')}; 结构={item.get('structure')}; 字数={item.get('word_count')}; 缺口={item.get('content_gap')}"
            for item in serp_analysis.get("top_results", [])
        ) or "- 无"
        user_prompt = (
            f"[主题]\n{strategy.get('topic')}\n\n"
            f"[语气]\n{strategy.get('tone')}\n\n"
            f"[目标字数]\n{strategy.get('target_word_count')}\n\n"
            f"[关键词]\n主关键词: {keyword_plan.get('primary_keyword')}\n次关键词: {', '.join(keyword_plan.get('secondary_keywords', []))}\n长尾问题: {' | '.join(keyword_plan.get('long_tail_questions', [])) or '无'}\n\n"
            f"[SERP]\n总结: {serp_analysis.get('summary') or '无'}\n{serp_rows}\n\n"
            f"[Brief]\nAudience: {brief.get('audience')}\nIntent: {brief.get('intent')}\nOutline: {' | '.join(brief.get('outline', []))}\nEntities: {', '.join(brief.get('entities', []))}\nInternal links: {' | '.join(brief.get('internal_links', [])) or '无'}\nCTA: {brief.get('cta')}\nMetadata: SEO标题={((brief.get('metadata') or {}) if isinstance(brief.get('metadata'), dict) else {}).get('seo_title')}; Meta描述={((brief.get('metadata') or {}) if isinstance(brief.get('metadata'), dict) else {}).get('meta_description')}; Slug={((brief.get('metadata') or {}) if isinstance(brief.get('metadata'), dict) else {}).get('slug')}\n\n"
            f"[执行要求]\n初稿目标: {((execution.get('draft_generation') or {}) if isinstance(execution.get('draft_generation'), dict) else {}).get('goal')}\nOn-page目标: {((execution.get('on_page_optimization') or {}) if isinstance(execution.get('on_page_optimization'), dict) else {}).get('goal')}\n审校目标: {((execution.get('quality_review') or {}) if isinstance(execution.get('quality_review'), dict) else {}).get('goal')}\n复盘目标: {((execution.get('retrospective_record') or {}) if isinstance(execution.get('retrospective_record'), dict) else {}).get('goal')}\n\n"
            "请只输出一个 JSON 对象，字段必须精确匹配：keyword_plan、serp_summary、brief、draft、on_page、quality_review、publish_review_plan。"
        )

        parsed = await self._call_ai_json(system_prompt, user_prompt)
        if not isinstance(parsed, dict):
            return fallback
        return self._merge_draft_package(fallback, parsed)

    def get_retrospective(self, session: Session, project_id: int, draft_id: int, window: str = "30d") -> dict[str, Any]:
        draft = session.get(AiContentDraft, draft_id)
        if not draft or draft.project_id != project_id:
            raise ValueError("draft_not_found")

        target_url = (draft.target_url or "").strip()
        if not target_url:
            return {
                "target_url": None,
                "publication_status": draft.publication_status,
                "content_performance": None,
                "ranking": None,
                "traffic": None,
                "insights": ["请先为草稿绑定目标 URL，才能读取复盘指标。"],
            }

        content_perf = content_performance_service.get_project_content_performance(session=session, project_id=project_id, window=window, sort="traffic")
        matched_perf = next((item for item in content_perf["items"] if item["url"] == target_url), None)

        keyword_rows = session.exec(
            select(Keyword).where(Keyword.project_id == project_id, Keyword.target_url == target_url)
        ).all()
        keyword_ids = [item.id for item in keyword_rows if item.id is not None]

        latest_by_keyword: dict[int, RankHistory] = {}
        if keyword_ids:
            history_rows = session.exec(
                select(RankHistory)
                .where(RankHistory.keyword_id.in_(keyword_ids))
                .order_by(RankHistory.checked_at.desc())
            ).all()
            for row in history_rows:
                if row.keyword_id not in latest_by_keyword:
                    latest_by_keyword[row.keyword_id] = row

        latest_ranks = [row.rank for row in latest_by_keyword.values() if row.rank is not None]
        ranking = None
        if keyword_rows:
            ranking = {
                "tracked_keywords": len(keyword_rows),
                "keywords_with_rank": len(latest_ranks),
                "avg_rank": round(sum(latest_ranks) / len(latest_ranks), 2) if latest_ranks else None,
                "best_rank": min(latest_ranks) if latest_ranks else None,
                "top_3": len([rank for rank in latest_ranks if rank <= 3]),
                "top_10": len([rank for rank in latest_ranks if rank <= 10]),
                "latest_checked_at": max((row.checked_at for row in latest_by_keyword.values()), default=None),
                "keywords": [
                    {
                        "term": keyword.term,
                        "rank": latest_by_keyword.get(keyword.id).rank if keyword.id in latest_by_keyword else None,
                        "checked_at": latest_by_keyword.get(keyword.id).checked_at.isoformat() if keyword.id in latest_by_keyword else None,
                    }
                    for keyword in keyword_rows
                ],
            }

        traffic_rows = session.exec(
            select(PageTrafficSnapshot)
            .where(PageTrafficSnapshot.project_id == project_id, PageTrafficSnapshot.url == target_url)
            .order_by(PageTrafficSnapshot.date.asc())
        ).all()
        traffic = self._summarize_traffic(traffic_rows)

        insights: list[str] = []
        if matched_perf:
            insights.append(f"30 天会话数 {matched_perf['sessions']}，环比变化 {matched_perf['change_30d']}%。")
            if matched_perf["decay_flag"] and matched_perf.get("suggested_action"):
                insights.append(f"内容出现衰减信号，建议：{matched_perf['suggested_action']}。")
        else:
            insights.append("content-performance 中还没有该 URL 的聚合指标。")

        if ranking and ranking["avg_rank"] is not None:
            insights.append(f"当前已跟踪 {ranking['tracked_keywords']} 个关键词，平均排名 {ranking['avg_rank']}，Top 10 关键词 {ranking['top_10']} 个。")
        else:
            insights.append("当前没有可用于该 URL 的排名历史数据。")

        if traffic and traffic["latest_date"]:
            insights.append(f"最近一次流量快照日期为 {traffic['latest_date']}，近 7 天会话数 {traffic['sessions_7d']}。")
        else:
            insights.append("当前没有可用于该 URL 的流量快照。")

        return {
            "target_url": target_url,
            "publication_status": draft.publication_status,
            "content_performance": matched_perf,
            "ranking": ranking,
            "traffic": traffic,
            "insights": insights,
        }

    def _serialize_serp_item(self, item: SerpOverviewItem) -> dict[str, Any]:
        return {
            "rank": item.rank,
            "title": item.title,
            "url": item.url,
            "content_type": item.content_type,
            "title_angle": item.title_angle,
            "structure": " -> ".join(item.structure_features),
            "structure_features": item.structure_features,
            "word_count": item.word_count,
            "word_count_range": item.word_count_range,
            "content_gap": item.content_gap,
        }

    def _default_brief(self, *, project: Project | None, topic: str, keyword_plan: dict[str, Any], serp_analysis: dict[str, Any]) -> ArticleBriefResult:
        primary_keyword = str(keyword_plan.get("primary_keyword") or topic).strip() or topic
        slug = self._slugify(primary_keyword)
        outline = [
            f"什么是{primary_keyword}",
            f"{primary_keyword} 的核心问题与场景",
            f"如何制定 {primary_keyword} 执行方案",
            f"{primary_keyword} 常见错误与 FAQ",
        ]
        internal_links = self._project_internal_link_candidates(project)
        return ArticleBriefResult(
            audience=f"搜索 {primary_keyword}、需要可执行建议的读者",
            intent=f"帮助用户理解 {primary_keyword}，并给出可落地的执行方案",
            outline=outline,
            entities=[primary_keyword, topic, "最佳实践", "案例", "FAQ"],
            internal_links=internal_links,
            cta="下载清单、预约演示或继续阅读相关专题",
            metadata={
                "seo_title": f"{primary_keyword}：策略、步骤与实战清单",
                "meta_description": serp_analysis.get("summary") or f"围绕 {primary_keyword} 提供策略、步骤、示例与常见问题解答。",
                "slug": slug,
            },
            execution={
                "draft_generation": {"goal": "输出一版可编辑、可直接进入审校流程的完整初稿", "notes": "优先覆盖主关键词、次关键词与长尾问题。"},
                "on_page_optimization": {"goal": "补齐标题、描述、内链、实体词和结构化要素", "notes": "确保 H2/H3 层级清晰，提升可扫读性。"},
                "quality_review": {"goal": "检查事实、案例、语气、E-E-A-T 与品牌一致性", "notes": "删除空话并补充证据。"},
                "retrospective_record": {"goal": "发布后跟踪 URL 的排名、流量与转化表现", "notes": "观察 content-performance、排名与流量快照。"},
            },
        )

    def _default_draft_package(self, payload: dict[str, Any]) -> dict[str, Any]:
        strategy = payload.get("strategy", {})
        brief = payload.get("brief", {})
        research = payload.get("research", {})
        primary_keyword = ((strategy.get("keyword_plan") or {}) if isinstance(strategy.get("keyword_plan"), dict) else {}).get("primary_keyword") or strategy.get("topic") or ""
        heading_tree = [
            {"level": 2, "text": item}
            for item in self._string_list(brief.get("outline"))
        ]
        title = str(((brief.get("metadata") or {}) if isinstance(brief.get("metadata"), dict) else {}).get("seo_title") or strategy.get("topic") or primary_keyword).strip()
        summary = str((research.get("serp_analysis") or {}).get("summary") or f"围绕 {primary_keyword} 生成的结构化初稿。").strip()
        keywords_used = [kw for kw in [primary_keyword, *self._string_list(((strategy.get("keyword_plan") or {}) if isinstance(strategy.get("keyword_plan"), dict) else {}).get("secondary_keywords"))] if kw]
        content = self._build_default_markdown(title, brief)

        return {
            "keyword_plan": {
                "primary_keyword": primary_keyword,
                "secondary_keywords": self._string_list(((strategy.get("keyword_plan") or {}) if isinstance(strategy.get("keyword_plan"), dict) else {}).get("secondary_keywords")),
                "long_tail_questions": self._string_list(((strategy.get("keyword_plan") or {}) if isinstance(strategy.get("keyword_plan"), dict) else {}).get("long_tail_questions")),
                "intent": {
                    "summary": str(brief.get("intent") or f"围绕 {primary_keyword} 提供完整解答").strip(),
                    "target_audience": str(brief.get("audience") or f"搜索 {primary_keyword} 的用户").strip(),
                },
            },
            "serp_summary": {
                "summary": summary,
                "key_patterns": self._string_list((research.get("serp_analysis") or {}).get("patterns")),
                "information_gain": self._string_list((research.get("serp_analysis") or {}).get("content_gaps"))[:5],
                "differentiators": ["补充案例", "加入步骤清单", "覆盖 FAQ"],
            },
            "brief": {
                "title_tag": title,
                "meta_description": str(((brief.get("metadata") or {}) if isinstance(brief.get("metadata"), dict) else {}).get("meta_description") or summary).strip(),
                "url_slug": str(((brief.get("metadata") or {}) if isinstance(brief.get("metadata"), dict) else {}).get("slug") or self._slugify(primary_keyword)).strip(),
                "heading_tree": heading_tree,
                "internal_links": self._string_list(brief.get("internal_links")),
                "image_alt": [f"{primary_keyword} 流程图", f"{primary_keyword} 示例截图"],
                "schema_recommendations": ["Article", "FAQPage"],
            },
            "draft": {
                "title": title,
                "summary": summary,
                "content": content,
                "keywords_used": keywords_used,
                "blocks": [],
            },
            "on_page": {
                "title_tag": title,
                "meta_description": str(((brief.get("metadata") or {}) if isinstance(brief.get("metadata"), dict) else {}).get("meta_description") or summary).strip(),
                "url_slug": str(((brief.get("metadata") or {}) if isinstance(brief.get("metadata"), dict) else {}).get("slug") or self._slugify(primary_keyword)).strip(),
                "heading_tree": heading_tree,
                "internal_links": self._string_list(brief.get("internal_links")),
                "image_alt": [f"{primary_keyword} 流程图", f"{primary_keyword} 示例截图"],
                "schema_recommendations": ["Article", "FAQPage"],
                "checklist": ["检查标题与描述", "确认关键词布局", "补充内部链接", "检查 CTA"],
            },
            "quality_review": {
                "verdict": "需要人工复核后发布",
                "fluff": "需确认是否存在冗余段落",
                "missing_examples": "建议补充 1-2 个案例",
                "experience_evidence": "建议增加实操经验或数据引用",
                "skim_friendly": "建议确认列表与小标题密度",
                "strengths": ["结构完整", "已覆盖关键词规划", "已包含 CTA"],
                "risks": ["需人工核对事实", "需结合品牌语气润色"],
                "fixes": ["补充案例", "强化内部链接", "发布前走审校清单"],
            },
            "publish_review_plan": {
                "pre_publish_checks": ["确认目标 URL", "校对 metadata", "检查内链与结构化数据"],
                "post_publish_metrics": ["30 天会话数", "目标关键词平均排名", "转化率"],
                "iteration_ideas": ["根据 SERP 新变化补充内容", "根据复盘数据优化 CTA"],
            },
        }

    def _merge_draft_package(self, fallback: dict[str, Any], parsed: dict[str, Any]) -> dict[str, Any]:
        merged = json.loads(json.dumps(fallback))
        for section in ("keyword_plan", "serp_summary", "brief", "draft", "on_page", "quality_review", "publish_review_plan"):
            value = parsed.get(section)
            if isinstance(value, dict):
                merged[section] = self._deep_merge_dicts(merged.get(section, {}), value)
        if isinstance(merged.get("draft"), dict):
            merged["draft"]["content"] = str(merged["draft"].get("content") or fallback["draft"]["content"]).strip()
            merged["draft"]["title"] = str(merged["draft"].get("title") or fallback["draft"]["title"]).strip()
        return merged

    def _deep_merge_dicts(self, base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
        merged = dict(base)
        for key, value in incoming.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = self._deep_merge_dicts(merged[key], value)
            elif value not in (None, "", []):
                merged[key] = value
        return merged

    def _build_question_candidates(self, seed_term: str, ordered_terms: list[str]) -> list[str]:
        questions: list[str] = []
        for term in ordered_terms:
            if "?" in term or "？" in term:
                questions.append(term)
        base = seed_term.strip() or (ordered_terms[0] if ordered_terms else "")
        templates = [
            f"什么是{base}？",
            f"如何制定{base}策略？",
            f"{base}有哪些常见错误？",
            f"如何衡量{base}效果？",
            f"{base}适合哪些场景？",
        ]
        for item in templates:
            if item not in questions:
                questions.append(item)
        return questions[:5]

    def _project_internal_link_candidates(self, project: Project | None) -> list[str]:
        if not project:
            return []
        base = project.domain.rstrip("/")
        return [
            f"https://{base}/blog",
            f"https://{base}/resources",
            f"https://{base}/contact",
        ]

    def _build_default_markdown(self, title: str, brief: dict[str, Any]) -> str:
        outline = self._string_list(brief.get("outline")) or [title]
        intro = str(brief.get("intent") or "本文将围绕主题提供结构化分析与可执行建议。")
        sections = [f"## {item}\n\n待补充：结合 brief 补充案例、步骤、数据与 FAQ。" for item in outline]
        return f"# {title}\n\n{intro}\n\n" + "\n\n".join(sections) + "\n\n## 结语\n\n" + str(brief.get("cta") or "根据以上建议继续推进内容发布与复盘。")

    def _summarize_traffic(self, rows: list[PageTrafficSnapshot]) -> dict[str, Any] | None:
        if not rows:
            return None
        daily = {row.date: (row.sessions, row.conversions) for row in rows}
        end_date = max(daily)
        sessions_7d, conversions_7d = self._sum_window(daily, end_date - timedelta(days=6), end_date)
        sessions_30d, conversions_30d = self._sum_window(daily, end_date - timedelta(days=29), end_date)
        return {
            "latest_date": end_date.isoformat(),
            "sessions_7d": sessions_7d,
            "conversions_7d": conversions_7d,
            "sessions_30d": sessions_30d,
            "conversions_30d": conversions_30d,
            "conversion_rate_30d": round((conversions_30d / sessions_30d) * 100, 2) if sessions_30d else 0.0,
        }

    def _sum_window(self, daily: dict[date, tuple[int, int]], start_date: date, end_date: date) -> tuple[int, int]:
        sessions = 0
        conversions = 0
        current = start_date
        while current <= end_date:
            day_sessions, day_conversions = daily.get(current, (0, 0))
            sessions += day_sessions
            conversions += day_conversions
            current += timedelta(days=1)
        return sessions, conversions

    async def _call_ai_json(self, system_prompt: str, user_prompt: str) -> dict[str, Any] | None:
        runtime = get_runtime_settings()
        if not runtime.ai_base_url or not runtime.ai_api_key:
            return None

        endpoint = f"{runtime.ai_base_url.rstrip('/')}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(
                    endpoint,
                    headers={
                        "Authorization": f"Bearer {runtime.ai_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": runtime.ai_model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": 0.4,
                    },
                )
                response.raise_for_status()
        except httpx.HTTPError:
            return None

        data = response.json()
        choices = data.get("choices") or []
        if not choices:
            return None
        content = str(((choices[0].get("message") or {}) if isinstance(choices[0], dict) else {}).get("content") or "")
        return self._extract_json(content)

    def _extract_json(self, raw: str) -> dict[str, Any] | None:
        text = raw.strip()
        if text.startswith("```"):
            lines = text.splitlines()
            if len(lines) >= 3 and lines[-1].strip() == "```":
                text = "\n".join(lines[1:-1]).strip()
                if text.lower().startswith("json"):
                    text = text[4:].strip()
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            pass
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None

    def _normalize_execution(self, value: object, fallback: dict[str, dict[str, str]]) -> dict[str, dict[str, str]]:
        if not isinstance(value, dict):
            return fallback
        normalized: dict[str, dict[str, str]] = {}
        for key, fallback_value in fallback.items():
            node = value.get(key)
            if not isinstance(node, dict):
                normalized[key] = fallback_value
                continue
            normalized[key] = {
                "goal": str(node.get("goal") or fallback_value["goal"]).strip(),
                "notes": str(node.get("notes") or fallback_value["notes"]).strip(),
            }
        return normalized

    def _string_list(self, value: object) -> list[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _slugify(self, value: str) -> str:
        ascii_text = re.sub(r"[^a-zA-Z0-9\s-]", " ", value).lower()
        slug = re.sub(r"[-\s]+", "-", ascii_text).strip("-")
        return slug or "ai-content-brief"

    def _to_hl(self, locale: str) -> str:
        return locale.split("-")[0].lower() if locale else "en"


content_orchestration_service = ContentOrchestrationService()
