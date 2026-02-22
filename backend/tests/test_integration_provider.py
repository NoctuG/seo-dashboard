"""Tests for the integration provider interface and registry."""

from app.integrations.provider import (
    IntegrationHealth,
    IntegrationResult,
    IntegrationStatus,
    get_all_status,
    get_provider,
    list_providers,
    register_provider,
    _providers,
)


class _DummyProvider:
    name = "test_provider"
    display_name = "Test Provider"
    category = "search_console"

    def __init__(self, configured: bool = True, healthy: bool = True):
        self._configured = configured
        self._healthy = healthy

    def is_configured(self) -> bool:
        return self._configured

    def validate_credentials(self) -> IntegrationStatus:
        if self._healthy:
            return IntegrationStatus(healthy=True, health=IntegrationHealth.OK, message="All good")
        return IntegrationStatus(healthy=False, health=IntegrationHealth.ERROR, message="Auth failed")

    def fetch_data(self, params: dict) -> IntegrationResult:
        return IntegrationResult(success=True, data={"test": True})


class TestProviderRegistry:
    def setup_method(self):
        _providers.clear()

    def test_register_and_get(self):
        provider = _DummyProvider()
        register_provider(provider)
        assert get_provider("test_provider") is provider

    def test_get_missing_provider(self):
        assert get_provider("nonexistent") is None

    def test_list_providers(self):
        register_provider(_DummyProvider())
        providers = list_providers()
        assert len(providers) == 1
        assert providers[0].name == "test_provider"

    def test_list_providers_by_category(self):
        register_provider(_DummyProvider())
        assert len(list_providers(category="search_console")) == 1
        assert len(list_providers(category="analytics")) == 0

    def test_get_all_status_configured(self):
        register_provider(_DummyProvider(configured=True, healthy=True))
        statuses = get_all_status()
        assert len(statuses) == 1
        assert statuses[0]["health"] == "ok"

    def test_get_all_status_not_configured(self):
        register_provider(_DummyProvider(configured=False))
        statuses = get_all_status()
        assert statuses[0]["health"] == "not_configured"

    def test_get_all_status_error(self):
        register_provider(_DummyProvider(configured=True, healthy=False))
        statuses = get_all_status()
        assert statuses[0]["health"] == "error"
