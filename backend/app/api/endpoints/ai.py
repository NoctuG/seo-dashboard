from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import httpx

from app.core.error_codes import ErrorCode
from app.runtime_settings import get_runtime_settings

router = APIRouter()


class AiAnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, description="SEO content to analyze")


class AiAnalyzeResponse(BaseModel):
    result: str


class AiGenerateArticleRequest(BaseModel):
    topic: str = Field(..., min_length=1, description="Article topic or main keyword")
    keywords: List[str] = Field(default_factory=list, description="Target SEO keywords")
    tone: str = Field(default="professional", description="Writing tone: professional, casual, authoritative, friendly")
    language: str = Field(default="zh-CN", description="Output language")
    word_count: int = Field(default=1500, ge=300, le=5000, description="Target word count")
    outline: Optional[str] = Field(default=None, description="Custom article outline")


class AiGenerateArticleResponse(BaseModel):
    title: str
    content: str
    meta_description: str
    keywords_used: List[str]


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


@router.post("/generate-article", response_model=AiGenerateArticleResponse)
async def generate_seo_article(payload: AiGenerateArticleRequest):
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
        f"[CONTENT]\n正文（使用Markdown格式，包含H2/H3标题、段落、列表等）"
    )

    raw = await _call_ai(system_prompt, user_prompt)

    title = ""
    meta_description = ""
    keywords_used: List[str] = []
    content = raw

    if "[TITLE]" in raw:
        parts = raw.split("[TITLE]")
        rest = parts[-1] if len(parts) > 1 else parts[0]

        if "[META_DESCRIPTION]" in rest:
            title_part, rest = rest.split("[META_DESCRIPTION]", 1)
            title = title_part.strip()
        if "[KEYWORDS_USED]" in rest:
            meta_part, rest = rest.split("[KEYWORDS_USED]", 1)
            meta_description = meta_part.strip()
        if "[CONTENT]" in rest:
            kw_part, content_part = rest.split("[CONTENT]", 1)
            keywords_used = [k.strip() for k in kw_part.strip().split(",") if k.strip()]
            content = content_part.strip()
        else:
            content = rest.strip()

    if not title:
        lines = content.split("\n")
        title = lines[0].lstrip("# ").strip() if lines else payload.topic

    return AiGenerateArticleResponse(
        title=title,
        content=content,
        meta_description=meta_description or title,
        keywords_used=keywords_used or payload.keywords,
    )


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

    if not posts:
        posts.append(AiSocialPost(content=raw, hashtags=[], platform=payload.platform))

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
