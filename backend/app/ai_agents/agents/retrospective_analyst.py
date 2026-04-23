from __future__ import annotations

from pydantic import BaseModel, Field

from app.ai_agents.base import AgentRunResult, AgentTool, AgentType, BaseAgent


class RetrospectiveAnalystInput(BaseModel):
    retrospective: dict = Field(default_factory=dict)


class RetrospectiveAnalystOutput(AgentRunResult):
    raw_output: dict[str, object]


class RetrospectiveAnalystAgent(BaseAgent):
    agent_type = AgentType.RETROSPECTIVE_ANALYST
    input_schema = RetrospectiveAnalystInput
    output_schema = RetrospectiveAnalystOutput
    system_prompt_template = "你是 SEO 复盘分析师，请聚焦增长机会、风险和迭代行动。"
    tools = [AgentTool.RETROSPECTIVE]

    @classmethod
    async def run(cls, task: dict[str, object]) -> RetrospectiveAnalystOutput:
        payload = cls.input_schema.model_validate(task)
        retro = payload.retrospective
        insights = retro.get("insights") if isinstance(retro, dict) else []
        safe_insights = insights if isinstance(insights, list) else []

        return cls.output_schema(
            suggestions=[str(item) for item in safe_insights[:3]] or ["暂无复盘洞察，请先加载复盘数据。"],
            risks=["复盘样本窗口较短时，结论可能受短期波动影响。"],
            action_items=[
                "固定每周复盘窗口，追踪平均排名与转化率变化。",
                "将衰减页面加入下一轮内容更新队列。",
            ],
            raw_output=retro if isinstance(retro, dict) else {},
        )
