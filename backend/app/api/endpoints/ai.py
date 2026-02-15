from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
import httpx

from app.core.error_codes import ErrorCode
from app.runtime_settings import get_runtime_settings

router = APIRouter()


class AiAnalyzeRequest(BaseModel):
    content: str = Field(..., min_length=1, description="SEO content to analyze")


class AiAnalyzeResponse(BaseModel):
    result: str


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
