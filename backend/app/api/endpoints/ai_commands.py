from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.ai_command_router_service import AiCommandError, ai_command_router_service

router = APIRouter()


class AiCommandExecuteRequest(BaseModel):
    project_id: int = Field(..., gt=0)
    command: str = Field(..., min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class AiCommandExecuteResponse(BaseModel):
    command: str
    status: str
    output: Any
    next_actions: list[str]


@router.post("/commands/execute", response_model=AiCommandExecuteResponse)
async def execute_ai_command(payload: AiCommandExecuteRequest):
    try:
        result = await ai_command_router_service.execute(
            project_id=payload.project_id,
            command=payload.command,
            payload=payload.payload,
            context=payload.context,
        )
    except AiCommandError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return AiCommandExecuteResponse(**result.__dict__)
