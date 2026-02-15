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

    assert "slow_page_load" in issue_types
    assert "not_mobile_friendly" in issue_types


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
        {"type": "404", "severity": "critical", "description": "Page not found (404)"}
    ]


def test_analyzer_supports_custom_rules_for_extensibility():
    class AccessibilityRule:
        def evaluate(self, page_data, status_code, load_time_ms):
            return [AuditIssue(type="accessibility", severity="info", description="Custom rule")]

    analyzer = Analyzer(rules=[AccessibilityRule()])

    issues = analyzer.analyze({}, status_code=200, load_time_ms=100)

    assert issues == [
        {"type": "accessibility", "severity": "info", "description": "Custom rule"}
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
        },
        status_code=200,
        load_time_ms=900,
    )

    issue_types = {issue["type"] for issue in issues}
    assert {"poor_lcp", "poor_fcp", "poor_cls", "noindex_detected", "missing_canonical", "non_https"}.issubset(issue_types)
