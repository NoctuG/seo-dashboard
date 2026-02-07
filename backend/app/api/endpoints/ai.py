from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx

from app.config import settings

router = APIRouter()


class AiAnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, description="SEO content to analyze")


class AiAnalyzeResponse(BaseModel):
    result: str


@router.post("/analyze", response_model=AiAnalyzeResponse)
async def analyze_with_ai(payload: AiAnalyzeRequest):
    if not settings.AI_BASE_URL or not settings.AI_API_KEY:
        raise HTTPException(
            status_code=400,
            detail="AI is not configured. Please set AI_BASE_URL and AI_API_KEY in .env",
        )

    base_url = settings.AI_BASE_URL.rstrip("/")
    endpoint = f"{base_url}/chat/completions"

    prompt = (
        "你是SEO专家。请根据以下内容给出简明改进建议，"
        "包括标题、描述、关键词布局、内部链接和可读性。\n\n"
        f"内容:\n{payload.content}"
    )

    request_body = {
        "model": settings.AI_MODEL,
        "messages": [
            {"role": "system", "content": "你是一名SEO审计助手。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

    headers = {
        "Authorization": f"Bearer {settings.AI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(endpoint, headers=headers, json=request_body)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"AI request failed: {exc}") from exc

    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(status_code=502, detail="AI response missing choices")

    message = choices[0].get("message") or {}
    content = message.get("content", "")

    return AiAnalyzeResponse(result=content)
