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
