from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.ai_agents.base import AgentRunResult, AgentTool, AgentType, BaseAgent
from app.models import ProjectRoleType
from app.content_orchestration_service import content_orchestration_service


class DraftStrategistInput(BaseModel):
    payload: dict[str, Any] = Field(default_factory=dict)


class DraftStrategistOutput(AgentRunResult):
    raw_output: dict[str, object]


class DraftStrategistAgent(BaseAgent):
    agent_type = AgentType.DRAFT_STRATEGIST
    input_schema = DraftStrategistInput
    output_schema = DraftStrategistOutput
    system_prompt_template = "你是内容执行主编，请给出草稿生成建议、风险和落地动作。"
    tools = [AgentTool.DRAFT]
    required_role = ProjectRoleType.ADMIN

    @classmethod
    async def run(cls, task: dict[str, object]) -> DraftStrategistOutput:
        payload = cls.input_schema.model_validate(task)
        result = await content_orchestration_service.generate_draft_package(payload.payload)
        return cls.output_schema(
            suggestions=[
                f"草稿标题：{((result.get('draft') or {}) if isinstance(result.get('draft'), dict) else {}).get('title', '未返回标题')}",
                "已生成 on-page 与质量审校建议，可直接进入编辑。",
            ],
            risks=["草稿为 AI 生成内容，发布前需完成人工事实核验与品牌审校。"],
            action_items=[
                "先执行 quality_review.fixes，再进入发布检查。",
                "将关键术语与内部链接补齐后再提交审批。",
            ],
            raw_output=result,
        )
