from dataclasses import dataclass
from typing import Any, Dict, List, Protocol
from urllib.parse import urlparse


@dataclass
class AuditIssue:
    type: str
    severity: str
    description: str
    category: str = "technical_seo"
    fix_template: str | None = None


class AuditRule(Protocol):
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        ...


class StatusCodeRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        if status_code == 404:
            return [
                AuditIssue(
                    type="technical_seo.http_404_not_found",
                    severity="critical",
                    description="Page not found (404)",
                    fix_template="检查链接来源并恢复页面，或将失效地址301重定向到最相关的有效页面。",
                )
            ]

        if status_code >= 500:
            return [
                AuditIssue(
                    type="technical_seo.http_server_error",
                    severity="critical",
                    description=f"Server error ({status_code})",
                    fix_template="排查服务器日志与上游依赖，修复后返回 200/3xx 并添加监控告警。",
                )
            ]

        return []


class BasicSeoRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []

        if not page_data.get("title"):
            issues.append(
                AuditIssue(
                    type="content.missing_title",
                    severity="warning",
                    description="Missing title tag",
                    category="content",
                    fix_template="为页面添加唯一且准确的 <title>，建议控制在 50-60 字符并包含核心关键词。",
                )
            )
        elif len(page_data["title"]) < 10:
            issues.append(
                AuditIssue(
                    type="content.short_title",
                    severity="info",
                    description="Title is too short (<10 chars)",
                    category="content",
                    fix_template="扩展标题语义，补充品牌词或核心意图词，避免过短导致相关性不足。",
                )
            )

        if not page_data.get("description"):
            issues.append(
                AuditIssue(
                    type="content.missing_meta_description",
                    severity="warning",
                    description="Missing meta description",
                    category="content",
                    fix_template="补充 120-160 字符 meta description，突出价值点并包含目标关键词。",
                )
            )

        if not page_data.get("h1"):
            issues.append(
                AuditIssue(
                    type="content.missing_h1",
                    severity="warning",
                    description="Missing H1 heading",
                    category="content",
                    fix_template="为页面添加唯一 H1，与页面主题和 title 保持一致但避免完全重复。",
                )
            )

        if page_data.get("images_without_alt"):
            count = len(page_data["images_without_alt"])
            issues.append(
                AuditIssue(
                    type="accessibility.missing_image_alt",
                    severity="warning",
                    description=f"{count} images missing alt text",
                    category="accessibility",
                    fix_template="为关键图片添加描述性 alt 文本，纯装饰图使用空 alt(\"\")。",
                )
            )

        return issues


class CanonicalRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        canonical = page_data.get("canonical")
        current_url = page_data.get("url")

        if not canonical:
            issues.append(
                AuditIssue(
                    type="technical_seo.missing_canonical",
                    severity="info",
                    description="Missing canonical URL",
                    fix_template="为页面添加 rel=\"canonical\" 指向首选 URL，避免重复内容分散权重。",
                )
            )
            return issues

        if not current_url:
            return issues

        canonical_parsed = urlparse(canonical)
        current_parsed = urlparse(current_url)
        canonical_path = canonical_parsed.path.rstrip("/") or "/"
        current_path = current_parsed.path.rstrip("/") or "/"

        if canonical_parsed.netloc and canonical_parsed.netloc != current_parsed.netloc:
            issues.append(
                AuditIssue(
                    type="technical_seo.cross_domain_canonical",
                    severity="warning",
                    description=f"Canonical points to another domain ({canonical_parsed.netloc})",
                    fix_template="确认是否需要跨域规范化；若非必要，将 canonical 改为本站对应页面。",
                )
            )
        elif canonical_path != current_path:
            issues.append(
                AuditIssue(
                    type="technical_seo.canonical_mismatch",
                    severity="warning",
                    description="Canonical URL does not match current page path",
                    fix_template="统一 URL 规范并确保 canonical 指向当前页面的首选版本。",
                )
            )

        return issues


class HeadingHierarchyRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        outline = page_data.get("heading_outline") or []
        if not outline:
            return []

        previous_level = 0
        for heading in outline:
            current_level = heading.get("level")
            if not isinstance(current_level, int):
                continue
            if previous_level and current_level - previous_level > 1:
                return [
                    AuditIssue(
                        type="accessibility.heading_hierarchy_invalid",
                        severity="warning",
                        description=(
                            f"Heading level jumps from h{previous_level} to h{current_level}, which may hurt readability"
                        ),
                        category="accessibility",
                        fix_template="调整标题层级，避免跨级跳跃（如 h2 直接到 h4），保持文档结构递进。",
                    )
                ]
            previous_level = current_level

        return []


class InternalLinkValidityRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        invalid_links = page_data.get("invalid_internal_links") or []
        if not invalid_links:
            return []

        sample = invalid_links[0]
        sample_status = sample.get("status_code")
        sample_url = sample.get("url")
        return [
            AuditIssue(
                type="technical_seo.internal_link_broken",
                severity="warning",
                description=(
                    f"{len(invalid_links)} internal links are invalid. Example: {sample_url} (status {sample_status})"
                ),
                fix_template="替换或修复失效内部链接；对已下线内容配置 301 重定向并更新站内引用。",
            )
        ]


class RedirectChainRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        redirect_hops = int(page_data.get("redirect_hops") or 0)
        if redirect_hops >= 2:
            issues.append(
                AuditIssue(
                    type="technical_seo.redirect_chain",
                    severity="warning",
                    description=f"Page request follows a redirect chain ({redirect_hops} hops)",
                    fix_template="将入口 URL 直接指向最终落地页，减少多跳 301/302。",
                )
            )

        internal_redirects = page_data.get("internal_links_with_redirect_chain") or []
        if internal_redirects:
            issues.append(
                AuditIssue(
                    type="technical_seo.internal_redirect_chain",
                    severity="info",
                    description=f"{len(internal_redirects)} internal links go through 2+ redirects",
                    fix_template="把内部链接更新为最终目标 URL，减少抓取浪费和加载时延。",
                )
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
                    type="technical_seo.slow_page_load",
                    severity="critical",
                    description=(
                        f"Page load time is very slow ({load_time_ms}ms >= {self.critical_threshold_ms}ms)"
                    ),
                    fix_template="压缩静态资源、启用缓存/CDN，并排查阻塞渲染脚本。",
                )
            ]

        if load_time_ms >= self.warning_threshold_ms:
            return [
                AuditIssue(
                    type="technical_seo.slow_page_load",
                    severity="warning",
                    description=(
                        f"Page load time is slow ({load_time_ms}ms >= {self.warning_threshold_ms}ms)"
                    ),
                    fix_template="优化关键渲染路径并延迟非关键脚本，降低首屏时间。",
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
                type="accessibility.missing_viewport_meta",
                severity="warning",
                description="Missing viewport meta tag, page may not be mobile friendly",
                category="accessibility",
                fix_template="添加 viewport 元标签，例如 width=device-width, initial-scale=1。",
            )
        ]


class CoreWebVitalsRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        lcp = page_data.get("lcp_ms")
        fcp = page_data.get("fcp_ms")
        cls = page_data.get("cls")

        if lcp is not None and lcp > 4000:
            issues.append(
                AuditIssue(
                    type="technical_seo.poor_lcp",
                    severity="critical",
                    description=f"LCP is too high ({lcp}ms)",
                    fix_template="优化首屏大图/主内容加载，减少服务器响应与渲染阻塞。",
                )
            )
        elif lcp is not None and lcp > 2500:
            issues.append(
                AuditIssue(
                    type="technical_seo.needs_improvement_lcp",
                    severity="warning",
                    description=f"LCP needs improvement ({lcp}ms)",
                    fix_template="提升关键资源优先级并预加载首屏核心资源。",
                )
            )

        if fcp is not None and fcp > 3000:
            issues.append(
                AuditIssue(
                    type="technical_seo.poor_fcp",
                    severity="warning",
                    description=f"FCP is high ({fcp}ms)",
                    fix_template="减少首屏 CSS/JS 体积并开启压缩，尽快输出首字节和首内容。",
                )
            )

        if cls is not None and cls > 0.25:
            issues.append(
                AuditIssue(
                    type="technical_seo.poor_cls",
                    severity="critical",
                    description=f"CLS is too high ({cls})",
                    fix_template="为图片/广告位预留尺寸，避免动态内容插入造成布局抖动。",
                )
            )
        elif cls is not None and cls > 0.1:
            issues.append(
                AuditIssue(
                    type="technical_seo.needs_improvement_cls",
                    severity="warning",
                    description=f"CLS needs improvement ({cls})",
                    fix_template="稳定布局容器尺寸，减少字体和组件异步加载引发布局变化。",
                )
            )

        return issues


class StructuredDataRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        if page_data.get("structured_data_errors"):
            for err in page_data["structured_data_errors"]:
                issues.append(
                    AuditIssue(
                        type="technical_seo.structured_data_invalid",
                        severity="warning",
                        description=err,
                        fix_template="使用 schema.org 验证器修复 JSON-LD 语法与字段错误。",
                    )
                )

        if not page_data.get("schema_org_json_ld"):
            issues.append(
                AuditIssue(
                    type="technical_seo.structured_data_missing",
                    severity="info",
                    description="No schema.org JSON-LD structured data found",
                    fix_template="根据页面类型添加 FAQ/Product/Article 等结构化数据。",
                )
            )

        return issues


class IndexabilityRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []

        if page_data.get("noindex"):
            issues.append(
                AuditIssue(
                    type="technical_seo.noindex_detected",
                    severity="warning",
                    description="Page has noindex directive",
                    fix_template="确认该页是否应被索引；若需要收录，移除 noindex 指令。",
                )
            )
        if page_data.get("nofollow"):
            issues.append(
                AuditIssue(
                    type="technical_seo.nofollow_detected",
                    severity="info",
                    description="Page has nofollow directive",
                    fix_template="评估 nofollow 是否合理，避免阻断重要内链权重传递。",
                )
            )

        return issues


class SecurityRule:
    def evaluate(self, page_data: Dict[str, Any], status_code: int, load_time_ms: int) -> List[AuditIssue]:
        issues: List[AuditIssue] = []
        url = page_data.get("url", "")
        headers = {k.lower(): v for k, v in (page_data.get("response_headers") or {}).items()}

        if url.startswith("http://"):
            issues.append(
                AuditIssue(
                    type="technical_seo.non_https",
                    severity="critical",
                    description="Page is served over HTTP",
                    fix_template="启用 HTTPS 并将 HTTP 全量 301 到 HTTPS。",
                )
            )

        if "strict-transport-security" not in headers:
            issues.append(
                AuditIssue(
                    type="technical_seo.missing_hsts",
                    severity="warning",
                    description="Missing HSTS header",
                    fix_template="在 HTTPS 域名上添加 Strict-Transport-Security 响应头。",
                )
            )
        if "content-security-policy" not in headers:
            issues.append(
                AuditIssue(
                    type="technical_seo.missing_csp",
                    severity="info",
                    description="Missing CSP header",
                    fix_template="逐步配置 Content-Security-Policy，限制脚本和资源来源。",
                )
            )

        return issues


class Analyzer:
    def __init__(self, rules: List[AuditRule] | None = None):
        self.rules = rules or [
            StatusCodeRule(),
            BasicSeoRule(),
            CanonicalRule(),
            HeadingHierarchyRule(),
            InternalLinkValidityRule(),
            RedirectChainRule(),
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
            if any(issue.type in {"technical_seo.http_404_not_found", "technical_seo.http_server_error"} for issue in new_issues):
                break

        return [issue.__dict__ for issue in issues]
