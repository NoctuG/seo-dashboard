from __future__ import annotations

import logging
import random
import time
from dataclasses import dataclass, field
from typing import List, Optional, Protocol, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)


@dataclass
class ProxyConfig:
    """Configuration for a proxy server."""

    url: str  # e.g. "http://user:pass@proxy:8080" or "socks5://proxy:1080"
    weight: int = 1  # higher weight = selected more often
    failures: int = 0
    max_failures: int = 5  # disable proxy after this many consecutive failures


class ProxyPool:
    """Round-robin proxy pool with failure tracking and automatic disabling."""

    def __init__(self, proxies: List[ProxyConfig] | None = None) -> None:
        self._proxies: List[ProxyConfig] = list(proxies or [])
        self._index = 0

    @property
    def empty(self) -> bool:
        return len(self._proxies) == 0

    def add(self, proxy_url: str, weight: int = 1, max_failures: int = 5) -> None:
        self._proxies.append(ProxyConfig(url=proxy_url, weight=weight, max_failures=max_failures))

    def next(self) -> Optional[str]:
        """Return the next available proxy URL, or None if all are exhausted."""
        available = [p for p in self._proxies if p.failures < p.max_failures]
        if not available:
            return None
        # Weighted random selection for better distribution
        total_weight = sum(p.weight for p in available)
        r = random.uniform(0, total_weight)
        cumulative = 0.0
        for proxy in available:
            cumulative += proxy.weight
            if r <= cumulative:
                return proxy.url
        return available[-1].url

    def report_success(self, proxy_url: str) -> None:
        for p in self._proxies:
            if p.url == proxy_url:
                p.failures = 0
                break

    def report_failure(self, proxy_url: str) -> None:
        for p in self._proxies:
            if p.url == proxy_url:
                p.failures += 1
                if p.failures >= p.max_failures:
                    logger.warning("Proxy %s disabled after %d consecutive failures", proxy_url, p.failures)
                break

    def reset_all(self) -> None:
        for p in self._proxies:
            p.failures = 0

    def active_count(self) -> int:
        return sum(1 for p in self._proxies if p.failures < p.max_failures)

    def total_count(self) -> int:
        return len(self._proxies)


class FetchResult(Protocol):
    """Protocol for fetch results from any fetcher backend."""

    @property
    def status_code(self) -> int: ...

    @property
    def text(self) -> str: ...

    @property
    def url(self) -> str: ...

    @property
    def headers(self) -> dict: ...

    @property
    def history(self) -> list: ...


@dataclass
class FetcherConfig:
    """Configuration for the Fetcher."""

    delay: float = 1.0
    timeout: int = 10
    max_retries: int = 3
    backoff_factor: float = 1.0
    backoff_max: float = 30.0
    user_agent: str = "SEO-Tool-Crawler/1.0"
    proxy_urls: List[str] = field(default_factory=list)
    rendering_mode: str = "html"  # "html" (requests only) or "js" (headless browser)


class Fetcher:
    def __init__(
        self,
        delay: float = 1.0,
        config: FetcherConfig | None = None,
    ):
        if config:
            self._config = config
        else:
            self._config = FetcherConfig(delay=delay)

        self.delay = self._config.delay
        self.last_request_time: float = 0
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": self._config.user_agent,
        })

        # Configure retries at the transport level
        retries = Retry(
            total=self._config.max_retries,
            backoff_factor=self._config.backoff_factor,
            status_forcelist=[500, 502, 503, 504],
        )
        self.session.mount('http://', HTTPAdapter(max_retries=retries))
        self.session.mount('https://', HTTPAdapter(max_retries=retries))

        # Proxy pool
        self.proxy_pool = ProxyPool()
        for proxy_url in self._config.proxy_urls:
            self.proxy_pool.add(proxy_url)

        # Headless browser backend (lazy-initialized)
        self._headless_fetcher: Optional[HeadlessFetcher] = None

    @property
    def rendering_mode(self) -> str:
        return self._config.rendering_mode

    def _get_proxies_dict(self) -> Optional[dict]:
        """Get proxy dict for requests, or None if no proxies configured."""
        if self.proxy_pool.empty:
            return None
        proxy_url = self.proxy_pool.next()
        if proxy_url is None:
            logger.warning("All proxies exhausted, falling back to direct connection")
            return None
        return {"http": proxy_url, "https": proxy_url}

    def _throttle(self) -> None:
        """Enforce request delay (rate limiting)."""
        elapsed = time.time() - self.last_request_time
        if elapsed < self.delay:
            time.sleep(self.delay - elapsed)

    def _fetch_with_backoff(self, url: str) -> Tuple[Optional[requests.Response], int]:
        """Fetch with application-level exponential backoff and proxy rotation."""
        max_attempts = self._config.max_retries + 1
        backoff = self._config.backoff_factor

        for attempt in range(max_attempts):
            proxy_dict = self._get_proxies_dict()
            proxy_url = (proxy_dict or {}).get("https")

            try:
                start = time.time()
                response = self.session.get(
                    url,
                    timeout=self._config.timeout,
                    proxies=proxy_dict,
                )
                load_time = int((time.time() - start) * 1000)
                self.last_request_time = time.time()

                # Report proxy success
                if proxy_url:
                    self.proxy_pool.report_success(proxy_url)

                return response, load_time

            except requests.RequestException as e:
                # Report proxy failure
                if proxy_url:
                    self.proxy_pool.report_failure(proxy_url)

                if attempt < max_attempts - 1:
                    wait = min(backoff * (2 ** attempt), self._config.backoff_max)
                    # Add jitter to prevent thundering herd
                    wait = wait * (0.5 + random.random() * 0.5)
                    logger.warning(
                        "Fetch attempt %d/%d failed for %s (proxy=%s): %s. Retrying in %.1fs",
                        attempt + 1,
                        max_attempts,
                        url,
                        proxy_url or "direct",
                        e,
                        wait,
                    )
                    time.sleep(wait)
                else:
                    logger.error(
                        "All %d fetch attempts failed for %s: %s",
                        max_attempts,
                        url,
                        e,
                    )

        return None, 0

    def fetch(self, url: str) -> Tuple[Optional[requests.Response], int]:
        """Fetch a URL, using configured rendering mode.

        Returns (response, load_time_ms) tuple. Response is None on failure.
        """
        self._throttle()

        # If JS rendering is requested, try headless browser first
        if self._config.rendering_mode == "js":
            result = self._fetch_headless(url)
            if result[0] is not None:
                return result
            # Fall back to plain HTTP if headless fails
            logger.info("Headless fetch failed for %s, falling back to HTTP", url)

        return self._fetch_with_backoff(url)

    def _fetch_headless(self, url: str) -> Tuple[Optional[requests.Response], int]:
        """Try to fetch using headless browser (Playwright)."""
        if self._headless_fetcher is None:
            try:
                self._headless_fetcher = HeadlessFetcher(
                    timeout_ms=self._config.timeout * 1000,
                    user_agent=self._config.user_agent,
                )
            except HeadlessBrowserUnavailable:
                logger.warning(
                    "Playwright not available; JS rendering disabled. "
                    "Install with: pip install playwright && playwright install chromium"
                )
                # Permanently disable headless for this fetcher instance
                self._config = FetcherConfig(
                    delay=self._config.delay,
                    timeout=self._config.timeout,
                    max_retries=self._config.max_retries,
                    backoff_factor=self._config.backoff_factor,
                    backoff_max=self._config.backoff_max,
                    user_agent=self._config.user_agent,
                    proxy_urls=self._config.proxy_urls,
                    rendering_mode="html",
                )
                return None, 0

        try:
            return self._headless_fetcher.fetch(url)
        except Exception as e:
            logger.warning("Headless fetch error for %s: %s", url, e)
            return None, 0

    def close(self) -> None:
        """Clean up resources."""
        self.session.close()
        if self._headless_fetcher is not None:
            self._headless_fetcher.close()


class HeadlessBrowserUnavailable(RuntimeError):
    """Raised when Playwright is not installed."""


class PlaywrightResponse:
    """Wrapper to make Playwright response look like requests.Response."""

    def __init__(self, status_code: int, body: str, final_url: str, headers: dict, history: list | None = None):
        self.status_code = status_code
        self.text = body
        self.url = final_url
        self.headers = headers
        self.history = history or []


class HeadlessFetcher:
    """Playwright-based headless browser fetcher for JS-rendered pages."""

    def __init__(self, timeout_ms: int = 10000, user_agent: str = "SEO-Tool-Crawler/1.0"):
        self._timeout_ms = timeout_ms
        self._user_agent = user_agent
        self._playwright = None
        self._browser = None
        self._start()

    def _start(self) -> None:
        try:
            from playwright.sync_api import sync_playwright  # type: ignore[import-untyped]
        except ImportError as exc:
            raise HeadlessBrowserUnavailable(
                "playwright is not installed. Install with: pip install playwright && playwright install chromium"
            ) from exc

        self._playwright = sync_playwright().start()
        try:
            self._browser = self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
        except Exception as exc:
            self._playwright.stop()
            self._playwright = None
            raise HeadlessBrowserUnavailable(
                f"Failed to launch Chromium: {exc}. Run: playwright install chromium"
            ) from exc

    def fetch(self, url: str) -> Tuple[Optional[PlaywrightResponse], int]:
        if self._browser is None:
            return None, 0

        context = self._browser.new_context(user_agent=self._user_agent)
        page = context.new_page()

        try:
            start = time.time()
            response = page.goto(url, wait_until="networkidle", timeout=self._timeout_ms)
            load_time = int((time.time() - start) * 1000)

            if response is None:
                return None, 0

            body = page.content()
            status_code = response.status
            final_url = page.url
            headers = dict(response.headers)

            return PlaywrightResponse(
                status_code=status_code,
                body=body,
                final_url=final_url,
                headers=headers,
            ), load_time

        except Exception as e:
            logger.warning("Playwright page load error for %s: %s", url, e)
            return None, 0
        finally:
            page.close()
            context.close()

    def close(self) -> None:
        if self._browser:
            self._browser.close()
            self._browser = None
        if self._playwright:
            self._playwright.stop()
            self._playwright = None
