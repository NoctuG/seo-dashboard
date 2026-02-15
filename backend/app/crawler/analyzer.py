from dataclasses import dataclass
from typing import Any, Dict, List, Protocol


@dataclass
class AuditIssue:
    type: str
    severity: str
    description: str


class AuditRule(Protocol):
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        ...


class StatusCodeRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        if status_code == 404:
            return [AuditIssue(type="404", severity="critical", description="Page not found (404)")]

        if status_code >= 500:
            return [
                AuditIssue(
                    type="server_error",
                    severity="critical",
                    description=f"Server error ({status_code})",
                )
            ]

        return []


class BasicSeoRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []

        if not page_data.get("title"):
            issues.append(AuditIssue(type="missing_title", severity="warning", description="Missing title tag"))
        elif len(page_data["title"]) < 10:
            issues.append(AuditIssue(type="short_title", severity="info", description="Title is too short (<10 chars)"))

        if not page_data.get("description"):
            issues.append(
                AuditIssue(type="missing_description", severity="warning", description="Missing meta description")
            )

        if not page_data.get("h1"):
            issues.append(AuditIssue(type="missing_h1", severity="warning", description="Missing H1 heading"))

        if page_data.get("images_without_alt"):
            count = len(page_data["images_without_alt"])
            issues.append(
                AuditIssue(type="missing_alt", severity="warning", description=f"{count} images missing alt text")
            )

        return issues


class PageLoadSpeedRule:
    def __init__(self, warning_threshold_ms: int = 2000, critical_threshold_ms: int = 4000):
        self.warning_threshold_ms = warning_threshold_ms
        self.critical_threshold_ms = critical_threshold_ms

    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        if load_time_ms >= self.critical_threshold_ms:
            return [
                AuditIssue(
                    type="slow_page_load",
                    severity="critical",
                    description=(
                        f"Page load time is very slow ({load_time_ms}ms >= {self.critical_threshold_ms}ms)"
                    ),
                )
            ]

        if load_time_ms >= self.warning_threshold_ms:
            return [
                AuditIssue(
                    type="slow_page_load",
                    severity="warning",
                    description=(
                        f"Page load time is slow ({load_time_ms}ms >= {self.warning_threshold_ms}ms)"
                    ),
                )
            ]

        return []


class MobileFriendlyRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        viewport = page_data.get("viewport")
        if viewport:
            return []

        return [
            AuditIssue(
                type="not_mobile_friendly",
                severity="warning",
                description="Missing viewport meta tag, page may not be mobile friendly",
            )
        ]


class CoreWebVitalsRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        lcp = page_data.get("lcp_ms")
        fcp = page_data.get("fcp_ms")
        cls = page_data.get("cls")

        if lcp is not None and lcp > 4000:
            issues.append(AuditIssue(type="poor_lcp", severity="critical", description=f"LCP is too high ({lcp}ms)"))
        elif lcp is not None and lcp > 2500:
            issues.append(AuditIssue(type="needs_improvement_lcp", severity="warning", description=f"LCP needs improvement ({lcp}ms)"))

        if fcp is not None and fcp > 3000:
            issues.append(AuditIssue(type="poor_fcp", severity="warning", description=f"FCP is high ({fcp}ms)"))

        if cls is not None and cls > 0.25:
            issues.append(AuditIssue(type="poor_cls", severity="critical", description=f"CLS is too high ({cls})"))
        elif cls is not None and cls > 0.1:
            issues.append(AuditIssue(type="needs_improvement_cls", severity="warning", description=f"CLS needs improvement ({cls})"))

        return issues


class StructuredDataRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        if page_data.get("structured_data_errors"):
            for err in page_data["structured_data_errors"]:
                issues.append(AuditIssue(type="structured_data_invalid", severity="warning", description=err))

        if not page_data.get("schema_org_json_ld"):
            issues.append(
                AuditIssue(
                    type="structured_data_missing",
                    severity="info",
                    description="No schema.org JSON-LD structured data found",
                )
            )

        return issues


class IndexabilityRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []

        if page_data.get("noindex"):
            issues.append(AuditIssue(type="noindex_detected", severity="warning", description="Page has noindex directive"))
        if page_data.get("nofollow"):
            issues.append(AuditIssue(type="nofollow_detected", severity="info", description="Page has nofollow directive"))
        if not page_data.get("canonical"):
            issues.append(AuditIssue(type="missing_canonical", severity="info", description="Missing canonical URL"))

        return issues


class SecurityRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        url = page_data.get("url", "")
        headers = {k.lower(): v for k, v in (page_data.get("response_headers") or {}).items()}

        if url.startswith("http://"):
            issues.append(AuditIssue(type="non_https", severity="critical", description="Page is served over HTTP"))

        if "strict-transport-security" not in headers:
            issues.append(AuditIssue(type="missing_hsts", severity="warning", description="Missing HSTS header"))
        if "content-security-policy" not in headers:
            issues.append(AuditIssue(type="missing_csp", severity="info", description="Missing CSP header"))

        return issues


class Analyzer:
    def __init__(self, rules: List[AuditRule] | None = None):
        self.rules = rules or [
            StatusCodeRule(),
            BasicSeoRule(),
            PageLoadSpeedRule(),
            MobileFriendlyRule(),
            CoreWebVitalsRule(),
            StructuredDataRule(),
            IndexabilityRule(),
            SecurityRule(),
        ]

    def analyze(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[Dict[str, Any]]:
        issues: List[AuditIssue] = []

        for rule in self.rules:
            new_issues = rule.evaluate(page_data, status_code, load_time_ms)
            issues.extend(new_issues)

            # Stop on critical status code issues, because other checks are not useful.
            if any(issue.type in {"404", "server_error"} for issue in new_issues):
                break

        return [issue.__dict__ for issue in issues]
