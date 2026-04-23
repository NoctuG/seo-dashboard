from __future__ import annotations

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, ClassVar

from pydantic import BaseModel

from app.models import ProjectRoleType


class AgentType(str, Enum):
    KEYWORD_STRATEGIST = "keyword_strategist"
    SERP_STRATEGIST = "serp_strategist"
    DRAFT_STRATEGIST = "draft_strategist"
    RETROSPECTIVE_ANALYST = "retrospective_analyst"


class AgentTool(str, Enum):
    KEYWORD = "keyword"
    SERP = "serp"
    DRAFT = "draft"
    RETROSPECTIVE = "retrospective"


class AgentRunResult(BaseModel):
    suggestions: list[str]
    risks: list[str]
    action_items: list[str]
    raw_output: dict[str, Any] | None = None


class BaseAgent(ABC):
    agent_type: ClassVar[AgentType]
    input_schema: ClassVar[type[BaseModel]]
    output_schema: ClassVar[type[BaseModel]]
    system_prompt_template: ClassVar[str]
    tools: ClassVar[list[AgentTool]]
    required_role: ClassVar[ProjectRoleType] = ProjectRoleType.VIEWER

    @classmethod
    @abstractmethod
    async def run(cls, task: dict[str, Any]) -> BaseModel:
        raise NotImplementedError
