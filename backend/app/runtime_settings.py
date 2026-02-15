from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session

from app.config import settings
from app.db import engine
from app.models import SystemSettings

MASKED_SECRET = "********"


@dataclass
class RuntimeSettings:
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str
    smtp_from: str
    smtp_use_tls: bool

    analytics_provider: str
    ga4_property_id: str
    ga4_access_token: str
    matomo_base_url: str
    matomo_site_id: str
    matomo_token_auth: str

    ai_base_url: str
    ai_api_key: str
    ai_model: str

    default_crawl_max_pages: int


DEFAULT_SYSTEM_SETTINGS = {
    "smtp": {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "user": settings.SMTP_USER,
        "password": settings.SMTP_PASSWORD,
        "from": settings.SMTP_FROM,
        "use_tls": settings.SMTP_USE_TLS,
    },
    "analytics": {
        "provider": settings.ANALYTICS_PROVIDER,
        "ga4_property_id": settings.GA4_PROPERTY_ID,
        "ga4_access_token": settings.GA4_ACCESS_TOKEN,
        "matomo_base_url": settings.MATOMO_BASE_URL,
        "matomo_site_id": settings.MATOMO_SITE_ID,
        "matomo_token_auth": settings.MATOMO_TOKEN_AUTH,
    },
    "ai": {
        "base_url": settings.AI_BASE_URL,
        "api_key": settings.AI_API_KEY,
        "model": settings.AI_MODEL,
    },
    "crawler": {
        "default_max_pages": settings.DEFAULT_CRAWL_MAX_PAGES,
    },
}


def _json_object(raw: str) -> dict:
    try:
        parsed = json.loads(raw or "{}")
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _to_int(value, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _to_bool(value, fallback: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.lower().strip()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return fallback


def _overlay(defaults: dict, override: dict) -> dict:
    merged = dict(defaults)
    for key, value in override.items():
        if value is not None:
            merged[key] = value
    return merged


def _from_row(row: SystemSettings | None) -> RuntimeSettings:
    smtp = dict(DEFAULT_SYSTEM_SETTINGS["smtp"])
    analytics = dict(DEFAULT_SYSTEM_SETTINGS["analytics"])
    ai = dict(DEFAULT_SYSTEM_SETTINGS["ai"])
    crawler = dict(DEFAULT_SYSTEM_SETTINGS["crawler"])

    if row:
        smtp = _overlay(smtp, _json_object(row.smtp_json))
        analytics = _overlay(analytics, _json_object(row.analytics_json))
        ai = _overlay(ai, _json_object(row.ai_json))
        crawler = _overlay(crawler, _json_object(row.crawler_json))

    return RuntimeSettings(
        smtp_host=str(smtp.get("host") or ""),
        smtp_port=_to_int(smtp.get("port"), settings.SMTP_PORT),
        smtp_user=str(smtp.get("user") or ""),
        smtp_password=str(smtp.get("password") or ""),
        smtp_from=str(smtp.get("from") or ""),
        smtp_use_tls=_to_bool(smtp.get("use_tls"), settings.SMTP_USE_TLS),
        analytics_provider=str(analytics.get("provider") or "sample"),
        ga4_property_id=str(analytics.get("ga4_property_id") or ""),
        ga4_access_token=str(analytics.get("ga4_access_token") or ""),
        matomo_base_url=str(analytics.get("matomo_base_url") or ""),
        matomo_site_id=str(analytics.get("matomo_site_id") or ""),
        matomo_token_auth=str(analytics.get("matomo_token_auth") or ""),
        ai_base_url=str(ai.get("base_url") or ""),
        ai_api_key=str(ai.get("api_key") or ""),
        ai_model=str(ai.get("model") or settings.AI_MODEL),
        default_crawl_max_pages=max(1, _to_int(crawler.get("default_max_pages"), settings.DEFAULT_CRAWL_MAX_PAGES)),
    )


def get_runtime_settings(session: Session | None = None) -> RuntimeSettings:
    if session is not None:
        return _from_row(session.get(SystemSettings, 1))

    try:
        with Session(engine) as local_session:
            return _from_row(local_session.get(SystemSettings, 1))
    except Exception:
        return _from_row(None)


def save_system_settings(
    session: Session,
    smtp: dict,
    analytics: dict,
    ai: dict,
    crawler: dict,
) -> SystemSettings:
    row = session.get(SystemSettings, 1)
    if not row:
        row = SystemSettings(id=1)

    row.smtp_json = json.dumps(smtp, ensure_ascii=False)
    row.analytics_json = json.dumps(analytics, ensure_ascii=False)
    row.ai_json = json.dumps(ai, ensure_ascii=False)
    row.crawler_json = json.dumps(crawler, ensure_ascii=False)
    row.updated_at = datetime.utcnow()

    session.add(row)
    session.commit()
    session.refresh(row)
    return row
