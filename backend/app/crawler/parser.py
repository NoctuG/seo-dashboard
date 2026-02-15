import hashlib
import json
from typing import Dict, Any
from urllib.parse import urlparse, urljoin

from bs4 import BeautifulSoup

class Parser:
    def parse(self, html_content: str, base_url: str) -> Dict[str, Any]:
        soup = BeautifulSoup(html_content, 'lxml')

        # Metadata
        title = soup.title.string.strip() if soup.title else None
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        description = meta_desc['content'].strip() if meta_desc and meta_desc.get('content') else None

        h1 = soup.find('h1')
        h1_text = h1.get_text().strip() if h1 else None

        heading_outline = []
        for heading in soup.find_all(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']):
            heading_outline.append(
                {
                    'level': int(heading.name[1]),
                    'text': heading.get_text().strip(),
                }
            )

        viewport_meta = soup.find('meta', attrs={'name': 'viewport'})
        viewport = viewport_meta['content'].strip() if viewport_meta and viewport_meta.get('content') else None

        canonical_tag = soup.find('link', attrs={'rel': lambda value: value and 'canonical' in value})
        canonical = urljoin(base_url, canonical_tag['href'].strip()) if canonical_tag and canonical_tag.get('href') else None

        robots_meta = soup.find('meta', attrs={'name': lambda value: value and value.lower() == 'robots'})
        robots_content = robots_meta['content'].lower() if robots_meta and robots_meta.get('content') else ''
        robots_directives = {
            directive.strip() for directive in robots_content.split(',') if directive.strip()
        }
        noindex = 'noindex' in robots_directives
        nofollow = 'nofollow' in robots_directives

        schema_org_json_ld = []
        structured_data_errors = []
        for script in soup.find_all('script', attrs={'type': 'application/ld+json'}):
            raw_payload = script.string or script.get_text()
            if not raw_payload:
                continue
            try:
                payload = json.loads(raw_payload)
                entries = payload if isinstance(payload, list) else [payload]
                for item in entries:
                    if isinstance(item, dict):
                        schema_org_json_ld.append(item)
            except json.JSONDecodeError as exc:
                structured_data_errors.append(f'Invalid JSON-LD: {exc.msg}')

        # Duplicate detection (simple hash of body text to ignore dynamic parts if possible, but full html for now)
        # Better: hash only text content
        text_content = soup.get_text()
        content_hash = hashlib.md5(text_content.encode('utf-8')).hexdigest()

        # Links
        internal_links = []
        external_links = []

        base_domain = urlparse(base_url).netloc
        if base_domain.startswith('www.'):
            base_domain = base_domain[4:]

        # Use a set to avoid duplicate links on the same page
        seen_links = set()

        for a in soup.find_all('a', href=True):
            href = a['href']
            # Normalize URL
            full_url = urljoin(base_url, href)
            parsed_url = urlparse(full_url)

            # Filter out non-http
            if parsed_url.scheme not in ('http', 'https'):
                continue

            # Remove fragment
            clean_url = full_url.split('#')[0]

            if clean_url in seen_links:
                continue
            seen_links.add(clean_url)

            anchor_text = a.get_text().strip()

            # Check domain (handle www vs non-www)
            link_domain = parsed_url.netloc
            if link_domain.startswith('www.'):
                link_domain = link_domain[4:]

            if link_domain == base_domain:
                internal_links.append({'url': clean_url, 'text': anchor_text})
            else:
                external_links.append({'url': clean_url, 'text': anchor_text})

        # Images without alt
        images_without_alt = []
        for img in soup.find_all('img'):
            if not img.get('alt'):
                src = img.get('src')
                if src:
                    images_without_alt.append(urljoin(base_url, src))

        return {
            'title': title,
            'description': description,
            'h1': h1_text,
            'heading_outline': heading_outline,
            'viewport': viewport,
            'canonical': canonical,
            'robots_meta': sorted(robots_directives),
            'noindex': noindex,
            'nofollow': nofollow,
            'schema_org_json_ld': schema_org_json_ld,
            'structured_data_errors': structured_data_errors,
            'content_hash': content_hash,
            'internal_links': internal_links,
            'external_links': external_links,
            'images_without_alt': images_without_alt
        }
