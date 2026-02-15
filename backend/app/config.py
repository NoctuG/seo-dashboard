import os
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

    # API auth (optional)
    API_USERNAME: str = os.getenv("API_USERNAME", "")
    API_PASSWORD: str = os.getenv("API_PASSWORD", "")

    # AI settings (OpenAI-compatible)
    AI_BASE_URL: str = os.getenv("AI_BASE_URL", "")
    AI_API_KEY: str = os.getenv("AI_API_KEY", "")
    AI_MODEL: str = os.getenv("AI_MODEL", "gpt-4o-mini")

    # Crawl settings
    DEFAULT_CRAWL_MAX_PAGES: int = int(os.getenv("DEFAULT_CRAWL_MAX_PAGES", "50"))

    # Performance providers (optional)
    LIGHTHOUSE_API_URL: str = os.getenv("LIGHTHOUSE_API_URL", "")
    WEB_VITALS_API_URL: str = os.getenv("WEB_VITALS_API_URL", "")

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
