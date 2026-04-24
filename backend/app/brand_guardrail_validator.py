from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass
class GuardrailViolation:
    rule: str
    severity: str
    message: str
    matched_text: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rule": self.rule,
            "severity": self.severity,
            "message": self.message,
            "matched_text": self.matched_text,
        }


class BrandGuardrailValidator:
    def validate(
        self,
        *,
        content: str,
        brand_context: dict[str, Any],
        expected_tone: str | None = None,
    ) -> dict[str, Any]:
        text = (content or "").strip()
        violations: list[GuardrailViolation] = []

        banned_words = [str(item).strip() for item in brand_context.get("banned_words", []) if str(item).strip()]
        for word in banned_words:
            if word and word.lower() in text.lower():
                violations.append(
                    GuardrailViolation(
                        rule="banned_words",
                        severity="high",
                        message=f"检测到禁用词：{word}",
                        matched_text=word,
                    )
                )

        terminology = brand_context.get("terminology") or {}
        if isinstance(terminology, dict):
            for canonical, aliases in terminology.items():
                if not canonical:
                    continue
                alias_list = aliases if isinstance(aliases, list) else []
                for alias in alias_list:
                    alias_value = str(alias).strip()
                    if not alias_value:
                        continue
                    if alias_value.lower() in text.lower() and canonical.lower() not in text.lower():
                        violations.append(
                            GuardrailViolation(
                                rule="terminology_consistency",
                                severity="medium",
                                message=f"术语建议统一为“{canonical}”，当前包含“{alias_value}”。",
                                matched_text=alias_value,
                            )
                        )

        tone_signals = {
            "professional": ["哈哈", "太棒了", "爆款"],
            "authoritative": ["可能", "也许", "大概"],
            "friendly": ["必须", "立刻", "绝对"],
            "casual": ["依据研究", "行业标准", "证据显示"],
        }
        tone = (expected_tone or brand_context.get("tone") or "").strip().lower()
        if tone in tone_signals:
            for marker in tone_signals[tone]:
                if marker and marker in text:
                    violations.append(
                        GuardrailViolation(
                            rule="tone_deviation",
                            severity="low",
                            message=f"语气可能偏离 {tone}（检测到“{marker}”）。",
                            matched_text=marker,
                        )
                    )

        passed = len(violations) == 0
        return {
            "passed": passed,
            "brand_context_version": brand_context.get("version"),
            "violations": [item.to_dict() for item in violations],
            "summary": "品牌规则检查通过" if passed else f"发现 {len(violations)} 个品牌规则风险",
        }


brand_guardrail_validator = BrandGuardrailValidator()
