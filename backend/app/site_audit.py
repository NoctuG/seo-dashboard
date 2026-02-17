from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from app.models import Issue


SEVERITY_PENALTY = {
    "critical": 10,
    "warning": 3,
    "info": 1,
}


SITE_AUDIT_CATEGORY_DEFS = [
    ("technical_seo", "Technical SEO"),
    ("content_quality", "Content Quality"),
    ("performance", "Performance"),
    ("accessibility", "Accessibility"),
    ("indexability", "Indexability"),
]


def map_issue_type_to_site_audit_category(issue_type: str, fallback_category: str | None = None) -> str:
    issue_type = (issue_type or "").lower()
    fallback = (fallback_category or "").lower()

    if issue_type.startswith("accessibility.") or fallback == "accessibility":
        return "accessibility"

    if issue_type.startswith("content.") or fallback == "content":
        return "content_quality"

    if issue_type in {
        "technical_seo.slow_page_load",
        "technical_seo.poor_lcp",
        "technical_seo.needs_improvement_lcp",
        "technical_seo.poor_fcp",
        "technical_seo.poor_cls",
    }:
        return "performance"

    if issue_type in {
        "technical_seo.http_404_not_found",
        "technical_seo.http_server_error",
        "technical_seo.missing_canonical",
        "technical_seo.cross_domain_canonical",
        "technical_seo.canonical_mismatch",
        "technical_seo.internal_link_broken",
        "technical_seo.redirect_chain",
        "technical_seo.internal_redirect_chain",
        "technical_seo.noindex_detected",
        "technical_seo.nofollow_detected",
        "technical_seo.structured_data_invalid",
        "technical_seo.structured_data_missing",
    }:
        return "indexability"

    return "technical_seo"


def calculate_site_health_score(issues: Iterable[Issue]) -> int:
    total_penalty = 0
    for issue in issues:
        severity = issue.severity.value if hasattr(issue.severity, "value") else str(issue.severity)
        total_penalty += SEVERITY_PENALTY.get(severity, 1)
    return max(0, min(100, 100 - total_penalty))


def build_category_scores(issues: Iterable[Issue]) -> list[dict[str, int | str]]:
    issue_count_map = defaultdict(int)
    penalty_map = defaultdict(int)

    for issue in issues:
        category = map_issue_type_to_site_audit_category(
            issue.issue_type,
            str(issue.category) if issue.category else None,
        )
        issue_count_map[category] += 1
        severity = issue.severity.value if hasattr(issue.severity, "value") else str(issue.severity)
        penalty_map[category] += SEVERITY_PENALTY.get(severity, 1)

    scores: list[dict[str, int | str]] = []
    for key, display_name in SITE_AUDIT_CATEGORY_DEFS:
        score = max(0, 100 - penalty_map[key])
        scores.append(
            {
                "key": key,
                "name": display_name,
                "score": score,
                "issue_count": issue_count_map[key],
            }
        )

    return scores
