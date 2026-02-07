import hashlib
from typing import List, Tuple, Dict, Any
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import re

class Parser:
    def parse(self, html_content: str, base_url: str) -> Dict[str, Any]:
        soup = BeautifulSoup(html_content, 'lxml')

        # Metadata
        title = soup.title.string.strip() if soup.title else None
        meta_desc = soup.find('meta', attrs={'name': 'description'})
        description = meta_desc['content'].strip() if meta_desc and meta_desc.get('content') else None

        h1 = soup.find('h1')
        h1_text = h1.get_text().strip() if h1 else None

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
            'content_hash': content_hash,
            'internal_links': internal_links,
            'external_links': external_links,
            'images_without_alt': images_without_alt
        }
