from __future__ import annotations

from pydantic import BaseModel, Field

from app.ai_agents.base import AgentRunResult, AgentTool, AgentType, BaseAgent
from app.content_orchestration_service import content_orchestration_service


class SerpStrategistInput(BaseModel):
    term: str = Field(..., min_length=1)
    locale: str = "zh-CN"
    market: str = "us"
    limit: int = Field(default=10, ge=1, le=10)


class SerpStrategistOutput(AgentRunResult):
    raw_output: dict[str, object]


class SerpStrategistAgent(BaseAgent):
    agent_type = AgentType.SERP_STRATEGIST
    input_schema = SerpStrategistInput
    output_schema = SerpStrategistOutput
    system_prompt_template = "你是 SERP 洞察分析师，请输出竞争格局、风险和下一步动作。"
    tools = [AgentTool.SERP]

    @classmethod
    async def run(cls, task: dict[str, object]) -> SerpStrategistOutput:
        payload = cls.input_schema.model_validate(task)
        result = content_orchestration_service.analyze_serp(
            term=payload.term,
            locale=payload.locale,
            market=payload.market,
            limit=payload.limit,
        )
        return cls.output_schema(
            suggestions=[
                result.get("summary", ""),
                *[f"内容模式：{item}" for item in result.get("patterns", [])[:3]],
            ],
            risks=["SERP 页面形态可能快速变化，建议发布前再次抓取前 10 结果。"],
            action_items=[
                "优先覆盖高频结构特征并加入差异化案例。",
                "根据 content_gaps 补齐未被覆盖的疑问。",
            ],
            raw_output=result,
        )
