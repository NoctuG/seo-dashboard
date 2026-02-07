import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging

logger = logging.getLogger(__name__)

class Fetcher:
    def __init__(self, delay: float = 1.0):
        self.delay = delay
        self.last_request_time = 0
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "SEO-Tool-Crawler/1.0"
        })

        # Configure retries
        retries = Retry(total=3, backoff_factor=1, status_forcelist=[500, 502, 503, 504])
        self.session.mount('http://', HTTPAdapter(max_retries=retries))
        self.session.mount('https://', HTTPAdapter(max_retries=retries))

    def fetch(self, url: str):
        # Rate limiting
        elapsed = time.time() - self.last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

        try:
            start = time.time()
            response = self.session.get(url, timeout=10)
            load_time = (time.time() - start) * 1000 # ms
            self.last_request_time = time.time()
            return response, int(load_time)
        except requests.RequestException as e:
            logger.error(f"Error fetching {url}: {e}")
            return None, 0
