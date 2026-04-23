from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from app.api.endpoints import ai as ai_endpoints
from app.content_orchestration_service import content_orchestration_service


class AiCommandError(ValueError):
    """Raised when an AI command has invalid input."""


@dataclass
class AiCommandResult:
    command: str
    status: str
    output: Any
    next_actions: list[str]


Handler = Callable[[int, dict[str, Any], dict[str, Any]], Awaitable[AiCommandResult]]


class AiCommandRouterService:
    def __init__(self) -> None:
        self._registry: dict[str, Handler] = {
            "/research": self._handle_research,
            "/write": self._handle_write,
            "/rewrite": self._handle_rewrite,
            "/analyze-existing": self._handle_analyze_existing,
            "/optimize": self._handle_optimize,
            "/performance-review": self._handle_performance_review,
            "/publish-draft": self._handle_publish_draft,
            "/article": self._handle_article,
            "/priorities": self._handle_priorities,
        }

    @property
    def commands(self) -> list[str]:
        return sorted(self._registry.keys())

    async def execute(
        self,
        *,
        project_id: int,
        command: str,
        payload: dict[str, Any],
        context: dict[str, Any],
    ) -> AiCommandResult:
        normalized_command = command.strip()
        if normalized_command not in self._registry:
            raise AiCommandError(f"unsupported_command:{normalized_command}")
        return await self._registry[normalized_command](project_id, payload, context)

    async def _handle_research(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        seed_term = str(payload.get("seed_term") or context.get("topic") or "").strip()
        if not seed_term:
            raise AiCommandError("/research requires payload.seed_term or context.topic")
        locale = str(payload.get("locale") or context.get("language") or "zh-CN")
        market = str(payload.get("market") or context.get("market") or "us")
        limit = int(payload.get("limit") or 20)
        output = content_orchestration_service.suggest_keywords(seed_term=seed_term, locale=locale, market=market, limit=limit)
        return AiCommandResult(
            command="/research",
            status="success",
            output={"project_id": project_id, **output},
            next_actions=["/write", "/article"],
        )

    async def _handle_write(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        topic = str(payload.get("topic") or context.get("topic") or "").strip()
        if not topic:
            raise AiCommandError("/write requires payload.topic or context.topic")
        language = str(payload.get("language") or context.get("language") or "zh-CN")
        tone = str(payload.get("tone") or context.get("tone") or "professional")
        result = await ai_endpoints.rewrite_content(
            ai_endpoints.AiRewriteRequest(
                content=f"请生成与“{topic}”相关的 SEO 草稿大纲与首版文案。",
                instruction=f"语气：{tone}；语言：{language}",
                language=language,
            )
        )
        return AiCommandResult(
            command="/write",
            status="success",
            output={"project_id": project_id, "draft": result.result},
            next_actions=["/rewrite", "/optimize", "/publish-draft"],
        )

    async def _handle_rewrite(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        content = str(payload.get("content") or "").strip()
        if not content:
            raise AiCommandError("/rewrite requires payload.content")
        result = await ai_endpoints.rewrite_content(
            ai_endpoints.AiRewriteRequest(
                content=content,
                instruction=str(payload.get("instruction") or context.get("instruction") or ""),
                language=str(payload.get("language") or context.get("language") or "zh-CN"),
            )
        )
        return AiCommandResult(
            command="/rewrite",
            status="success",
            output={"project_id": project_id, "rewritten": result.result},
            next_actions=["/optimize", "/publish-draft"],
        )

    async def _handle_analyze_existing(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        content = str(payload.get("content") or context.get("content") or "").strip()
        if not content:
            raise AiCommandError("/analyze-existing requires payload.content or context.content")
        result = await ai_endpoints.analyze_with_ai(ai_endpoints.AiAnalyzeRequest(content=content))
        return AiCommandResult(
            command="/analyze-existing",
            status="success",
            output={"project_id": project_id, "analysis": result.result},
            next_actions=["/rewrite", "/optimize"],
        )

    async def _handle_optimize(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        content = str(payload.get("content") or "").strip()
        if not content:
            raise AiCommandError("/optimize requires payload.content")
        language = str(payload.get("language") or context.get("language") or "zh-CN")
        result = await ai_endpoints.rewrite_content(
            ai_endpoints.AiRewriteRequest(
                content=content,
                instruction="优化可读性、关键词覆盖和内部链接提示。",
                language=language,
            )
        )
        return AiCommandResult(
            command="/optimize",
            status="success",
            output={"project_id": project_id, "optimized": result.result},
            next_actions=["/publish-draft", "/performance-review"],
        )

    async def _handle_performance_review(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        retrospective = {
            "window": str(payload.get("window") or context.get("window") or "30d"),
            "note": "请在草稿保存并发布后使用 /ai/projects/{project_id}/ai-drafts/{draft_id}/retrospective 获取真实表现。",
        }
        return AiCommandResult(
            command="/performance-review",
            status="success",
            output={"project_id": project_id, "retrospective": retrospective},
            next_actions=["/priorities"],
        )

    async def _handle_publish_draft(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        title = str(payload.get("title") or context.get("title") or "").strip()
        if not title:
            raise AiCommandError("/publish-draft requires payload.title or context.title")
        return AiCommandResult(
            command="/publish-draft",
            status="success",
            output={"project_id": project_id, "title": title, "status": "ready_for_manual_publish"},
            next_actions=["/performance-review", "/priorities"],
        )

    async def _handle_article(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        topic = str(payload.get("topic") or context.get("topic") or "").strip()
        if not topic:
            raise AiCommandError("/article requires payload.topic or context.topic")

        locale = str(payload.get("locale") or context.get("language") or "zh-CN")
        market = str(payload.get("market") or context.get("market") or "us")
        keyword_plan = content_orchestration_service.suggest_keywords(seed_term=topic, locale=locale, market=market, limit=20)
        serp_analysis = content_orchestration_service.analyze_serp(term=keyword_plan.get("primary_keyword") or topic, locale=locale, market=market, limit=10)
        return AiCommandResult(
            command="/article",
            status="success",
            output={
                "project_id": project_id,
                "keyword_plan": keyword_plan,
                "serp_analysis": serp_analysis,
            },
            next_actions=["/write", "/optimize"],
        )

    async def _handle_priorities(self, project_id: int, payload: dict[str, Any], context: dict[str, Any]) -> AiCommandResult:
        focus = payload.get("focus") or context.get("focus") or ["流量", "转化", "内容质量"]
        focus_list = [str(item).strip() for item in (focus if isinstance(focus, list) else [focus]) if str(item).strip()]
        if not focus_list:
            raise AiCommandError("/priorities requires non-empty focus list")
        output = {
            "project_id": project_id,
            "priorities": [
                {"rank": index + 1, "item": item}
                for index, item in enumerate(focus_list)
            ],
        }
        return AiCommandResult(
            command="/priorities",
            status="success",
            output=output,
            next_actions=["/research", "/article"],
        )


ai_command_router_service = AiCommandRouterService()
