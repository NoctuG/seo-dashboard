from types import SimpleNamespace

import pytest

from app.config import Settings
from app.config import SettingsValidationError, validate_settings


def test_parse_allowed_origins_returns_safe_defaults_for_empty_value():
    origins = Settings._parse_allowed_origins("")

    assert origins == [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


def test_parse_allowed_origins_supports_single_domain():
    origins = Settings._parse_allowed_origins("https://app.example.com")

    assert origins == ["https://app.example.com"]


def test_parse_allowed_origins_supports_comma_separated_domains():
    origins = Settings._parse_allowed_origins("https://app.example.com, https://admin.example.com")

    assert origins == ["https://app.example.com", "https://admin.example.com"]


def test_parse_allowed_origins_supports_json_array():
    origins = Settings._parse_allowed_origins('["https://app.example.com", "https://admin.example.com"]')

    assert origins == ["https://app.example.com", "https://admin.example.com"]


def _base_settings(**overrides):
    data = {
        "ENV": "development",
        "DATABASE_URL": "sqlite:///test.db",
        "JWT_SECRET_KEY": "strong-secret-value-for-tests",
        "JWT_EXPIRE_MINUTES": 60,
        "SERP_API_PROVIDER": "serpapi",
        "BACKLINK_PROVIDER": "sample",
        "ANALYTICS_PROVIDER": "sample",
        "MOZ_API_KEY": "",
        "AHREFS_API_KEY": "",
        "MAJESTIC_API_KEY": "",
        "KEYWORD_RESEARCH_PROVIDER": "sample",
        "DATAFORSEO_LOGIN": "",
        "DATAFORSEO_PASSWORD": "",
        "SEMRUSH_API_KEY": "",
        "GA4_PROPERTY_ID": "",
        "GA4_ACCESS_TOKEN": "",
        "MATOMO_BASE_URL": "",
        "MATOMO_SITE_ID": "",
        "MATOMO_TOKEN_AUTH": "",
        "SMTP_HOST": "",
        "SMTP_FROM": "",
        "ALLOWED_ORIGINS": ["https://app.example.com"],
    }
    data.update(overrides)
    return SimpleNamespace(**data)


def test_validate_settings_rejects_default_jwt_secret_key():
    with pytest.raises(SettingsValidationError, match="JWT_SECRET_KEY"):
        validate_settings(_base_settings(JWT_SECRET_KEY="change-me"))


def test_validate_settings_rejects_missing_provider_credentials():
    with pytest.raises(SettingsValidationError, match="GA4_PROPERTY_ID"):
        validate_settings(_base_settings(ANALYTICS_PROVIDER="ga4"))


def test_validate_settings_applies_strict_production_rules():
    with pytest.raises(SettingsValidationError, match="at least 32 characters"):
        validate_settings(_base_settings(ENV="production", JWT_SECRET_KEY="short-prod-secret"))


def test_validate_settings_accepts_valid_production_settings():
    prod_settings = _base_settings(
        ENV="production",
        JWT_SECRET_KEY="prod-very-strong-and-long-jwt-secret-key",
        ALLOWED_ORIGINS=["https://app.example.com", "https://admin.example.com"],
    )

    validate_settings(prod_settings)


def test_validate_settings_requires_dataforseo_credentials_when_selected():
    with pytest.raises(SettingsValidationError, match="DATAFORSEO_LOGIN"):
        validate_settings(_base_settings(KEYWORD_RESEARCH_PROVIDER="dataforseo"))


def test_validate_settings_requires_semrush_key_when_selected():
    with pytest.raises(SettingsValidationError, match="SEMRUSH_API_KEY"):
        validate_settings(_base_settings(KEYWORD_RESEARCH_PROVIDER="semrush"))
