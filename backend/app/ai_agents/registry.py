from __future__ import annotations

from collections.abc import Iterable

from app.ai_agents.base import AgentType, BaseAgent
from app.ai_agents.agents.draft_strategist import DraftStrategistAgent
from app.ai_agents.agents.keyword_strategist import KeywordStrategistAgent
from app.ai_agents.agents.retrospective_analyst import RetrospectiveAnalystAgent
from app.ai_agents.agents.serp_strategist import SerpStrategistAgent


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: dict[AgentType, type[BaseAgent]] = {}

    def register(self, agent_cls: type[BaseAgent]) -> None:
        self._agents[agent_cls.agent_type] = agent_cls

    def get(self, agent_type: AgentType) -> type[BaseAgent] | None:
        return self._agents.get(agent_type)

    def list_agent_types(self) -> Iterable[AgentType]:
        return self._agents.keys()


agent_registry = AgentRegistry()
for _agent in (KeywordStrategistAgent, SerpStrategistAgent, DraftStrategistAgent, RetrospectiveAnalystAgent):
    agent_registry.register(_agent)
