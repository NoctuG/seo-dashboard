from app.webhook_service import (
    SUPPORTED_WEBHOOK_EVENTS,
    WEBHOOK_EVENT_CRAWL_STARTED,
    WEBHOOK_EVENT_RANK_DROPPED_SIGNIFICANTLY,
    WEBHOOK_EVENT_SERVER_ERROR_SURGE,
    WEBHOOK_EVENT_SITE_AUDIT_SCORE_LOW,
    is_significant_rank_drop,
)


def test_supported_webhook_events_include_alerting_events():
    assert WEBHOOK_EVENT_RANK_DROPPED_SIGNIFICANTLY in SUPPORTED_WEBHOOK_EVENTS
    assert WEBHOOK_EVENT_SITE_AUDIT_SCORE_LOW in SUPPORTED_WEBHOOK_EVENTS


def test_supported_webhook_events_include_new_events():
    assert WEBHOOK_EVENT_CRAWL_STARTED in SUPPORTED_WEBHOOK_EVENTS
    assert WEBHOOK_EVENT_SERVER_ERROR_SURGE in SUPPORTED_WEBHOOK_EVENTS


def test_is_significant_rank_drop_detects_drop_out_of_top_10():
    assert is_significant_rank_drop(6, 18) is True


def test_is_significant_rank_drop_detects_large_delta_drop():
    assert is_significant_rank_drop(32, 39) is True


def test_is_significant_rank_drop_ignores_minor_changes():
    assert is_significant_rank_drop(12, 14) is False

