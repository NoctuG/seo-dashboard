import hashlib
import hmac
import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, List

import requests
from sqlmodel import Session, select

from app.config import settings
from app.models import WebhookConfig

logger = logging.getLogger(__name__)

WEBHOOK_EVENT_CRAWL_COMPLETED = "crawl.completed"
WEBHOOK_EVENT_CRITICAL_ISSUE_FOUND = "issue.critical_found"
WEBHOOK_EVENT_REPORT_GENERATED = "report.generated"
WEBHOOK_EVENT_RANK_DROPPED_SIGNIFICANTLY = "rank.dropped_significantly"
WEBHOOK_EVENT_SITE_AUDIT_SCORE_LOW = "site_audit.score_low"

TOP_10_THRESHOLD = 10
SIGNIFICANT_RANK_DROP_MIN_DELTA = 5
SITE_AUDIT_LOW_SCORE_THRESHOLD = 80

SUPPORTED_WEBHOOK_EVENTS = {
    WEBHOOK_EVENT_CRAWL_COMPLETED,
    WEBHOOK_EVENT_CRITICAL_ISSUE_FOUND,
    WEBHOOK_EVENT_REPORT_GENERATED,
    WEBHOOK_EVENT_RANK_DROPPED_SIGNIFICANTLY,
    WEBHOOK_EVENT_SITE_AUDIT_SCORE_LOW,
}


def is_significant_rank_drop(previous_rank: int | None, current_rank: int | None) -> bool:
    if previous_rank is None or current_rank is None:
        return False
    if previous_rank <= 0 or current_rank <= 0:
        return False

    dropped_out_of_top_10 = previous_rank <= TOP_10_THRESHOLD < current_rank
    large_delta_drop = (current_rank - previous_rank) >= SIGNIFICANT_RANK_DROP_MIN_DELTA
    return dropped_out_of_top_10 or large_delta_drop


class WebhookService:
    def _get_subscribers(self, session: Session, event: str) -> List[WebhookConfig]:
        if event not in SUPPORTED_WEBHOOK_EVENTS:
            logger.warning("Ignore unsupported webhook event: %s", event)
            return []

        candidates = session.exec(select(WebhookConfig).where(WebhookConfig.enabled == True)).all()  # noqa: E712
        subscribers: List[WebhookConfig] = []
        for config in candidates:
            try:
                subscribed_events = json.loads(config.subscribed_events_json or "[]")
            except json.JSONDecodeError:
                subscribed_events = []
            if not isinstance(subscribed_events, list):
                subscribed_events = []

            if event in subscribed_events or "*" in subscribed_events:
                subscribers.append(config)
        return subscribers

    def _build_signature(self, secret: str, timestamp: str, body: bytes) -> str:
        payload = timestamp.encode("utf-8") + b"." + body
        digest = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
        return f"sha256={digest}"

    def _post_with_retry(self, config: WebhookConfig, event: str, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        timestamp = datetime.utcnow().isoformat()
        signature = self._build_signature(config.secret, timestamp, body)

        max_retries = max(0, settings.WEBHOOK_MAX_RETRIES)
        base_delay = max(1, settings.WEBHOOK_RETRY_BASE_SECONDS)

        headers = {
            "Content-Type": "application/json",
            "X-SEO-Webhook-Event": event,
            "X-SEO-Webhook-Timestamp": timestamp,
            "X-SEO-Webhook-Signature": signature,
        }

        attempt = 0
        while True:
            try:
                response = requests.post(
                    config.url,
                    data=body,
                    headers=headers,
                    timeout=settings.WEBHOOK_TIMEOUT_SECONDS,
                )
                if response.status_code < 400:
                    return
                raise RuntimeError(f"HTTP {response.status_code}: {response.text[:300]}")
            except Exception as exc:
                if attempt >= max_retries:
                    logger.warning(
                        "Webhook delivery failed after retries: id=%s event=%s url=%s error=%s",
                        config.id,
                        event,
                        config.url,
                        exc,
                    )
                    return

                delay = base_delay * (2 ** attempt)
                attempt += 1
                logger.info(
                    "Webhook delivery failed, retrying: id=%s event=%s attempt=%s delay=%ss error=%s",
                    config.id,
                    event,
                    attempt,
                    delay,
                    exc,
                )
                time.sleep(delay)

    def dispatch_event(self, session: Session, event: str, payload: Dict[str, Any]) -> None:
        subscribers = self._get_subscribers(session, event)
        if not subscribers:
            return

        envelope = {
            "event": event,
            "sent_at": datetime.utcnow().isoformat(),
            "payload": payload,
        }

        for config in subscribers:
            self._post_with_retry(config, event, envelope)


webhook_service = WebhookService()
