"""Integration provider interface for external SEO data sources.

This module defines a pluggable interface that allows the SEO Dashboard to
connect to third-party services such as Google Search Console, Bing Webmaster
Tools, Ahrefs API, Semrush API, etc.

To add a new integration:
1. Implement the ``IntegrationProvider`` protocol
2. Register it via ``register_provider()``
3. Retrieve it via ``get_provider()``

Example::

    class GoogleSearchConsoleProvider:
        name = "google_search_console"
        display_name = "Google Search Console"
        category = "search_console"

        def is_configured(self) -> bool:
            return bool(os.getenv("GSC_CREDENTIALS_JSON"))

        def validate_credentials(self) -> IntegrationStatus:
            ...

        def fetch_data(self, params: dict) -> IntegrationResult:
            ...

    register_provider(GoogleSearchConsoleProvider())
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


class IntegrationCategory(str, Enum):
    """Categories of integrations."""

    SEARCH_CONSOLE = "search_console"  # Google Search Console, Bing Webmaster
    ANALYTICS = "analytics"  # GA4, Matomo
    BACKLINKS = "backlinks"  # Ahrefs, Moz, Majestic
    KEYWORD_RESEARCH = "keyword_research"  # DataForSEO, Semrush
    CONTENT = "content"  # AI content services
    NOTIFICATION = "notification"  # Slack, Discord, Email


class IntegrationHealth(str, Enum):
    """Health status of an integration."""

    OK = "ok"
    DEGRADED = "degraded"
    ERROR = "error"
    NOT_CONFIGURED = "not_configured"


@dataclass
class IntegrationStatus:
    """Result of a credential/connectivity check."""

    healthy: bool
    health: IntegrationHealth = IntegrationHealth.OK
    message: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IntegrationResult:
    """Result of a data fetch from an integration."""

    success: bool
    data: Any = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class IntegrationProvider(Protocol):
    """Protocol that all integration providers must implement.

    This is the extension point for third-party service integrations.
    Community contributors can implement this protocol to add support
    for new data sources (e.g. Google Search Console, Bing Webmaster,
    Ahrefs, Semrush, etc.).
    """

    @property
    def name(self) -> str:
        """Unique machine-readable identifier (e.g. 'google_search_console')."""
        ...

    @property
    def display_name(self) -> str:
        """Human-readable name for the UI."""
        ...

    @property
    def category(self) -> str:
        """Integration category (see IntegrationCategory)."""
        ...

    def is_configured(self) -> bool:
        """Return True if the provider has the required credentials/config."""
        ...

    def validate_credentials(self) -> IntegrationStatus:
        """Test that the stored credentials are valid and the service is reachable."""
        ...

    def fetch_data(self, params: Dict[str, Any]) -> IntegrationResult:
        """Fetch data from the external service.

        ``params`` is a flexible dict whose keys depend on the provider type.
        For example a search console provider might accept::

            {"site_url": "https://example.com", "date_range": "7d"}

        While a backlinks provider might accept::

            {"domain": "example.com", "limit": 100}
        """
        ...


# --- Registry ---------------------------------------------------------------

_providers: Dict[str, IntegrationProvider] = {}


def register_provider(provider: IntegrationProvider) -> None:
    """Register an integration provider.  Overwrites any existing provider with the same name."""
    _providers[provider.name] = provider
    logger.info("Registered integration provider: %s (%s)", provider.name, provider.display_name)


def get_provider(name: str) -> Optional[IntegrationProvider]:
    """Get a registered provider by name."""
    return _providers.get(name)


def list_providers(category: Optional[str] = None) -> List[IntegrationProvider]:
    """List all registered providers, optionally filtered by category."""
    if category:
        return [p for p in _providers.values() if p.category == category]
    return list(_providers.values())


def get_all_status() -> List[Dict[str, Any]]:
    """Return the status of all registered integrations."""
    results = []
    for provider in _providers.values():
        if not provider.is_configured():
            results.append({
                "name": provider.name,
                "display_name": provider.display_name,
                "category": provider.category,
                "health": IntegrationHealth.NOT_CONFIGURED.value,
                "message": "Not configured",
            })
            continue

        try:
            status = provider.validate_credentials()
            results.append({
                "name": provider.name,
                "display_name": provider.display_name,
                "category": provider.category,
                "health": status.health.value,
                "message": status.message,
                **status.metadata,
            })
        except Exception as exc:
            results.append({
                "name": provider.name,
                "display_name": provider.display_name,
                "category": provider.category,
                "health": IntegrationHealth.ERROR.value,
                "message": str(exc),
            })
    return results
