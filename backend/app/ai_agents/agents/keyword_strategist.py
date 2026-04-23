from __future__ import annotations

from pydantic import BaseModel, Field

from app.ai_agents.base import AgentRunResult, AgentTool, AgentType, BaseAgent
from app.content_orchestration_service import content_orchestration_service


class KeywordStrategistInput(BaseModel):
    seed_term: str = Field(..., min_length=1)
    locale: str = "zh-CN"
    market: str = "us"
    limit: int = Field(default=20, ge=5, le=50)


class KeywordStrategistOutput(AgentRunResult):
    raw_output: dict[str, object]


class KeywordStrategistAgent(BaseAgent):
    agent_type = AgentType.KEYWORD_STRATEGIST
    input_schema = KeywordStrategistInput
    output_schema = KeywordStrategistOutput
    system_prompt_template = "你是关键词规划专家，请输出可执行建议、风险和行动项。"
    tools = [AgentTool.KEYWORD]

    @classmethod
    async def run(cls, task: dict[str, object]) -> KeywordStrategistOutput:
        payload = cls.input_schema.model_validate(task)
        result = content_orchestration_service.suggest_keywords(
            seed_term=payload.seed_term,
            locale=payload.locale,
            market=payload.market,
            limit=payload.limit,
        )
        return cls.output_schema(
            suggestions=[
                f"主关键词：{result.get('primary_keyword') or payload.seed_term}",
                *[f"次关键词：{item}" for item in result.get("secondary_keywords", [])[:3]],
            ],
            risks=["关键词意图可能混合，需在正文中分段覆盖信息型与交易型需求。"],
            action_items=[
                "确认主关键词是否与落地页搜索意图一致。",
                "将长尾问题映射到 H2/H3，并分配示例段落。",
            ],
            raw_output=result,
        )
