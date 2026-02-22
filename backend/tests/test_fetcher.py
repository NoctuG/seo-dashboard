"""Tests for the enhanced fetcher module (proxy pool, backoff, rendering modes)."""

from unittest.mock import MagicMock, patch

from app.crawler.fetcher import (
    Fetcher,
    FetcherConfig,
    HeadlessBrowserUnavailable,
    PlaywrightResponse,
    ProxyConfig,
    ProxyPool,
)


class TestProxyPool:
    def test_empty_pool(self):
        pool = ProxyPool()
        assert pool.empty
        assert pool.next() is None
        assert pool.active_count() == 0

    def test_add_and_next(self):
        pool = ProxyPool()
        pool.add("http://proxy1:8080")
        pool.add("http://proxy2:8080")
        assert not pool.empty
        assert pool.total_count() == 2
        assert pool.active_count() == 2

        proxy = pool.next()
        assert proxy in ("http://proxy1:8080", "http://proxy2:8080")

    def test_failure_tracking(self):
        pool = ProxyPool([ProxyConfig(url="http://proxy1:8080", max_failures=2)])
        assert pool.active_count() == 1

        pool.report_failure("http://proxy1:8080")
        assert pool.active_count() == 1  # still active after 1 failure

        pool.report_failure("http://proxy1:8080")
        assert pool.active_count() == 0  # disabled after 2 failures
        assert pool.next() is None

    def test_success_resets_failures(self):
        pool = ProxyPool([ProxyConfig(url="http://proxy1:8080", max_failures=3)])

        pool.report_failure("http://proxy1:8080")
        pool.report_failure("http://proxy1:8080")
        pool.report_success("http://proxy1:8080")

        # Failures should be reset
        assert pool.active_count() == 1

    def test_reset_all(self):
        pool = ProxyPool([
            ProxyConfig(url="http://proxy1:8080", max_failures=1),
            ProxyConfig(url="http://proxy2:8080", max_failures=1),
        ])
        pool.report_failure("http://proxy1:8080")
        pool.report_failure("http://proxy2:8080")
        assert pool.active_count() == 0

        pool.reset_all()
        assert pool.active_count() == 2

    def test_weighted_selection(self):
        pool = ProxyPool([
            ProxyConfig(url="http://proxy1:8080", weight=10),
            ProxyConfig(url="http://proxy2:8080", weight=1),
        ])
        # With weight 10 vs 1, proxy1 should be selected far more often
        selections = [pool.next() for _ in range(100)]
        proxy1_count = selections.count("http://proxy1:8080")
        assert proxy1_count > 50  # should be heavily skewed


class TestFetcherConfig:
    def test_default_config(self):
        config = FetcherConfig()
        assert config.delay == 1.0
        assert config.timeout == 10
        assert config.max_retries == 3
        assert config.rendering_mode == "html"
        assert config.proxy_urls == []

    def test_custom_config(self):
        config = FetcherConfig(
            delay=0.5,
            timeout=20,
            rendering_mode="js",
            proxy_urls=["http://proxy1:8080"],
        )
        assert config.delay == 0.5
        assert config.rendering_mode == "js"
        assert len(config.proxy_urls) == 1


class TestFetcher:
    def test_fetcher_creates_session_with_user_agent(self):
        fetcher = Fetcher()
        assert "SEO-Tool-Crawler" in fetcher.session.headers["User-Agent"]
        fetcher.close()

    def test_fetcher_with_proxy_config(self):
        config = FetcherConfig(proxy_urls=["http://proxy1:8080", "http://proxy2:8080"])
        fetcher = Fetcher(config=config)
        assert fetcher.proxy_pool.total_count() == 2
        fetcher.close()

    def test_fetcher_rendering_mode(self):
        config = FetcherConfig(rendering_mode="js")
        fetcher = Fetcher(config=config)
        assert fetcher.rendering_mode == "js"
        fetcher.close()

    @patch("app.crawler.fetcher.requests.Session")
    def test_fetch_html_mode_uses_session(self, mock_session_cls):
        mock_session = MagicMock()
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_session.get.return_value = mock_response
        mock_session_cls.return_value = mock_session

        config = FetcherConfig(rendering_mode="html", delay=0)
        fetcher = Fetcher(config=config)
        fetcher.session = mock_session

        response, load_time = fetcher.fetch("http://example.com")
        assert response is not None
        assert response.status_code == 200
        fetcher.close()

    def test_headless_fetcher_unavailable_falls_back(self):
        """When Playwright is not installed, JS mode should fall back to HTML."""
        config = FetcherConfig(rendering_mode="js", delay=0)
        fetcher = Fetcher(config=config)

        # Simulate Playwright not being available
        with patch.object(fetcher, "_fetch_headless", return_value=(None, 0)):
            with patch.object(fetcher, "_fetch_with_backoff", return_value=(MagicMock(status_code=200), 100)):
                response, load_time = fetcher.fetch("http://example.com")
                assert response is not None
                assert load_time == 100
        fetcher.close()


class TestPlaywrightResponse:
    def test_response_wrapper(self):
        resp = PlaywrightResponse(
            status_code=200,
            body="<html>test</html>",
            final_url="http://example.com",
            headers={"content-type": "text/html"},
        )
        assert resp.status_code == 200
        assert resp.text == "<html>test</html>"
        assert resp.url == "http://example.com"
        assert resp.headers["content-type"] == "text/html"
        assert resp.history == []
