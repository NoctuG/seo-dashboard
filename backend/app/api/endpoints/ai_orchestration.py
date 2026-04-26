from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from app.ai_agents import AgentType, agent_registry
from app.api.deps import get_current_user, require_project_role
from app.content_orchestration_service import content_orchestration_service
from app.core.error_codes import ErrorCode
from app.db import get_session
from app.marketing_skills_service import MarketingSkill, marketing_skills_service
from app.models import Project, ProjectMember, ProjectRoleType, Role, User

router = APIRouter()


class KeywordSuggestionMetric(BaseModel):
    keyword: str
    search_volume: int
    cpc: float
    difficulty: float
    intent: str


class KeywordSuggestionRequest(BaseModel):
    seed_term: str = Field(..., min_length=1)
    locale: str = "zh-CN"
    market: str = "us"
    limit: int = Field(default=20, ge=5, le=50)


class KeywordSuggestionResponse(BaseModel):
    provider: str
    primary_keyword: str
    secondary_keywords: list[str]
    long_tail_questions: list[str]
    supporting_metrics: list[KeywordSuggestionMetric]
    intent_signals: list[str]


class SerpResearchRequest(BaseModel):
    term: str = Field(..., min_length=1)
    locale: str = "zh-CN"
    market: str = "us"
    limit: int = Field(default=10, ge=1, le=10)


class SerpResearchItem(BaseModel):
    rank: int
    title: str
    url: str
    content_type: str
    title_angle: str
    structure: str
    structure_features: list[str]
    word_count: int
    word_count_range: str
    content_gap: str


class SerpResearchResponse(BaseModel):
    summary: str
    top_results: list[SerpResearchItem]
    patterns: list[str]
    title_angles: list[str]
    structure_features: list[str]
    content_gaps: list[str]


class ArticleKeywordPlanInput(BaseModel):
    primary_keyword: str
    secondary_keywords: list[str] = Field(default_factory=list)
    long_tail_questions: list[str] = Field(default_factory=list)


class ArticleSerpEntryInput(BaseModel):
    rank: int
    content_type: str
    title_angle: str
    structure: str
    word_count: int
    content_gap: str


class ArticleSerpAnalysisInput(BaseModel):
    summary: str | None = None
    top_results: list[ArticleSerpEntryInput] = Field(default_factory=list)


class BriefGenerationRequest(BaseModel):
    project_id: int | None = None
    topic: str = Field(..., min_length=1)
    tone: str = "professional"
    language: str = "zh-CN"
    target_word_count: int = Field(default=1500, ge=300, le=5000)
    keyword_plan: ArticleKeywordPlanInput
    serp_analysis: ArticleSerpAnalysisInput


class BriefMetadata(BaseModel):
    seo_title: str
    meta_description: str
    slug: str


class WorkflowStageOutput(BaseModel):
    goal: str
    notes: str


class BriefGenerationResponse(BaseModel):
    audience: str
    intent: str
    outline: list[str]
    entities: list[str]
    internal_links: list[str]
    cta: str
    metadata: BriefMetadata
    execution: dict[str, WorkflowStageOutput]
    live_context: dict[str, Any] | None = None


class RetrospectiveRequest(BaseModel):
    window: str = Field(default="30d", pattern="^(7d|30d|90d)$")


class RetrospectiveResponse(BaseModel):
    target_url: str | None
    publication_status: str
    content_performance: dict[str, Any] | None
    ranking: dict[str, Any] | None
    traffic: dict[str, Any] | None
    insights: list[str]
    live_context: dict[str, Any] | None = None


class AgentRunRequest(BaseModel):
    project_id: int | None = None
    agent_type: AgentType
    task: dict[str, Any] = Field(default_factory=dict)


class AgentRunResponse(BaseModel):
    agent_type: AgentType
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    system_prompt_template: str
    tools: list[str]
    result: dict[str, Any]


class MarketingSkillsApplyRequest(BaseModel):
    skill_id: str = Field(..., min_length=1)
    context: dict[str, Any] = Field(default_factory=dict)


class MarketingSkillsApplyResponse(BaseModel):
    skill: MarketingSkill
    context: dict[str, Any]
    injected_prompt: str
    output_format: list[str]
    quality_checklist: list[str]


@router.post("/content-orchestration/keyword-suggestions", response_model=KeywordSuggestionResponse)
def get_keyword_suggestions(payload: KeywordSuggestionRequest):
    return content_orchestration_service.suggest_keywords(
        seed_term=payload.seed_term,
        locale=payload.locale,
        market=payload.market,
        limit=payload.limit,
    )


@router.post("/content-orchestration/serp-analysis", response_model=SerpResearchResponse)
def get_serp_analysis(payload: SerpResearchRequest):
    return content_orchestration_service.analyze_serp(
        term=payload.term,
        locale=payload.locale,
        market=payload.market,
        limit=payload.limit,
    )


@router.post("/content-orchestration/brief", response_model=BriefGenerationResponse)
async def generate_brief(payload: BriefGenerationRequest, session: Session = Depends(get_session)):
    project = session.get(Project, payload.project_id) if payload.project_id else None
    if payload.project_id and not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    result = await content_orchestration_service.generate_brief(
        session=session,
        project=project,
        topic=payload.topic,
        tone=payload.tone,
        language=payload.language,
        target_word_count=payload.target_word_count,
        keyword_plan=payload.keyword_plan.model_dump(),
        serp_analysis=payload.serp_analysis.model_dump(),
    )
    return result.__dict__


@router.post("/content-orchestration/draft")
async def generate_draft_package(payload: dict[str, Any], session: Session = Depends(get_session)):
    return await content_orchestration_service.generate_draft_package(payload, session=session)


@router.post("/content-orchestration/agent-run", response_model=AgentRunResponse)
async def run_agent(
    payload: AgentRunRequest,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    agent_cls = agent_registry.get(payload.agent_type)
    if not agent_cls:
        raise HTTPException(status_code=404, detail="AGENT_NOT_REGISTERED")

    if agent_cls.required_role == ProjectRoleType.ADMIN and not payload.project_id and not user.is_superuser:
        raise HTTPException(status_code=403, detail="project_id required for admin agent")

    if payload.project_id:
        project = session.get(Project, payload.project_id)
        if not project:
            raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

        if not user.is_superuser:
            membership = session.exec(
                select(ProjectMember)
                .join(Role, Role.id == ProjectMember.role_id)
                .where(ProjectMember.project_id == payload.project_id, ProjectMember.user_id == user.id)
            ).first()
            if not membership:
                raise HTTPException(status_code=403, detail="No project access")
            role = session.get(Role, membership.role_id)
            if role and agent_cls.required_role == ProjectRoleType.ADMIN and role.name != ProjectRoleType.ADMIN:
                raise HTTPException(status_code=403, detail="Agent requires admin role")

    result = await agent_cls.run(payload.task)
    return AgentRunResponse(
        agent_type=payload.agent_type,
        input_schema=agent_cls.input_schema.model_json_schema(),
        output_schema=agent_cls.output_schema.model_json_schema(),
        system_prompt_template=agent_cls.system_prompt_template,
        tools=[item.value for item in agent_cls.tools],
        result=result.model_dump(),
    )


@router.get("/marketing-skills", response_model=list[MarketingSkill])
def list_marketing_skills():
    return marketing_skills_service.list_skills()


@router.post("/marketing-skills/apply", response_model=MarketingSkillsApplyResponse)
def apply_marketing_skill(payload: MarketingSkillsApplyRequest):
    try:
        result = marketing_skills_service.apply_skill(payload.skill_id, payload.context)
    except ValueError as exc:
        if str(exc) == "skill_not_found":
            raise HTTPException(status_code=404, detail="MARKETING_SKILL_NOT_FOUND") from exc
        raise
    return result


@router.post("/projects/{project_id}/ai-drafts/{draft_id}/retrospective", response_model=RetrospectiveResponse)
def get_draft_retrospective(
    project_id: int,
    draft_id: int,
    payload: RetrospectiveRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_project_role(ProjectRoleType.VIEWER)),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail=ErrorCode.PROJECT_NOT_FOUND)

    try:
        return content_orchestration_service.get_retrospective(
            session=session,
            project_id=project_id,
            draft_id=draft_id,
            window=payload.window,
        )
    except ValueError as exc:
        if str(exc) == "draft_not_found":
            raise HTTPException(status_code=404, detail="AI_DRAFT_NOT_FOUND") from exc
        raise
