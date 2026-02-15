import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "SEO Tool"
    API_V1_STR: str = "/api/v1"

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR}/seo_tool.db")

    # JWT auth
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "change-me")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    JWT_EXPIRE_MINUTES: int = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

    # bootstrap admin
    INITIAL_ADMIN_EMAIL: str = os.getenv("INITIAL_ADMIN_EMAIL", "")
    INITIAL_ADMIN_PASSWORD: str = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    INITIAL_ADMIN_NAME: str = os.getenv("INITIAL_ADMIN_NAME", "Administrator")

    # password reset
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("PASSWORD_RESET_TOKEN_EXPIRE_MINUTES", "60"))
    PASSWORD_RESET_URL: str = os.getenv("PASSWORD_RESET_URL", "http://localhost:5173/reset-password")

    # SMTP
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() == "true"

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

    # CORS
    @staticmethod
    def _parse_allowed_origins(raw_value: str) -> list[str]:
        default_origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
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
