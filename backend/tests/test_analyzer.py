from app.crawler.analyzer import Analyzer, AuditIssue


def test_analyzer_reports_speed_and_mobile_issues():
    analyzer = Analyzer()
    page_data = {
        "title": "A valid title",
        "description": "desc",
        "h1": "header",
        "images_without_alt": [],
        "viewport": None,
    }

    issues = analyzer.analyze(page_data, status_code=200, load_time_ms=3500)
    issue_types = {issue["type"] for issue in issues}

    assert "technical_seo.slow_page_load" in issue_types
    assert "accessibility.missing_viewport_meta" in issue_types


def test_analyzer_stops_after_404_issue():
    analyzer = Analyzer()
    page_data = {
        "title": None,
        "description": None,
        "h1": None,
        "images_without_alt": ["https://example.com/a.png"],
        "viewport": None,
    }

    issues = analyzer.analyze(page_data, status_code=404, load_time_ms=5000)

    assert issues == [
        {
            "type": "technical_seo.http_404_not_found",
            "severity": "critical",
            "description": "Page not found (404)",
            "category": "technical_seo",
            "fix_template": "检查链接来源并恢复页面，或将失效地址301重定向到最相关的有效页面。",
        }
    ]


def test_analyzer_supports_custom_rules_for_extensibility():
    class AccessibilityRule:
        def evaluate(self, page_data, status_code, load_time_ms):
            return [AuditIssue(type="accessibility.custom_rule", severity="info", description="Custom rule")]

    analyzer = Analyzer(rules=[AccessibilityRule()])

    issues = analyzer.analyze({}, status_code=200, load_time_ms=100)

    assert issues == [
        {
            "type": "accessibility.custom_rule",
            "severity": "info",
            "description": "Custom rule",
            "category": "technical_seo",
            "fix_template": None,
        }
    ]


def test_analyzer_reports_technical_health_issues():
    analyzer = Analyzer()
    issues = analyzer.analyze(
        {
            "title": "A valid title",
            "description": "desc",
            "h1": "header",
            "images_without_alt": [],
            "viewport": "width=device-width",
            "canonical": None,
            "noindex": True,
            "nofollow": True,
            "schema_org_json_ld": [],
            "structured_data_errors": ["Invalid JSON-LD: Expecting value"],
            "url": "http://example.com",
            "response_headers": {},
            "lcp_ms": 4500,
            "fcp_ms": 3500,
            "cls": 0.3,
            "heading_outline": [{"level": 2, "text": "Section"}, {"level": 4, "text": "Sub"}],
            "invalid_internal_links": [{"url": "https://example.com/broken", "status_code": 404}],
            "internal_links_with_redirect_chain": [{"url": "https://example.com/old", "redirect_hops": 2}],
            "redirect_hops": 2,
        },
        status_code=200,
        load_time_ms=900,
    )

    issue_types = {issue["type"] for issue in issues}
    assert {
        "technical_seo.poor_lcp",
        "technical_seo.poor_fcp",
        "technical_seo.poor_cls",
        "technical_seo.noindex_detected",
        "technical_seo.missing_canonical",
        "technical_seo.non_https",
        "accessibility.heading_hierarchy_invalid",
        "technical_seo.internal_link_broken",
        "technical_seo.redirect_chain",
    }.issubset(issue_types)
