import logging
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

from sqlmodel import Session

from app.runtime_settings import get_runtime_settings
from app.db import engine
from app.models import Crawl, Page, Link, Issue, CrawlStatus, IssueStatus, PagePerformanceSnapshot
from app.crawler.fetcher import Fetcher
from app.crawler.parser import Parser
from app.crawler.analyzer import Analyzer
from app.crawler.events import crawl_event_broker
from app.crawler.performance_adapter import performance_adapter
from app.metrics import (
    CRAWL_ERRORS_TOTAL,
    CRAWL_ISSUES_FOUND_TOTAL,
    CRAWL_PAGES_PROCESSED_TOTAL,
    CRAWL_RUNS_TOTAL,
    update_crawl_status,
)
from app.webhook_service import (
    WEBHOOK_EVENT_CRAWL_COMPLETED,
    WEBHOOK_EVENT_CRITICAL_ISSUE_FOUND,
    webhook_service,
)

logger = logging.getLogger(__name__)


class CrawlerService:
    def _verify_internal_link(self, fetcher: Fetcher, target_url: str) -> Tuple[Optional[int], int]:
        try:
            response = fetcher.session.head(target_url, timeout=8, allow_redirects=True)
            status_code = response.status_code
            if status_code >= 400 or status_code == 405:
                response = fetcher.session.get(target_url, timeout=8, allow_redirects=True)
                status_code = response.status_code
            return status_code, len(response.history)
        except Exception as exc:
            logger.warning(f"Failed to verify internal link {target_url}: {exc}")
            return None, 0

    def _normalize_url(self, url: str) -> str:
        return url.rstrip('/')

    def _same_domain(self, url: str, base_domain: str) -> bool:
        target_domain = urlparse(url).netloc
        if target_domain.startswith('www.'):
            target_domain = target_domain[4:]
        return target_domain == base_domain

    def _load_robot_parser(self, start_url: str) -> Optional[RobotFileParser]:
        parsed = urlparse(start_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        robot_parser = RobotFileParser()
        robot_parser.set_url(robots_url)
        try:
            robot_parser.read()
            return robot_parser
        except Exception as exc:
            logger.warning(f"Failed to read robots.txt ({robots_url}): {exc}")
            return None

    def _extract_urls_from_sitemap(self, sitemap_url: str, fetcher: Fetcher, base_domain: str) -> List[str]:
        response, _ = fetcher.fetch(sitemap_url)
        if not response:
            logger.warning(f"Failed to fetch sitemap: {sitemap_url}")
            return []

        try:
            root = ET.fromstring(response.text)
        except ET.ParseError as exc:
            logger.warning(f"Failed to parse sitemap XML ({sitemap_url}): {exc}")
            return []

        namespace = ""
        if root.tag.startswith("{"):
            namespace = root.tag.split("}")[0] + "}"

        urls: List[str] = []
        if root.tag.endswith("urlset"):
            for loc in root.findall(f".//{namespace}loc"):
                if loc.text and self._same_domain(loc.text.strip(), base_domain):
                    urls.append(loc.text.strip())
        elif root.tag.endswith("sitemapindex"):
            for loc in root.findall(f".//{namespace}loc"):
                if loc.text:
                    urls.extend(self._extract_urls_from_sitemap(loc.text.strip(), fetcher, base_domain))

        return urls

    def run_crawl(self, crawl_id: int, max_pages: Optional[int] = None, sitemap_url: Optional[str] = None):
        with Session(engine) as session:
            crawl = session.get(Crawl, crawl_id)
            if not crawl:
                logger.error(f"Crawl {crawl_id} not found")
                return

            previous_status = crawl.status.value if crawl.status else None
            crawl.status = CrawlStatus.RUNNING
            update_crawl_status(previous_status, crawl.status.value)
            crawl.start_time = datetime.utcnow()
            session.add(crawl)
            session.commit()
            session.refresh(crawl)

            project = crawl.project
            start_url = project.domain
            if not start_url.startswith('http'):
                start_url = f'https://{start_url}'

            parsed_start = urlparse(start_url)
            base_domain = parsed_start.netloc
            if base_domain.startswith('www.'):
                base_domain = base_domain[4:]

            runtime = get_runtime_settings(session)
            crawl_max_pages = max_pages or runtime.default_crawl_max_pages
            crawl_max_pages = max(1, crawl_max_pages)

            crawl_event_broker.publish(crawl.id, {
                "type": "crawl_started",
                "crawl_id": crawl.id,
                "status": crawl.status,
                "max_pages": crawl_max_pages,
                "pages_processed": 0,
                "error_count": 0,
            })

            queue: List[str] = [start_url]
            visited: Set[str] = set()

            fetcher = Fetcher()
            parser = Parser()
            analyzer = Analyzer()
            robots = self._load_robot_parser(start_url)
            crawler_user_agent = fetcher.session.headers.get("User-Agent", "*")

            if sitemap_url:
                sitemap_urls = self._extract_urls_from_sitemap(sitemap_url, fetcher, base_domain)
                queue.extend(sitemap_urls)
                logger.info(f"Added {len(sitemap_urls)} URLs from sitemap")

            pages_processed = 0
            issues_found = 0
            error_count = 0
            internal_link_validation_cache: Dict[str, Tuple[Optional[int], int]] = {}
            critical_issue_alert_sent = False

            try:
                while queue and pages_processed < crawl_max_pages:
                    url = queue.pop(0)
                    normalized_url = self._normalize_url(url)
                    if normalized_url in visited:
                        continue

                    if robots and not robots.can_fetch(crawler_user_agent, url):
                        logger.info(f"Skipping disallowed by robots.txt: {url}")
                        visited.add(normalized_url)
                        continue

                    visited.add(normalized_url)
                    visited.add(url)

                    logger.info(f"Crawling: {url}")

                    response, load_time = fetcher.fetch(url)
                    if not response:
                        logger.warning(f"Failed to fetch {url}")
                        error_count += 1
                        CRAWL_ERRORS_TOTAL.inc()
                        crawl_event_broker.publish(crawl.id, {
                            "type": "crawl_error",
                            "crawl_id": crawl.id,
                            "status": crawl.status,
                            "current_url": url,
                            "pages_processed": pages_processed,
                            "max_pages": crawl_max_pages,
                            "error_count": error_count,
                        })
                        continue

                    status_code = response.status_code
                    html_content = response.text

                    parse_result = parser.parse(html_content, url)
                    parse_result["url"] = str(response.url)
                    parse_result["response_headers"] = dict(response.headers)
                    parse_result["redirect_hops"] = len(response.history)

                    perf_metrics = performance_adapter.collect(url)
                    parse_result["lcp_ms"] = perf_metrics.lcp_ms
                    parse_result["fcp_ms"] = perf_metrics.fcp_ms
                    parse_result["cls"] = perf_metrics.cls

                    page = Page(
                        crawl_id=crawl.id,
                        url=url,
                        status_code=status_code,
                        title=parse_result.get('title'),
                        description=parse_result.get('description'),
                        h1=parse_result.get('h1'),
                        load_time_ms=load_time,
                        size_bytes=len(html_content),
                        content_hash=parse_result.get('content_hash')
                    )
                    session.add(page)
                    session.commit()
                    session.refresh(page)

                    performance_snapshot = PagePerformanceSnapshot(
                        page_id=page.id,
                        lcp_ms=perf_metrics.lcp_ms,
                        fcp_ms=perf_metrics.fcp_ms,
                        cls=perf_metrics.cls,
                        source=perf_metrics.source,
                    )
                    session.add(performance_snapshot)

                    current_domain = urlparse(url).netloc
                    if current_domain.startswith('www.'):
                        current_domain = current_domain[4:]

                    invalid_internal_links = []
                    internal_links_with_redirect_chain = []

                    for link_data in parse_result.get('internal_links', []):
                        target_url = link_data['url']
                        link = Link(
                            page_id=page.id,
                            target_url=target_url,
                            type='internal',
                            anchor_text=link_data['text']
                        )
                        session.add(link)

                        target_domain = urlparse(target_url).netloc
                        if target_domain.startswith('www.'):
                            target_domain = target_domain[4:]

                        cached_result = internal_link_validation_cache.get(target_url)
                        if cached_result is None:
                            cached_result = self._verify_internal_link(fetcher, target_url)
                            internal_link_validation_cache[target_url] = cached_result

                        validated_status, redirect_hops = cached_result
                        if validated_status is None or validated_status >= 400:
                            invalid_internal_links.append({
                                "url": target_url,
                                "status_code": validated_status,
                            })
                        if redirect_hops >= 2:
                            internal_links_with_redirect_chain.append({
                                "url": target_url,
                                "redirect_hops": redirect_hops,
                            })

                        target_normalized = self._normalize_url(target_url)
                        if target_domain == current_domain and target_normalized not in visited:
                            queue.append(target_url)

                    parse_result["invalid_internal_links"] = invalid_internal_links
                    parse_result["internal_links_with_redirect_chain"] = internal_links_with_redirect_chain

                    for link_data in parse_result.get('external_links', []):
                        link = Link(
                            page_id=page.id,
                            target_url=link_data['url'],
                            type='external',
                            anchor_text=link_data['text']
                        )
                        session.add(link)

                    # Run analyzer after all parse_result fields are populated,
                    # including internal link validation and redirect chain data.
                    issues = analyzer.analyze(parse_result, status_code, load_time)

                    for issue_data in issues:
                        issue = Issue(
                            crawl_id=crawl.id,
                            page_id=page.id,
                            issue_type=issue_data['type'],
                            severity=issue_data['severity'],
                            status=IssueStatus.OPEN,
                            description=issue_data['description'],
                            category=issue_data.get('category', 'technical_seo'),
                            fix_template=issue_data.get('fix_template'),
                        )
                        session.add(issue)
                        issues_found += 1
                        CRAWL_ISSUES_FOUND_TOTAL.inc()

                        if issue_data['severity'] == 'critical' and not critical_issue_alert_sent:
                            webhook_service.dispatch_event(
                                session,
                                WEBHOOK_EVENT_CRITICAL_ISSUE_FOUND,
                                {
                                    "crawl_id": crawl.id,
                                    "project_id": crawl.project_id,
                                    "page_url": page.url,
                                    "issue_type": issue_data['type'],
                                    "description": issue_data.get('description'),
                                },
                            )
                            critical_issue_alert_sent = True

                    pages_processed += 1
                    CRAWL_PAGES_PROCESSED_TOTAL.inc()
                    session.commit()
                    crawl_event_broker.publish(crawl.id, {
                        "type": "crawl_progress",
                        "crawl_id": crawl.id,
                        "status": crawl.status,
                        "current_url": url,
                        "pages_processed": pages_processed,
                        "max_pages": crawl_max_pages,
                        "issues_found": issues_found,
                        "error_count": error_count,
                    })

                update_crawl_status(crawl.status.value, CrawlStatus.COMPLETED.value)
                crawl.status = CrawlStatus.COMPLETED
                CRAWL_RUNS_TOTAL.labels(status="completed").inc()
                crawl_event_broker.publish(crawl.id, {
                    "type": "crawl_completed",
                    "crawl_id": crawl.id,
                    "status": crawl.status,
                    "pages_processed": pages_processed,
                    "max_pages": crawl_max_pages,
                    "issues_found": issues_found,
                    "error_count": error_count,
                })

            except Exception as e:
                logger.exception(f"Crawl failed: {e}")
                update_crawl_status(crawl.status.value, CrawlStatus.FAILED.value)
                crawl.status = CrawlStatus.FAILED
                CRAWL_RUNS_TOTAL.labels(status="failed").inc()
                error_count += 1
                CRAWL_ERRORS_TOTAL.inc()
                crawl_event_broker.publish(crawl.id, {
                    "type": "crawl_failed",
                    "crawl_id": crawl.id,
                    "status": crawl.status,
                    "pages_processed": pages_processed,
                    "max_pages": crawl_max_pages,
                    "issues_found": issues_found,
                    "error_count": error_count,
                })
            finally:
                crawl.end_time = datetime.utcnow()
                crawl.total_pages = pages_processed
                crawl.issues_count = issues_found
                session.add(crawl)
                session.commit()

                if crawl.status == CrawlStatus.COMPLETED:
                    webhook_service.dispatch_event(
                        session,
                        WEBHOOK_EVENT_CRAWL_COMPLETED,
                        {
                            "crawl_id": crawl.id,
                            "project_id": crawl.project_id,
                            "status": crawl.status,
                            "total_pages": crawl.total_pages,
                            "issues_count": crawl.issues_count,
                            "started_at": crawl.start_time.isoformat() if crawl.start_time else None,
                            "ended_at": crawl.end_time.isoformat() if crawl.end_time else None,
                        },
                    )


crawler_service = CrawlerService()
