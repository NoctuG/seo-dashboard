from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlmodel import Session

from app.api.deps import require_superuser, write_audit_log
from app.db import get_session
from app.models import AuditActionType, User
from app.runtime_settings import DEFAULT_SYSTEM_SETTINGS, MASKED_SECRET, get_runtime_settings, save_system_settings

router = APIRouter()


class SMTPSettingsPayload(BaseModel):
    host: str = ""
    port: int = 587
    user: str = ""
    password: str = ""
    from_email: str = Field("", alias="from")
    use_tls: bool = True

    class Config:
        populate_by_name = True


class AnalyticsSettingsPayload(BaseModel):
    provider: str = "sample"
    ga4_property_id: str = ""
    ga4_access_token: str = ""
    matomo_base_url: str = ""
    matomo_site_id: str = ""
    matomo_token_auth: str = ""


class AISettingsPayload(BaseModel):
    base_url: str = ""
    api_key: str = ""
    model: str = "gpt-4o-mini"


class CrawlerSettingsPayload(BaseModel):
    default_max_pages: int = 50


class SystemSettingsPayload(BaseModel):
    smtp: SMTPSettingsPayload
    analytics: AnalyticsSettingsPayload
    ai: AISettingsPayload
    crawler: CrawlerSettingsPayload


class SystemSettingsResponse(SystemSettingsPayload):
    masked_fields: dict[str, list[str]]


@router.get("", response_model=SystemSettingsResponse)
def get_system_settings(
    _: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    runtime = get_runtime_settings(session)

    masked_fields = {
        "smtp": ["password"] if runtime.smtp_password else [],
        "analytics": [
            *(["ga4_access_token"] if runtime.ga4_access_token else []),
            *(["matomo_token_auth"] if runtime.matomo_token_auth else []),
        ],
        "ai": ["api_key"] if runtime.ai_api_key else [],
    }

    return SystemSettingsResponse(
        smtp={
            "host": runtime.smtp_host,
            "port": runtime.smtp_port,
            "user": runtime.smtp_user,
            "password": MASKED_SECRET if runtime.smtp_password else "",
            "from": runtime.smtp_from,
            "use_tls": runtime.smtp_use_tls,
        },
        analytics={
            "provider": runtime.analytics_provider,
            "ga4_property_id": runtime.ga4_property_id,
            "ga4_access_token": MASKED_SECRET if runtime.ga4_access_token else "",
            "matomo_base_url": runtime.matomo_base_url,
            "matomo_site_id": runtime.matomo_site_id,
            "matomo_token_auth": MASKED_SECRET if runtime.matomo_token_auth else "",
        },
        ai={
            "base_url": runtime.ai_base_url,
            "api_key": MASKED_SECRET if runtime.ai_api_key else "",
            "model": runtime.ai_model,
        },
        crawler={"default_max_pages": runtime.default_crawl_max_pages},
        masked_fields=masked_fields,
    )


@router.put("", response_model=SystemSettingsResponse)
def update_system_settings(
    payload: SystemSettingsPayload,
    current_user: User = Depends(require_superuser),
    session: Session = Depends(get_session),
):
    current_runtime = get_runtime_settings(session)

    smtp_password = payload.smtp.password
    if smtp_password == MASKED_SECRET:
        smtp_password = current_runtime.smtp_password

    ai_api_key = payload.ai.api_key
    if ai_api_key == MASKED_SECRET:
        ai_api_key = current_runtime.ai_api_key

    ga4_access_token = payload.analytics.ga4_access_token
    if ga4_access_token == MASKED_SECRET:
        ga4_access_token = current_runtime.ga4_access_token

    matomo_token_auth = payload.analytics.matomo_token_auth
    if matomo_token_auth == MASKED_SECRET:
        matomo_token_auth = current_runtime.matomo_token_auth

    smtp_store = {
        "host": payload.smtp.host,
        "port": payload.smtp.port,
        "user": payload.smtp.user,
        "password": smtp_password,
        "from": payload.smtp.from_email,
        "use_tls": payload.smtp.use_tls,
    }
    analytics_store = {
        "provider": payload.analytics.provider,
        "ga4_property_id": payload.analytics.ga4_property_id,
        "ga4_access_token": ga4_access_token,
        "matomo_base_url": payload.analytics.matomo_base_url,
        "matomo_site_id": payload.analytics.matomo_site_id,
        "matomo_token_auth": matomo_token_auth,
    }
    ai_store = {
        "base_url": payload.ai.base_url,
        "api_key": ai_api_key,
        "model": payload.ai.model,
    }
    crawler_store = {
        "default_max_pages": max(1, payload.crawler.default_max_pages),
    }

    save_system_settings(
        session=session,
        smtp=smtp_store,
        analytics=analytics_store,
        ai=ai_store,
        crawler=crawler_store,
    )

    write_audit_log(
        session=session,
        action=AuditActionType.SETTINGS_UPDATE,
        user_id=current_user.id,
        entity_type="system_settings",
        entity_id=1,
        metadata={
            "changed_groups": ["smtp", "analytics", "ai", "crawler"],
            "defaults_source": "environment",
            "defaults_snapshot": DEFAULT_SYSTEM_SETTINGS,
        },
    )

    return get_system_settings(current_user, session)
