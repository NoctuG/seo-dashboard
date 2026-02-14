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

settings = Settings()
