import os
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def _read_frontend_package_version() -> str | None:
    package_json = BASE_DIR.parent / "frontend" / "package.json"
    if not package_json.exists():
        return None
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    version = str(payload.get("version", "")).strip()
    return version or None


def _read_git_version() -> str | None:
    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--always", "--dirty"],
            cwd=BASE_DIR.parent,
            capture_output=True,
            text=True,
            check=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return None
    version = result.stdout.strip()
    return version or None


def _resolve_version() -> tuple[str, str]:
    env_version = os.getenv("APP_VERSION", "").strip()
    if env_version:
        return env_version, "env"

    package_version = _read_frontend_package_version()
    if package_version:
        return package_version, "frontend/package.json"

    git_version = _read_git_version()
    if git_version:
        return git_version, "git"

    return "0.0.0-dev", "fallback"


class Settings:
    PROJECT_NAME: str = "SEO Tool"
    API_V1_STR: str = "/api/v1"
    APP_VERSION, APP_VERSION_SOURCE = _resolve_version()
    RELEASE_CHECK_ENABLED: bool = os.getenv("RELEASE_CHECK_ENABLED", "false").lower() == "true"
    RELEASE_CHECK_URL: str = os.getenv("RELEASE_CHECK_URL", "")

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "json")  # json or plain

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/seo_tool.db")

    # JWT auth
    ENV: str = os.getenv("ENV", os.getenv("APP_ENV", "development"))
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))
    JWT_REFRESH_EXPIRE_MINUTES: int = int(os.getenv("JWT_REFRESH_EXPIRE_MINUTES", "10080"))

    # bootstrap admin
    INITIAL_ADMIN_EMAIL: str = os.getenv("INITIAL_ADMIN_EMAIL", "")
    INITIAL_ADMIN_PASSWORD: str = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    INITIAL_ADMIN_NAME: str = os.getenv("INITIAL_ADMIN_NAME", "Administrator")

    # password reset
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "60"))
    PASSWORD_RESET_URL: str = os.getenv("PASSWORD_RESET_URL", "http://localhost:32000/reset-password")

    # SMTP
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")
    SMTP_TLS: bool = os.getenv("SMTP_TLS", os.getenv("SMTP_USE_TLS", "true")).lower() == "true"
    SMTP_USE_TLS: bool = SMTP_TLS

    # AI settings (OpenAI-compatible)
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "")
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    AI_MODEL: str = os.getenv("AI_MODEL", "gpt-4o-mini")

    # Crawl settings
    DEFAULT_CRAWL_MAX_PAGES: int = int(os.getenv("DEFAULT_CRAWL_MAX_PAGES", "50"))

    # Rate limit settings
    RATE_LIMIT_LOGIN: str = os.getenv("RATE_LIMIT_LOGIN", "5/minute")
    RATE_LIMIT_CRAWL_START: str = os.getenv("RATE_LIMIT_CRAWL_START", "2/minute")

    # Performance providers (optional)
    LIGHTHOUSE_API_URL: str = os.getenv("LIGHTHOUSE_API_URL", "")
    WEB_VITALS_API_URL: str = os.getenv("WEB_VITALS_API_URL", "")

    # backup
    BACKUP_DIR: str = os.getenv("BACKUP_DIR", "/data/backups")

    # webhook
    WEBHOOK_TIMEOUT_SECONDS: int = int(os.getenv("WEBHOOK_TIMEOUT_SECONDS", "8"))
    WEBHOOK_MAX_RETRIES: int = int(os.getenv("WEBHOOK_MAX_RETRIES", "3"))
    WEBHOOK_RETRY_BASE_SECONDS: int = int(os.getenv("WEBHOOK_RETRY_BASE_SECONDS", "1"))

    # CORS
    @staticmethod
    def _parse_allowed_origins(raw_value: str) -> list[str]:
        default_origins = [
            "http://localhost:32000",
            "http://127.0.0.1:32000",
            "http://localhost:32001",
            "http://127.0.0.1:32001",
        ]

        value = (raw_value or "").strip()
        if not value:
            return default_origins

        if value.startswith("["):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                origins = [str(item).strip() for item in parsed if str(item).strip()]
                return origins or default_origins

        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        return origins or default_origins

    ALLOWED_ORIGINS: list[str] = _parse_allowed_origins.__func__(os.getenv("ALLOWED_ORIGINS", ""))

    # SERP API settings
    SERP_API_KEY: str = os.getenv("SERP_API_KEY", "")
    SERP_API_PROVIDER: str = os.getenv("SERP_API_PROVIDER", "serpapi")  # serpapi or valueserp

    # Backlink providers
    BACKLINK_PROVIDER: str = os.getenv("BACKLINK_PROVIDER", "sample")  # sample, moz, ahrefs, majestic
    MOZ_API_KEY: str = os.getenv("MOZ_API_KEY", "")
    AHREFS_API_KEY: str = os.getenv("AHREFS_API_KEY", "")
    MAJESTIC_API_KEY: str = os.getenv("MAJESTIC_API_KEY", "")
    BACKLINK_CACHE_TTL_SECONDS: int = int(os.getenv("BACKLINK_CACHE_TTL_SECONDS", "21600"))

    # Keyword research providers
    KEYWORD_RESEARCH_PROVIDER: str = os.getenv("KEYWORD_RESEARCH_PROVIDER", "sample")  # sample, dataforseo, semrush
    DATAFORSEO_LOGIN: str = os.getenv("DATAFORSEO_LOGIN", "")
    DATAFORSEO_PASSWORD: str = os.getenv("DATAFORSEO_PASSWORD", "")
    SEMRUSH_API_KEY: str = os.getenv("SEMRUSH_API_KEY", "")

    # Web analytics settings
    ANALYTICS_PROVIDER: str = os.getenv("ANALYTICS_PROVIDER", "sample")  # sample, ga4, matomo
    ANALYTICS_MEANINGFUL_GROWTH_PCT: float = float(os.getenv("ANALYTICS_MEANINGFUL_GROWTH_PCT", "10"))

    # GA4 (optional, uses an externally managed OAuth access token)
    GA4_PROPERTY_ID: str = os.getenv("GA4_PROPERTY_ID", "")
    GA4_ACCESS_TOKEN: str = os.getenv("GA4_ACCESS_TOKEN", "")

    # Matomo (optional)
    MATOMO_BASE_URL: str = os.getenv("MATOMO_BASE_URL", "")
    MATOMO_SITE_ID: str = os.getenv("MATOMO_SITE_ID", "")
    MATOMO_TOKEN_AUTH: str = os.getenv("MATOMO_TOKEN_AUTH", "")

settings = Settings()


class SettingsValidationError(ValueError):
    """Raised when required runtime settings are invalid."""


def _is_production(env: str | None) -> bool:
    return (env or "").strip().lower() in {"prod", "production"}


def validate_settings(current_settings: Settings | SimpleNamespace = settings) -> None:
    errors: list[str] = []

    env = getattr(current_settings, "ENV", "development")
    is_production = _is_production(env)

    secret = (getattr(current_settings, "JWT_SECRET_KEY", "") or "").strip()
    weak_secrets = {"change-me", "changeme", "secret", "default", "123456", "password"}
    if not secret or secret in weak_secrets:
        errors.append("JWT_SECRET_KEY must be configured and cannot use default/weak value.")
    elif is_production and len(secret) < 32:
        errors.append("In production, JWT_SECRET_KEY must be at least 32 characters long.")

    if int(getattr(current_settings, "JWT_EXPIRE_MINUTES", 0)) <= 0:
        errors.append("JWT_EXPIRE_MINUTES must be a positive integer.")

    if not (getattr(current_settings, "DATABASE_URL", "") or "").strip():
        errors.append("DATABASE_URL must be set.")

    serp_provider = (getattr(current_settings, "SERP_API_PROVIDER", "serpapi") or "serpapi").lower()
    if serp_provider not in {"serpapi", "valueserp"}:
        errors.append("SERP_API_PROVIDER must be either 'serpapi' or 'valueserp'.")

    backlink_provider = (getattr(current_settings, "BACKLINK_PROVIDER", "sample") or "sample").lower()
    if backlink_provider not in {"sample", "moz", "ahrefs", "majestic"}:
        errors.append("BACKLINK_PROVIDER must be one of: sample, moz, ahrefs, majestic.")
    if backlink_provider == "moz" and not (getattr(current_settings, "MOZ_API_KEY", "") or "").strip():
        errors.append("MOZ_API_KEY is required when BACKLINK_PROVIDER=moz.")
    if backlink_provider == "ahrefs" and not (getattr(current_settings, "AHREFS_API_KEY", "") or "").strip():
        errors.append("AHREFS_API_KEY is required when BACKLINK_PROVIDER=ahrefs.")
    if backlink_provider == "majestic" and not (getattr(current_settings, "MAJESTIC_API_KEY", "") or "").strip():
        errors.append("MAJESTIC_API_KEY is required when BACKLINK_PROVIDER=majestic.")

    keyword_provider = (getattr(current_settings, "KEYWORD_RESEARCH_PROVIDER", "sample") or "sample").lower()
    if keyword_provider not in {"sample", "dataforseo", "semrush"}:
        errors.append("KEYWORD_RESEARCH_PROVIDER must be one of: sample, dataforseo, semrush.")
    if keyword_provider == "dataforseo":
        if not (getattr(current_settings, "DATAFORSEO_LOGIN", "") or "").strip():
            errors.append("DATAFORSEO_LOGIN is required when KEYWORD_RESEARCH_PROVIDER=dataforseo.")
        if not (getattr(current_settings, "DATAFORSEO_PASSWORD", "") or "").strip():
            errors.append("DATAFORSEO_PASSWORD is required when KEYWORD_RESEARCH_PROVIDER=dataforseo.")
    if keyword_provider == "semrush" and not (getattr(current_settings, "SEMRUSH_API_KEY", "") or "").strip():
        errors.append("SEMRUSH_API_KEY is required when KEYWORD_RESEARCH_PROVIDER=semrush.")

    analytics_provider = (getattr(current_settings, "ANALYTICS_PROVIDER", "sample") or "sample").lower()
    if analytics_provider not in {"sample", "ga4", "matomo"}:
        errors.append("ANALYTICS_PROVIDER must be one of: sample, ga4, matomo.")
    if analytics_provider == "ga4":
        if not (getattr(current_settings, "GA4_PROPERTY_ID", "") or "").strip():
            errors.append("GA4_PROPERTY_ID is required when ANALYTICS_PROVIDER=ga4.")
        if not (getattr(current_settings, "GA4_ACCESS_TOKEN", "") or "").strip():
            errors.append("GA4_ACCESS_TOKEN is required when ANALYTICS_PROVIDER=ga4.")
    if analytics_provider == "matomo":
        if not (getattr(current_settings, "MATOMO_BASE_URL", "") or "").strip():
            errors.append("MATOMO_BASE_URL is required when ANALYTICS_PROVIDER=matomo.")
        if not (getattr(current_settings, "MATOMO_SITE_ID", "") or "").strip():
            errors.append("MATOMO_SITE_ID is required when ANALYTICS_PROVIDER=matomo.")
        if not (getattr(current_settings, "MATOMO_TOKEN_AUTH", "") or "").strip():
            errors.append("MATOMO_TOKEN_AUTH is required when ANALYTICS_PROVIDER=matomo.")

    smtp_host = (getattr(current_settings, "SMTP_HOST", "") or "").strip()
    smtp_from = (getattr(current_settings, "SMTP_FROM", "") or "").strip()
    if (smtp_host and not smtp_from) or (smtp_from and not smtp_host):
        errors.append("SMTP_HOST and SMTP_FROM must be configured together.")

    if is_production and (getattr(current_settings, "ALLOWED_ORIGINS", None) or []) == [
        "http://localhost:32000",
        "http://127.0.0.1:32000",
        "http://localhost:32001",
        "http://127.0.0.1:32001",
    ]:
        errors.append("In production, ALLOWED_ORIGINS must be explicitly configured (not localhost defaults).")

    if errors:
        raise SettingsValidationError(f"Invalid application settings for ENV={env}: " + " ".join(errors))
