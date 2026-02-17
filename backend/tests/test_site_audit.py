from app.models import Issue, IssueSeverity
from app.site_audit import build_category_scores, map_issue_type_to_site_audit_category


def test_map_issue_type_to_site_audit_category():
    assert map_issue_type_to_site_audit_category("content.missing_title") == "content_quality"
    assert map_issue_type_to_site_audit_category("accessibility.missing_image_alt") == "accessibility"
    assert map_issue_type_to_site_audit_category("technical_seo.poor_lcp") == "performance"
    assert map_issue_type_to_site_audit_category("technical_seo.missing_canonical") == "indexability"
    assert map_issue_type_to_site_audit_category("technical_seo.some_other_issue") == "technical_seo"


def test_build_category_scores():
    issues = [
        Issue(crawl_id=1, issue_type="content.missing_title", severity=IssueSeverity.WARNING),
        Issue(crawl_id=1, issue_type="technical_seo.poor_lcp", severity=IssueSeverity.CRITICAL),
        Issue(crawl_id=1, issue_type="accessibility.missing_image_alt", severity=IssueSeverity.INFO),
        Issue(crawl_id=1, issue_type="technical_seo.missing_canonical", severity=IssueSeverity.WARNING),
    ]

    scores = {row["key"]: row for row in build_category_scores(issues)}

    assert scores["content_quality"]["issue_count"] == 1
    assert scores["content_quality"]["score"] == 97

    assert scores["performance"]["issue_count"] == 1
    assert scores["performance"]["score"] == 90

    assert scores["accessibility"]["issue_count"] == 1
    assert scores["accessibility"]["score"] == 99

    assert scores["indexability"]["issue_count"] == 1
    assert scores["indexability"]["score"] == 97

    assert scores["technical_seo"]["issue_count"] == 0
    assert scores["technical_seo"]["score"] == 100
