from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import httpx
import json
import logging

from app.core.error_codes import ErrorCode
from app.runtime_settings import get_runtime_settings

router = APIRouter()
logger = logging.getLogger(__name__)


class AiAnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, description="SEO content to analyze")


class AiAnalyzeResponse(BaseModel):
    result: str


class LegacyAiGenerateArticleRequest(BaseModel):
    topic: str = Field(..., min_length=1, description="Article topic or main keyword")
    keywords: List[str] = Field(default_factory=list, description="Target SEO keywords")
    tone: str = Field(default="professional", description="Writing tone: professional, casual, authoritative, friendly")
    language: str = Field(default="zh-CN", description="Output language")
    word_count: int = Field(default=1500, ge=300, le=5000, description="Target word count")
    outline: Optional[str] = Field(default=None, description="Custom article outline")


class AiArticleKeywordPlan(BaseModel):
    primary_keyword: str = Field(..., min_length=1, description="Primary keyword")
    secondary_keywords: List[str] = Field(default_factory=list, min_length=3, max_length=5, description="3-5 supporting keywords")
    long_tail_questions: List[str] = Field(default_factory=list, description="Long-tail question list")


class AiArticleSerpEntry(BaseModel):
    rank: int = Field(..., ge=1, le=10, description="SERP rank position")
    content_type: str = Field(..., min_length=1, description="Ranking page content type")
    title_angle: str = Field(..., min_length=1, description="Title framing or angle")
    structure: str = Field(..., min_length=1, description="Observed structure or sections")
    word_count: int = Field(..., ge=0, description="Estimated competitor word count")
    content_gap: str = Field(..., min_length=1, description="Gap or weakness to exploit")


class AiArticleSerpAnalysis(BaseModel):
    summary: Optional[str] = Field(default=None, description="Overall SERP observation summary")
    top_results: List[AiArticleSerpEntry] = Field(default_factory=list, min_length=10, max_length=10, description="Top 10 SERP observations")


class AiArticleMetadata(BaseModel):
    seo_title: str = Field(..., min_length=1, description="SEO title")
    meta_description: str = Field(..., min_length=1, description="Meta description")
    slug: str = Field(..., min_length=1, description="Suggested URL slug")


class AiArticleSeoBrief(BaseModel):
    audience: str = Field(..., min_length=1, description="Target audience")
    intent: str = Field(..., min_length=1, description="Search intent")
    outline: List[str] = Field(default_factory=list, min_length=1, description="Approved outline sections")
    entities: List[str] = Field(default_factory=list, description="Important topical entities")
    internal_links: List[str] = Field(default_factory=list, description="Suggested internal link targets")
    cta: str = Field(..., min_length=1, description="Primary CTA")
    metadata: AiArticleMetadata


class AiArticleWorkflowStage(BaseModel):
    goal: str = Field(..., min_length=1, description="Goal for the workflow stage")
    notes: Optional[str] = Field(default=None, description="Optional notes or constraints")


class AiArticleWorkflow(BaseModel):
    drafting: AiArticleWorkflowStage
    on_page_optimization: AiArticleWorkflowStage
    quality_review: AiArticleWorkflowStage
    retrospective: AiArticleWorkflowStage


class AiGenerateArticleRequest(BaseModel):
    article_mode: str = Field(default="workflow", description="Structured article generation mode")
    topic: str = Field(..., min_length=1, description="Article topic")
    tone: str = Field(default="professional", description="Writing tone: professional, casual, authoritative, friendly")
    language: str = Field(default="zh-CN", description="Output language")
    word_count: int = Field(default=1500, ge=300, le=5000, description="Target word count")
    keyword_plan: AiArticleKeywordPlan
    serp_analysis: AiArticleSerpAnalysis
    seo_brief: AiArticleSeoBrief
    workflow: AiArticleWorkflow


class AiContentBlock(BaseModel):
    type: str = Field(description="Block type, e.g. heading|paragraph|list|cta")
    text: str = Field(default="", description="Main text content")
    level: Optional[int] = Field(default=None, ge=1, le=6, description="Heading/list level")
    meta: dict = Field(default_factory=dict, description="Extra metadata for the block")


class AiArticleIntentSummary(BaseModel):
    summary: str = Field(..., min_length=1, description="Search intent summary")
    target_audience: str = Field(..., min_length=1, description="Target audience")


class AiArticleKeywordPlanResult(BaseModel):
    primary_keyword: str = Field(..., min_length=1, description="Primary keyword")
    secondary_keywords: List[str] = Field(default_factory=list, description="Supporting keywords")
    long_tail_questions: List[str] = Field(default_factory=list, description="Long-tail question list")
    intent: AiArticleIntentSummary


class AiArticleSerpSummary(BaseModel):
    summary: str = Field(..., min_length=1, description="SERP summary")
    key_patterns: List[str] = Field(default_factory=list, description="Common SERP patterns")
    information_gain: List[str] = Field(default_factory=list, description="Information gain opportunities")
    differentiators: List[str] = Field(default_factory=list, description="Differentiated angles")


class AiArticleHeadingNode(BaseModel):
    level: int = Field(..., ge=1, le=6, description="Heading level")
    text: str = Field(..., min_length=1, description="Heading text")


class AiArticleBrief(BaseModel):
    title_tag: str = Field(..., min_length=1, description="Suggested title tag")
    meta_description: str = Field(..., min_length=1, description="Suggested meta description")
    url_slug: str = Field(..., min_length=1, description="Suggested URL slug")
    heading_tree: List[AiArticleHeadingNode] = Field(default_factory=list, description="Heading tree")
    internal_links: List[str] = Field(default_factory=list, description="Suggested internal links")
    image_alt: List[str] = Field(default_factory=list, description="Suggested image alt text")
    schema_recommendations: List[str] = Field(default_factory=list, description="Suggested schema markup")


class AiArticleDraft(BaseModel):
    title: str = Field(..., min_length=1, description="Draft title")
    summary: str = Field(..., min_length=1, description="Draft summary")
    content: str = Field(..., min_length=1, description="Draft body markdown")
    keywords_used: List[str] = Field(default_factory=list, description="Keywords used in draft")
    blocks: List[AiContentBlock] = Field(default_factory=list, description="Structured content blocks")


class AiArticleOnPage(BaseModel):
    title_tag: str = Field(..., min_length=1, description="Optimized title tag")
    meta_description: str = Field(..., min_length=1, description="Optimized meta description")
    url_slug: str = Field(..., min_length=1, description="Optimized URL slug")
    heading_tree: List[AiArticleHeadingNode] = Field(default_factory=list, description="Optimized heading tree")
    internal_links: List[str] = Field(default_factory=list, description="Internal links placement")
    image_alt: List[str] = Field(default_factory=list, description="Image alt text suggestions")
    schema_recommendations: List[str] = Field(default_factory=list, description="Schema suggestions")
    checklist: List[str] = Field(default_factory=list, description="On-page optimization checklist")


class AiArticleQualityReview(BaseModel):
    verdict: str = Field(..., min_length=1, description="Overall review verdict")
    fluff: str = Field(..., min_length=1, description="Whether fluff is present")
    missing_examples: str = Field(..., min_length=1, description="Whether examples are missing")
    experience_evidence: str = Field(..., min_length=1, description="Whether the draft includes experience or evidence")
    skim_friendly: str = Field(..., min_length=1, description="Whether the draft is scannable")
    strengths: List[str] = Field(default_factory=list, description="Key strengths")
    risks: List[str] = Field(default_factory=list, description="Key weaknesses or risks")
    fixes: List[str] = Field(default_factory=list, description="Recommended fixes")


class AiArticlePublishReviewPlan(BaseModel):
    pre_publish_checks: List[str] = Field(default_factory=list, description="Checks before publish")
    post_publish_metrics: List[str] = Field(default_factory=list, description="Metrics to monitor after publish")
    iteration_ideas: List[str] = Field(default_factory=list, description="Ideas for future iteration")


class AiGenerateArticleResponse(BaseModel):
    keyword_plan: AiArticleKeywordPlanResult
    serp_summary: AiArticleSerpSummary
    brief: AiArticleBrief
    draft: AiArticleDraft
    on_page: AiArticleOnPage
    quality_review: AiArticleQualityReview
    publish_review_plan: AiArticlePublishReviewPlan


class AiGenerateSocialRequest(BaseModel):
    topic: str = Field(..., min_length=1, description="Content topic")
    platform: str = Field(default="twitter", description="Target platform: twitter, linkedin, facebook, instagram, xiaohongshu, weibo")
    tone: str = Field(default="engaging", description="Tone: engaging, professional, humorous, inspirational")
    language: str = Field(default="zh-CN", description="Output language")
    include_hashtags: bool = Field(default=True, description="Whether to include hashtags")
    count: int = Field(default=3, ge=1, le=10, description="Number of variants to generate")


class AiSocialPost(BaseModel):
    content: str
    hashtags: List[str]
    platform: str
    blocks: List[AiContentBlock] = Field(default_factory=list)


class AiGenerateSocialResponse(BaseModel):
    posts: List[AiSocialPost]


class AiRewriteRequest(BaseModel):
    content: str = Field(..., min_length=1, description="Content to rewrite")
    instruction: str = Field(default="", description="Specific rewrite instructions")
    language: str = Field(default="zh-CN", description="Output language")


class AiRewriteResponse(BaseModel):
    result: str


async def _call_ai(system_prompt: str, user_prompt: str) -> str:
    runtime = get_runtime_settings()
    if not runtime.ai_base_url or not runtime.ai_api_key:
        raise HTTPException(
            status_code=400,
            detail=ErrorCode.AI_IS_NOT_CONFIGURED_PLEASE_SET_AI_BASE_URL_AND_AI_API_KEY_IN_ENV,
        )

    base_url = runtime.ai_base_url.rstrip("/")
    endpoint = f"{base_url}/chat/completions"

    request_body = {
        "model": runtime.ai_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {runtime.ai_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(endpoint, headers=headers, json=request_body)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=ErrorCode.AI_REQUEST_FAILED_EXC) from exc

    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail=ErrorCode.AI_RESPONSE_MISSING_CHOICES)

    message = choices[0].get("message") or {}
    return message.get("content", "")


def _extract_json(raw: str) -> Optional[dict]:
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
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _normalize_blocks(blocks: object) -> List[AiContentBlock]:
    if not isinstance(blocks, list):
        return []

    normalized: List[AiContentBlock] = []
    for block in blocks:
        if not isinstance(block, dict):
            continue

        raw_text = block.get("text", "")
        text = str(raw_text).strip() if raw_text is not None else ""

        raw_level = block.get("level")
        level: Optional[int] = None
        if isinstance(raw_level, int) and 1 <= raw_level <= 6:
            level = raw_level

        raw_meta = block.get("meta")
        meta = raw_meta if isinstance(raw_meta, dict) else {}

        normalized.append(AiContentBlock(
            type=str(block.get("type", "paragraph")).strip() or "paragraph",
            text=text,
            level=level,
            meta=meta,
        ))

    return normalized


@router.post("/analyze", response_model=AiAnalyzeResponse)
async def analyze_with_ai(payload: AiAnalyzeRequest):
    runtime = get_runtime_settings()
    if not runtime.ai_base_url or not runtime.ai_api_key:
        raise HTTPException(
            status_code=400,
            detail=ErrorCode.AI_IS_NOT_CONFIGURED_PLEASE_SET_AI_BASE_URL_AND_AI_API_KEY_IN_ENV,
        )

    base_url = runtime.ai_base_url.rstrip("/")
    endpoint = f"{base_url}/chat/completions"

    prompt = (
        "你是SEO专家。请根据以下内容给出简明改进建议，"
        "包括标题、描述、关键词布局、内部链接和可读性。\n\n"
        f"内容:\n{payload.content}"
    )

    request_body = {
        "model": runtime.ai_model,
        "messages": [
            {"role": "system", "content": "你是一名SEO审计助手。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

    headers = {
        "Authorization": f"Bearer {runtime.ai_api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(endpoint, headers=headers, json=request_body)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=ErrorCode.AI_REQUEST_FAILED_EXC) from exc

    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail=ErrorCode.AI_RESPONSE_MISSING_CHOICES)

    message = choices[0].get("message") or {}
    content = message.get("content", "")

    return AiAnalyzeResponse(result=content)


def _default_article_response(payload: AiGenerateArticleRequest) -> AiGenerateArticleResponse:
    fallback_keywords = [payload.keyword_plan.primary_keyword, *payload.keyword_plan.secondary_keywords]
    heading_tree = [AiArticleHeadingNode(level=2, text=item) for item in payload.seo_brief.outline if item.strip()]
    summary = payload.serp_analysis.summary or f"围绕 {payload.topic} 的结构化 SEO 草稿。"

    return AiGenerateArticleResponse(
        keyword_plan=AiArticleKeywordPlanResult(
            primary_keyword=payload.keyword_plan.primary_keyword,
            secondary_keywords=payload.keyword_plan.secondary_keywords,
            long_tail_questions=payload.keyword_plan.long_tail_questions,
            intent=AiArticleIntentSummary(
                summary=payload.seo_brief.intent,
                target_audience=payload.seo_brief.audience,
            ),
        ),
        serp_summary=AiArticleSerpSummary(
            summary=summary,
            key_patterns=[],
            information_gain=[],
            differentiators=[],
        ),
        brief=AiArticleBrief(
            title_tag=payload.seo_brief.metadata.seo_title,
            meta_description=payload.seo_brief.metadata.meta_description,
            url_slug=payload.seo_brief.metadata.slug,
            heading_tree=heading_tree,
            internal_links=payload.seo_brief.internal_links,
            image_alt=[],
            schema_recommendations=[],
        ),
        draft=AiArticleDraft(
            title=payload.seo_brief.metadata.seo_title or payload.topic,
            summary=summary,
            content=f"# {payload.seo_brief.metadata.seo_title or payload.topic}\n",
            keywords_used=[kw for kw in fallback_keywords if kw],
            blocks=[],
        ),
        on_page=AiArticleOnPage(
            title_tag=payload.seo_brief.metadata.seo_title,
            meta_description=payload.seo_brief.metadata.meta_description,
            url_slug=payload.seo_brief.metadata.slug,
            heading_tree=heading_tree,
            internal_links=payload.seo_brief.internal_links,
            image_alt=[],
            schema_recommendations=[],
            checklist=[],
        ),
        quality_review=AiArticleQualityReview(
            verdict="需要人工复核",
            fluff="未评估",
            missing_examples="未评估",
            experience_evidence="未评估",
            skim_friendly="未评估",
            strengths=[],
            risks=[],
            fixes=[],
        ),
        publish_review_plan=AiArticlePublishReviewPlan(
            pre_publish_checks=[],
            post_publish_metrics=[],
            iteration_ideas=[],
        ),
    )



def _build_article_response(raw: str, payload: AiGenerateArticleRequest) -> AiGenerateArticleResponse:
    parsed = _extract_json(raw)
    if parsed is None:
        logger.warning("ai.generate_article.structured_parse_failed", extra={"topic": payload.topic})
        return _default_article_response(payload)

    keyword_plan_data = parsed.get("keyword_plan") if isinstance(parsed.get("keyword_plan"), dict) else {}
    intent_data = keyword_plan_data.get("intent") if isinstance(keyword_plan_data.get("intent"), dict) else {}
    serp_summary_data = parsed.get("serp_summary") if isinstance(parsed.get("serp_summary"), dict) else {}
    brief_data = parsed.get("brief") if isinstance(parsed.get("brief"), dict) else {}
    draft_data = parsed.get("draft") if isinstance(parsed.get("draft"), dict) else {}
    on_page_data = parsed.get("on_page") if isinstance(parsed.get("on_page"), dict) else {}
    quality_review_data = parsed.get("quality_review") if isinstance(parsed.get("quality_review"), dict) else {}
    publish_plan_data = parsed.get("publish_review_plan") if isinstance(parsed.get("publish_review_plan"), dict) else {}

    def _string_list(value: object) -> List[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    def _heading_nodes(value: object) -> List[AiArticleHeadingNode]:
        if not isinstance(value, list):
            return []
        nodes: List[AiArticleHeadingNode] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            level = item.get("level")
            text = str(item.get("text", "")).strip()
            if isinstance(level, int) and 1 <= level <= 6 and text:
                nodes.append(AiArticleHeadingNode(level=level, text=text))
        return nodes

    fallback = _default_article_response(payload)

    return AiGenerateArticleResponse(
        keyword_plan=AiArticleKeywordPlanResult(
            primary_keyword=str(keyword_plan_data.get("primary_keyword") or fallback.keyword_plan.primary_keyword).strip(),
            secondary_keywords=_string_list(keyword_plan_data.get("secondary_keywords")) or fallback.keyword_plan.secondary_keywords,
            long_tail_questions=_string_list(keyword_plan_data.get("long_tail_questions")) or fallback.keyword_plan.long_tail_questions,
            intent=AiArticleIntentSummary(
                summary=str(intent_data.get("summary") or fallback.keyword_plan.intent.summary).strip(),
                target_audience=str(intent_data.get("target_audience") or fallback.keyword_plan.intent.target_audience).strip(),
            ),
        ),
        serp_summary=AiArticleSerpSummary(
            summary=str(serp_summary_data.get("summary") or fallback.serp_summary.summary).strip(),
            key_patterns=_string_list(serp_summary_data.get("key_patterns")),
            information_gain=_string_list(serp_summary_data.get("information_gain")),
            differentiators=_string_list(serp_summary_data.get("differentiators")),
        ),
        brief=AiArticleBrief(
            title_tag=str(brief_data.get("title_tag") or fallback.brief.title_tag).strip(),
            meta_description=str(brief_data.get("meta_description") or fallback.brief.meta_description).strip(),
            url_slug=str(brief_data.get("url_slug") or fallback.brief.url_slug).strip(),
            heading_tree=_heading_nodes(brief_data.get("heading_tree")) or fallback.brief.heading_tree,
            internal_links=_string_list(brief_data.get("internal_links")) or fallback.brief.internal_links,
            image_alt=_string_list(brief_data.get("image_alt")),
            schema_recommendations=_string_list(brief_data.get("schema_recommendations")),
        ),
        draft=AiArticleDraft(
            title=str(draft_data.get("title") or fallback.draft.title).strip(),
            summary=str(draft_data.get("summary") or fallback.draft.summary).strip(),
            content=str(draft_data.get("content") or fallback.draft.content).strip(),
            keywords_used=_string_list(draft_data.get("keywords_used")) or fallback.draft.keywords_used,
            blocks=_normalize_blocks(draft_data.get("blocks")),
        ),
        on_page=AiArticleOnPage(
            title_tag=str(on_page_data.get("title_tag") or brief_data.get("title_tag") or fallback.on_page.title_tag).strip(),
            meta_description=str(on_page_data.get("meta_description") or brief_data.get("meta_description") or fallback.on_page.meta_description).strip(),
            url_slug=str(on_page_data.get("url_slug") or brief_data.get("url_slug") or fallback.on_page.url_slug).strip(),
            heading_tree=_heading_nodes(on_page_data.get("heading_tree")) or _heading_nodes(brief_data.get("heading_tree")) or fallback.on_page.heading_tree,
            internal_links=_string_list(on_page_data.get("internal_links")) or _string_list(brief_data.get("internal_links")) or fallback.on_page.internal_links,
            image_alt=_string_list(on_page_data.get("image_alt")) or _string_list(brief_data.get("image_alt")),
            schema_recommendations=_string_list(on_page_data.get("schema_recommendations")) or _string_list(brief_data.get("schema_recommendations")),
            checklist=_string_list(on_page_data.get("checklist")),
        ),
        quality_review=AiArticleQualityReview(
            verdict=str(quality_review_data.get("verdict") or fallback.quality_review.verdict).strip(),
            fluff=str(quality_review_data.get("fluff") or fallback.quality_review.fluff).strip(),
            missing_examples=str(quality_review_data.get("missing_examples") or fallback.quality_review.missing_examples).strip(),
            experience_evidence=str(quality_review_data.get("experience_evidence") or fallback.quality_review.experience_evidence).strip(),
            skim_friendly=str(quality_review_data.get("skim_friendly") or fallback.quality_review.skim_friendly).strip(),
            strengths=_string_list(quality_review_data.get("strengths")),
            risks=_string_list(quality_review_data.get("risks")),
            fixes=_string_list(quality_review_data.get("fixes")),
        ),
        publish_review_plan=AiArticlePublishReviewPlan(
            pre_publish_checks=_string_list(publish_plan_data.get("pre_publish_checks")),
            post_publish_metrics=_string_list(publish_plan_data.get("post_publish_metrics")),
            iteration_ideas=_string_list(publish_plan_data.get("iteration_ideas")),
        ),
    )


@router.post("/generate-article", response_model=AiGenerateArticleResponse)
async def generate_seo_article(payload: LegacyAiGenerateArticleRequest):
    lang_hint = "请用中文回复。" if payload.language.startswith("zh") else f"Please respond in {payload.language}."
    keywords_str = ", ".join(payload.keywords) if payload.keywords else payload.topic

    system_prompt = (
        "你是一名专业的SEO内容策略师和文案撰写专家。你擅长撰写高质量、搜索引擎优化的文章，"
        "文章结构清晰、关键词布局合理、内容有深度且可读性强。"
        f"{lang_hint}"
    )

    outline_section = f"\n用户自定义大纲:\n{payload.outline}" if payload.outline else ""

    user_prompt = (
        f"请根据以下要求生成一篇高质量SEO文章：\n\n"
        f"主题: {payload.topic}\n"
        f"目标关键词: {keywords_str}\n"
        f"写作风格: {payload.tone}\n"
        f"目标字数: 约{payload.word_count}字\n"
        f"{outline_section}\n\n"
        f"请严格按以下格式输出（不要加额外标记）：\n"
        f"[TITLE]\n文章标题\n"
        f"[META_DESCRIPTION]\n一句话SEO描述（120-160字符）\n"
        f"[KEYWORDS_USED]\n实际使用的关键词，逗号分隔\n"
        f"[CONTENT]\n正文（使用Markdown格式，包含H2/H3标题、段落、列表等）\n\n"
        f"另外，请在末尾附加严格JSON对象（无Markdown代码块、无额外解释），字段必须匹配：\n"
        f"{{\n"
        f"  \"title\": string,\n"
        f"  \"meta_description\": string,\n"
        f"  \"keywords_used\": string[],\n"
        f"  \"content\": string,\n"
        f"  \"blocks\": [{{\"type\": \"heading\"|\"paragraph\"|\"list\"|\"cta\", \"text\": string, \"level\": number|null, \"meta\": object}}]\n"
        f"}}"
    )

    raw = await _call_ai(system_prompt, user_prompt)
    workflow_payload = AiGenerateArticleRequest(
        topic=payload.topic,
        tone=payload.tone,
        language=payload.language,
        word_count=payload.word_count,
        keyword_plan=AiArticleKeywordPlan(
            primary_keyword=payload.topic,
            secondary_keywords=payload.keywords[:5],
            long_tail_questions=[],
        ),
        serp_analysis=AiArticleSerpAnalysis(summary=None, top_results=[]),
        seo_brief=AiArticleSeoBrief(
            audience="通用搜索用户",
            intent="获取与主题相关的完整信息",
            outline=[item.strip() for item in (payload.outline or "").splitlines() if item.strip()] or [payload.topic],
            entities=[],
            internal_links=[],
            cta="继续了解更多相关信息",
            metadata=AiArticleMetadata(
                seo_title=payload.topic,
                meta_description=payload.topic,
                slug=payload.topic.lower().replace(" ", "-"),
            ),
        ),
        workflow=AiArticleWorkflow(
            drafting=AiArticleWorkflowStage(goal="输出完整 SEO 初稿", notes=None),
            on_page_optimization=AiArticleWorkflowStage(goal="补齐基础 on-page 元素", notes=None),
            quality_review=AiArticleWorkflowStage(goal="完成基础质量审校", notes=None),
            retrospective=AiArticleWorkflowStage(goal="给出发布后复盘建议", notes=None),
        ),
    )
    return _build_article_response(raw, workflow_payload)


@router.post("/generate-article-v2", response_model=AiGenerateArticleResponse)
async def generate_seo_article_v2(payload: AiGenerateArticleRequest):
    lang_hint = "请用中文回复。" if payload.language.startswith("zh") else f"Please respond in {payload.language}."
    keyword_plan = payload.keyword_plan
    seo_brief = payload.seo_brief
    serp_rows = "\n".join(
        f"- #{item.rank}: 类型={item.content_type}; 标题角度={item.title_angle}; 结构={item.structure}; 字数={item.word_count}; 内容缺口={item.content_gap}"
        for item in payload.serp_analysis.top_results
    )
    outline_rows = "\n".join(f"- {item}" for item in seo_brief.outline)
    entity_rows = ", ".join(seo_brief.entities) or "无"
    internal_link_rows = "\n".join(f"- {item}" for item in seo_brief.internal_links) or "- 无"
    long_tail_rows = "\n".join(f"- {item}" for item in keyword_plan.long_tail_questions) or "- 无"

    system_prompt = (
        "你是一名资深 SEO 内容总监与编辑主管。你必须把关键词规划、SERP 洞察、SEO brief、正文初稿、on-page 优化、质量审校、发布复盘全部整理成结构化 JSON。"
        f"{lang_hint}"
    )

    user_prompt = (
        f"请根据以下结构化工作流生成 SEO 文章方案与初稿。\n\n"
        f"[文章主题]\n{payload.topic}\n\n"
        f"[关键词规划]\n"
        f"主关键词: {keyword_plan.primary_keyword}\n"
        f"次关键词: {', '.join(keyword_plan.secondary_keywords)}\n"
        f"长尾问题:\n{long_tail_rows}\n\n"
        f"[SERP 分析]\n"
        f"总结: {payload.serp_analysis.summary or '无'}\n"
        f"前10名观察:\n{serp_rows or '- 无'}\n\n"
        f"[SEO Brief]\n"
        f"Audience: {seo_brief.audience}\n"
        f"Intent: {seo_brief.intent}\n"
        f"Outline:\n{outline_rows}\n"
        f"Entities: {entity_rows}\n"
        f"Internal Links:\n{internal_link_rows}\n"
        f"CTA: {seo_brief.cta}\n"
        f"Metadata: SEO标题={seo_brief.metadata.seo_title}; Meta描述={seo_brief.metadata.meta_description}; Slug={seo_brief.metadata.slug}\n\n"
        f"[执行工作流]\n"
        f"初稿生成目标: {payload.workflow.drafting.goal}\n"
        f"初稿备注: {payload.workflow.drafting.notes or '无'}\n"
        f"On-page 优化目标: {payload.workflow.on_page_optimization.goal}\n"
        f"On-page 备注: {payload.workflow.on_page_optimization.notes or '无'}\n"
        f"质量审校目标: {payload.workflow.quality_review.goal}\n"
        f"质量审校备注: {payload.workflow.quality_review.notes or '无'}\n"
        f"复盘记录目标: {payload.workflow.retrospective.goal}\n"
        f"复盘备注: {payload.workflow.retrospective.notes or '无'}\n\n"
        f"[输出要求]\n"
        f"- 文风: {payload.tone}\n"
        f"- 目标字数: 约{payload.word_count}字\n"
        f"- draft.content 使用 Markdown，需包含清晰的 H2/H3、列表、示例、CTA。\n"
        f"- 你必须分别输出以下内容：\n"
        f"  1. 搜索意图摘要与目标读者。\n"
        f"  2. 信息增量与差异化角度。\n"
        f"  3. title tag、meta description、URL slug、heading tree、internal links、image alt、schema 建议。\n"
        f"  4. 质量审校结论：是否有废话、是否缺例子、是否有经验/证据、是否适合扫读。\n"
        f"- 只输出一个严格 JSON 对象，不要使用 Markdown 代码块，不要添加任何额外解释。\n"
        f"- JSON 字段必须精确匹配以下结构：\n"
        f"{{\n"
        f"  \"keyword_plan\": {{\n"
        f"    \"primary_keyword\": string,\n"
        f"    \"secondary_keywords\": string[],\n"
        f"    \"long_tail_questions\": string[],\n"
        f"    \"intent\": {{\"summary\": string, \"target_audience\": string}}\n"
        f"  }},\n"
        f"  \"serp_summary\": {{\n"
        f"    \"summary\": string,\n"
        f"    \"key_patterns\": string[],\n"
        f"    \"information_gain\": string[],\n"
        f"    \"differentiators\": string[]\n"
        f"  }},\n"
        f"  \"brief\": {{\n"
        f"    \"title_tag\": string,\n"
        f"    \"meta_description\": string,\n"
        f"    \"url_slug\": string,\n"
        f"    \"heading_tree\": [{{\"level\": number, \"text\": string}}],\n"
        f"    \"internal_links\": string[],\n"
        f"    \"image_alt\": string[],\n"
        f"    \"schema_recommendations\": string[]\n"
        f"  }},\n"
        f"  \"draft\": {{\n"
        f"    \"title\": string,\n"
        f"    \"summary\": string,\n"
        f"    \"content\": string,\n"
        f"    \"keywords_used\": string[],\n"
        f"    \"blocks\": [{{\"type\": \"heading\"|\"paragraph\"|\"list\"|\"cta\", \"text\": string, \"level\": number|null, \"meta\": object}}]\n"
        f"  }},\n"
        f"  \"on_page\": {{\n"
        f"    \"title_tag\": string,\n"
        f"    \"meta_description\": string,\n"
        f"    \"url_slug\": string,\n"
        f"    \"heading_tree\": [{{\"level\": number, \"text\": string}}],\n"
        f"    \"internal_links\": string[],\n"
        f"    \"image_alt\": string[],\n"
        f"    \"schema_recommendations\": string[],\n"
        f"    \"checklist\": string[]\n"
        f"  }},\n"
        f"  \"quality_review\": {{\n"
        f"    \"verdict\": string,\n"
        f"    \"fluff\": string,\n"
        f"    \"missing_examples\": string,\n"
        f"    \"experience_evidence\": string,\n"
        f"    \"skim_friendly\": string,\n"
        f"    \"strengths\": string[],\n"
        f"    \"risks\": string[],\n"
        f"    \"fixes\": string[]\n"
        f"  }},\n"
        f"  \"publish_review_plan\": {{\n"
        f"    \"pre_publish_checks\": string[],\n"
        f"    \"post_publish_metrics\": string[],\n"
        f"    \"iteration_ideas\": string[]\n"
        f"  }}\n"
        f"}}"
    )

    raw = await _call_ai(system_prompt, user_prompt)
    return _build_article_response(raw, payload)


@router.post("/generate-social", response_model=AiGenerateSocialResponse)
async def generate_social_content(payload: AiGenerateSocialRequest):
    lang_hint = "请用中文回复。" if payload.language.startswith("zh") else f"Please respond in {payload.language}."

    platform_guides = {
        "twitter": "推特/X：限制280字符，简洁有力，善用热门话题标签",
        "linkedin": "领英：专业商务风格，200-300字为佳，突出行业价值",
        "facebook": "Facebook：互动性强，可稍长，鼓励评论转发",
        "instagram": "Instagram：视觉导向文案，使用更多表情符号和标签",
        "xiaohongshu": "小红书：种草风格，口语化，善用emoji和标签，真实分享感",
        "weibo": "微博：140字精炼，话题标签#话题#格式，互动引导",
    }

    platform_guide = platform_guides.get(payload.platform, f"{payload.platform}平台的最佳实践")

    system_prompt = (
        "你是一名资深社交媒体内容运营专家，擅长为不同平台创作引人注目的内容。"
        f"{lang_hint}"
    )

    user_prompt = (
        f"请为以下主题生成{payload.count}条社交媒体内容：\n\n"
        f"主题: {payload.topic}\n"
        f"平台: {payload.platform}\n"
        f"平台特点: {platform_guide}\n"
        f"语气风格: {payload.tone}\n"
        f"包含标签: {'是' if payload.include_hashtags else '否'}\n\n"
        f"请严格按以下格式输出每条内容（用 --- 分隔不同条目）：\n"
        f"[POST]\n内容文本\n"
        f"[HASHTAGS]\n标签1, 标签2, 标签3\n---"
        f"\n\n另外在末尾附加严格JSON对象（无Markdown代码块、无额外解释），字段必须匹配：\n"
        f"{{\n"
        f"  \"posts\": [\n"
        f"    {{\n"
        f"      \"content\": string,\n"
        f"      \"platform\": string,\n"
        f"      \"hashtags\": string[],\n"
        f"      \"blocks\": [{{\"type\": \"heading\"|\"paragraph\"|\"list\"|\"cta\"|\"hashtag\", \"text\": string, \"level\": number|null, \"meta\": object}}]\n"
        f"    }}\n"
        f"  ]\n"
        f"}}"
    )

    raw = await _call_ai(system_prompt, user_prompt)

    posts: List[AiSocialPost] = []
    entries = [e.strip() for e in raw.split("---") if e.strip()]

    for entry in entries:
        post_content = entry
        hashtags: List[str] = []

        if "[POST]" in entry:
            parts = entry.split("[POST]", 1)
            rest = parts[1] if len(parts) > 1 else parts[0]

            if "[HASHTAGS]" in rest:
                post_text, tag_text = rest.split("[HASHTAGS]", 1)
                post_content = post_text.strip()
                hashtags = [t.strip().lstrip("#") for t in tag_text.strip().split(",") if t.strip()]
            else:
                post_content = rest.strip()
        elif "[HASHTAGS]" in entry:
            post_text, tag_text = entry.split("[HASHTAGS]", 1)
            post_content = post_text.strip()
            hashtags = [t.strip().lstrip("#") for t in tag_text.strip().split(",") if t.strip()]

        if post_content:
            posts.append(AiSocialPost(
                content=post_content,
                hashtags=hashtags,
                platform=payload.platform,
            ))

    parsed = _extract_json(raw)
    if parsed is not None and isinstance(parsed.get("posts"), list):
        parsed_posts: List[AiSocialPost] = []
        for item in parsed.get("posts", []):
            if not isinstance(item, dict):
                continue
            post_content = str(item.get("content", "")).strip()
            if not post_content:
                continue
            parsed_posts.append(AiSocialPost(
                content=post_content,
                hashtags=[str(t).strip().lstrip("#") for t in item.get("hashtags", []) if str(t).strip()],
                platform=str(item.get("platform") or payload.platform),
                blocks=_normalize_blocks(item.get("blocks")),
            ))
        if parsed_posts:
            posts = parsed_posts
        else:
            logger.warning("ai.generate_social.structured_posts_empty", extra={"topic": payload.topic, "platform": payload.platform})
    else:
        logger.warning("ai.generate_social.structured_parse_failed", extra={"topic": payload.topic, "platform": payload.platform})

    if not posts:
        posts.append(AiSocialPost(content=raw, hashtags=[], platform=payload.platform, blocks=[]))

    return AiGenerateSocialResponse(posts=posts)


@router.post("/rewrite", response_model=AiRewriteResponse)
async def rewrite_content(payload: AiRewriteRequest):
    lang_hint = "请用中文回复。" if payload.language.startswith("zh") else f"Please respond in {payload.language}."

    system_prompt = (
        "你是一名专业的内容编辑和SEO优化专家。"
        "请根据用户的指令改写内容，保持核心信息不变，提升可读性和SEO效果。"
        f"{lang_hint}"
    )

    instruction = payload.instruction or "请优化以下内容，使其更具可读性和SEO友好性"

    user_prompt = (
        f"改写指令: {instruction}\n\n"
        f"原始内容:\n{payload.content}\n\n"
        f"请直接输出改写后的内容，不需要额外解释。"
    )

    result = await _call_ai(system_prompt, user_prompt)
    return AiRewriteResponse(result=result)
