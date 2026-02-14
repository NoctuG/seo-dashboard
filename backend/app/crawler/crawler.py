import logging
from datetime import datetime
from typing import List, Optional, Set
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

from sqlmodel import Session

from app.config import settings
from app.db import engine
from app.models import Crawl, Page, Link, Issue, CrawlStatus, IssueStatus
from app.crawler.fetcher import Fetcher
from app.crawler.parser import Parser
from app.crawler.analyzer import Analyzer

logger = logging.getLogger(__name__)


class CrawlerService:
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

            crawl.status = CrawlStatus.RUNNING
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

            crawl_max_pages = max_pages or settings.DEFAULT_CRAWL_MAX_PAGES
            crawl_max_pages = max(1, crawl_max_pages)

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
                        continue

                    status_code = response.status_code
                    html_content = response.text

                    parse_result = parser.parse(html_content, url)
                    issues = analyzer.analyze(parse_result, status_code)

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

                    current_domain = urlparse(url).netloc
                    if current_domain.startswith('www.'):
                        current_domain = current_domain[4:]

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

                        target_normalized = self._normalize_url(target_url)
                        if target_domain == current_domain and target_normalized not in visited:
                            queue.append(target_url)

                    for link_data in parse_result.get('external_links', []):
                        link = Link(
                            page_id=page.id,
                            target_url=link_data['url'],
                            type='external',
                            anchor_text=link_data['text']
                        )
                        session.add(link)

                    for issue_data in issues:
                        issue = Issue(
                            crawl_id=crawl.id,
                            page_id=page.id,
                            issue_type=issue_data['type'],
                            severity=issue_data['severity'],
                            status=IssueStatus.OPEN,
                            description=issue_data['description']
                        )
                        session.add(issue)
                        issues_found += 1

                    pages_processed += 1
                    session.commit()

                crawl.status = CrawlStatus.COMPLETED

            except Exception as e:
                logger.exception(f"Crawl failed: {e}")
                crawl.status = CrawlStatus.FAILED
            finally:
                crawl.end_time = datetime.utcnow()
                crawl.total_pages = pages_processed
                crawl.issues_count = issues_found
                session.add(crawl)
                session.commit()


crawler_service = CrawlerService()
