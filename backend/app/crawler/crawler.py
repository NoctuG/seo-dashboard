import logging
from sqlmodel import Session, select
from datetime import datetime
from app.db import engine
from app.models import Crawl, Page, Link, Issue, CrawlStatus, IssueSeverity, IssueStatus
from app.crawler.fetcher import Fetcher
from app.crawler.parser import Parser
from app.crawler.analyzer import Analyzer
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

class CrawlerService:
    def run_crawl(self, crawl_id: int):
        with Session(engine) as session:
            crawl = session.get(Crawl, crawl_id)
            if not crawl:
                logger.error(f"Crawl {crawl_id} not found")
                return

            crawl.status = CrawlStatus.RUNNING
            crawl.start_time = datetime.utcnow()
            session.add(crawl)
            session.commit()
            session.refresh(crawl) # Refresh to get project relationship loaded if needed

            # Re-fetch with relationship
            # Note: SQLModel relationships are lazy loaded by default if not async?
            # In sync SQLModel (SQLAlchemy), access triggers load.
            project = crawl.project
            start_url = project.domain
            if not start_url.startswith('http'):
                start_url = f'https://{start_url}'

            queue = [start_url]
            visited = set()

            fetcher = Fetcher()
            parser = Parser()
            analyzer = Analyzer()

            pages_processed = 0
            issues_found = 0

            try:
                # Basic loop - BFS
                while queue and pages_processed < 50: # MVP Limit to 50 pages to be safe and fast
                    url = queue.pop(0)

                    # Normalize URL (remove trailing slash for consistency check)
                    normalized_url = url.rstrip('/')
                    if normalized_url in visited:
                        continue

                    visited.add(normalized_url)
                    visited.add(url) # Add both to be safe

                    logger.info(f"Crawling: {url}")

                    # Fetch
                    response, load_time = fetcher.fetch(url)
                    if not response:
                        logger.warning(f"Failed to fetch {url}")
                        continue

                    status_code = response.status_code
                    html_content = response.text

                    # Parse
                    parse_result = parser.parse(html_content, url)

                    # Analyze
                    issues = analyzer.analyze(parse_result, status_code)

                    # Save Page
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

                    # Save Links
                    # Only add internal links to queue
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

                        # Add to queue if internal and not visited
                        target_domain = urlparse(target_url).netloc
                        if target_domain.startswith('www.'):
                            target_domain = target_domain[4:]

                        if target_domain == current_domain:
                            if target_url not in visited and target_url.rstrip('/') not in visited:
                                queue.append(target_url)

                    for link_data in parse_result.get('external_links', []):
                         link = Link(
                            page_id=page.id,
                            target_url=link_data['url'],
                            type='external',
                            anchor_text=link_data['text']
                        )
                         session.add(link)

                    # Save Issues
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
