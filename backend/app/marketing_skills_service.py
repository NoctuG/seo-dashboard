from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class MarketingSkill(BaseModel):
    id: str
    name: str
    category: str
    when_to_use: str
    prompt_template: str
    output_format: list[str] = Field(default_factory=list)
    quality_checklist: list[str] = Field(default_factory=list)


class MarketingSkillsService:
    def __init__(self, skills_path: Path | None = None) -> None:
        base_dir = Path(__file__).resolve().parent
        self._skills_path = skills_path or base_dir / "resources" / "marketing_skills.json"

    def list_skills(self) -> list[MarketingSkill]:
        if not self._skills_path.exists():
            return []

        raw = json.loads(self._skills_path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return [MarketingSkill.model_validate(item) for item in raw]

    def apply_skill(self, skill_id: str, context: dict[str, Any]) -> dict[str, Any]:
        skill = next((item for item in self.list_skills() if item.id == skill_id), None)
        if not skill:
            raise ValueError("skill_not_found")

        return {
            "skill": skill.model_dump(),
            "context": context,
            "injected_prompt": self._render_prompt(skill.prompt_template, context),
            "output_format": skill.output_format,
            "quality_checklist": skill.quality_checklist,
        }

    @staticmethod
    def _render_prompt(template: str, context: dict[str, Any]) -> str:
        rendered = template
        for key, value in context.items():
            rendered = rendered.replace(f"{{{{{key}}}}}", str(value))
        return rendered


marketing_skills_service = MarketingSkillsService()
