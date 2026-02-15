from app.crawler.analyzer import (
    Analyzer,
    AuditIssue,
    InternalLinkValidityRule,
    RedirectChainRule,
)


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


def test_internal_link_validity_rule_detects_broken_links():
    rule = InternalLinkValidityRule()
    page_data = {
        "invalid_internal_links": [
            {"url": "https://example.com/missing", "status_code": 404},
            {"url": "https://example.com/gone", "status_code": 410},
        ],
    }

    issues = rule.evaluate(page_data, status_code=200, load_time_ms=100)

    assert len(issues) == 1
    assert issues[0].type == "technical_seo.internal_link_broken"
    assert "2 internal links" in issues[0].description


def test_internal_link_validity_rule_returns_nothing_when_field_missing():
    """Before the fix, the crawler called the analyzer before populating
    invalid_internal_links, so the rule always saw an empty/missing field."""
    rule = InternalLinkValidityRule()

    issues = rule.evaluate({}, status_code=200, load_time_ms=100)

    assert issues == []


def test_redirect_chain_rule_detects_internal_redirect_chains():
    rule = RedirectChainRule()
    page_data = {
        "redirect_hops": 0,
        "internal_links_with_redirect_chain": [
            {"url": "https://example.com/old-page", "redirect_hops": 3},
        ],
    }

    issues = rule.evaluate(page_data, status_code=200, load_time_ms=100)

    assert len(issues) == 1
    assert issues[0].type == "technical_seo.internal_redirect_chain"


def test_redirect_chain_rule_returns_nothing_when_field_missing():
    """Before the fix, internal_links_with_redirect_chain was not yet
    populated when the analyzer ran, so this rule never fired."""
    rule = RedirectChainRule()

    issues = rule.evaluate({"redirect_hops": 0}, status_code=200, load_time_ms=100)

    assert issues == []


def test_analyzer_detects_link_issues_when_data_present():
    """End-to-end: the analyzer should report both broken internal links
    and internal redirect chains when the page_data contains them."""
    analyzer = Analyzer()
    page_data = {
        "title": "Valid Title Here",
        "description": "A description",
        "h1": "Heading",
        "images_without_alt": [],
        "viewport": "width=device-width",
        "canonical": "https://example.com/page",
        "url": "https://example.com/page",
        "response_headers": {"strict-transport-security": "max-age=31536000"},
        "noindex": False,
        "nofollow": False,
        "schema_org_json_ld": [{"@type": "Article"}],
        "structured_data_errors": [],
        "heading_outline": [{"level": 1, "text": "Heading"}],
        "redirect_hops": 0,
        "lcp_ms": 1500,
        "fcp_ms": 800,
        "cls": 0.05,
        "invalid_internal_links": [
            {"url": "https://example.com/broken", "status_code": 404},
        ],
        "internal_links_with_redirect_chain": [
            {"url": "https://example.com/old", "redirect_hops": 2},
        ],
    }

    issues = analyzer.analyze(page_data, status_code=200, load_time_ms=500)
    issue_types = {issue["type"] for issue in issues}

    assert "technical_seo.internal_link_broken" in issue_types
    assert "technical_seo.internal_redirect_chain" in issue_types
