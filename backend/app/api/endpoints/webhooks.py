import json
from datetime import datetime
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from app.api.deps import require_superuser
from app.db import get_session
from app.models import User, WebhookConfig
from app.schemas import WebhookConfigCreate, WebhookConfigRead, WebhookConfigUpdate
from app.webhook_service import SUPPORTED_WEBHOOK_EVENTS

router = APIRouter()


def _normalize_events(events: List[str]) -> List[str]:
    normalized = [event.strip() for event in events if event and event.strip()]
    invalid = [event for event in normalized if event != "*" and event not in SUPPORTED_WEBHOOK_EVENTS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unsupported events: {', '.join(invalid)}")
    return sorted(list(dict.fromkeys(normalized)))


def _to_read(model: WebhookConfig) -> WebhookConfigRead:
    try:
        events = json.loads(model.subscribed_events_json or "[]")
    except json.JSONDecodeError:
        events = []
    if not isinstance(events, list):
        events = []

    return WebhookConfigRead(
        id=model.id,
        url=model.url,
        secret=model.secret,
        subscribed_events=events,
        enabled=model.enabled,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


@router.get("/events", response_model=List[str])
def list_supported_events(_: User = Depends(require_superuser)):
    return sorted(list(SUPPORTED_WEBHOOK_EVENTS))


@router.get("", response_model=List[WebhookConfigRead])
def list_webhook_configs(session: Session = Depends(get_session), _: User = Depends(require_superuser)):
    configs = session.exec(select(WebhookConfig).order_by(WebhookConfig.created_at.desc())).all()
    return [_to_read(config) for config in configs]


@router.post("", response_model=WebhookConfigRead)
def create_webhook_config(
    payload: WebhookConfigCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_superuser),
):
    events = _normalize_events(payload.subscribed_events)
    config = WebhookConfig(
        url=payload.url,
        secret=payload.secret,
        subscribed_events_json=json.dumps(events, ensure_ascii=False),
        enabled=payload.enabled,
    )
    session.add(config)
    session.commit()
    session.refresh(config)
    return _to_read(config)


@router.put("/{webhook_id}", response_model=WebhookConfigRead)
def update_webhook_config(
    webhook_id: int,
    payload: WebhookConfigUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_superuser),
):
    config = session.get(WebhookConfig, webhook_id)
    if not config:
        raise HTTPException(status_code=404, detail="Webhook config not found")

    if payload.url is not None:
        config.url = payload.url
    if payload.secret is not None:
        config.secret = payload.secret
    if payload.subscribed_events is not None:
        config.subscribed_events_json = json.dumps(_normalize_events(payload.subscribed_events), ensure_ascii=False)
    if payload.enabled is not None:
        config.enabled = payload.enabled

    config.updated_at = datetime.utcnow()
    session.add(config)
    session.commit()
    session.refresh(config)
    return _to_read(config)


@router.delete("/{webhook_id}")
def delete_webhook_config(
    webhook_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_superuser),
):
    config = session.get(WebhookConfig, webhook_id)
    if not config:
        raise HTTPException(status_code=404, detail="Webhook config not found")

    session.delete(config)
    session.commit()
    return {"ok": True}
