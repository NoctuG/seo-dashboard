from __future__ import annotations

import threading
from time import perf_counter

from prometheus_client import Counter, Gauge, Histogram

HTTP_REQUESTS_TOTAL = Counter(
    "seo_dashboard_http_requests_total",
    "Total HTTP requests",
    ["method", "path", "status_code"],
)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "seo_dashboard_http_request_duration_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)

CRAWL_TASK_STATUS = Gauge(
    "seo_dashboard_crawl_task_status",
    "Current number of crawl tasks by status",
    ["status"],
)
CRAWL_RUNS_TOTAL = Counter(
    "seo_dashboard_crawl_runs_total",
    "Total crawl runs by terminal status",
    ["status"],
)
CRAWL_PAGES_PROCESSED_TOTAL = Counter(
    "seo_dashboard_crawl_pages_processed_total",
    "Total processed pages in crawler",
)
CRAWL_ERRORS_TOTAL = Counter(
    "seo_dashboard_crawl_errors_total",
    "Total crawler errors",
)
CRAWL_ISSUES_FOUND_TOTAL = Counter(
    "seo_dashboard_crawl_issues_found_total",
    "Total SEO issues found by crawler",
)

SCHEDULER_JOBS_TOTAL = Counter(
    "seo_dashboard_scheduler_jobs_total",
    "Total scheduler job executions by result",
    ["result"],
)
SCHEDULER_RETRIES_TOTAL = Counter(
    "seo_dashboard_scheduler_retries_total",
    "Total retries attempted by scheduler",
)
SCHEDULER_RELOADS_TOTAL = Counter(
    "seo_dashboard_scheduler_reloads_total",
    "Total scheduler reload operations",
)

KEYWORD_RANK_SCHEDULE_RUNS_TOTAL = Counter(
    "seo_dashboard_keyword_rank_schedule_runs_total",
    "Total keyword rank schedule runs by result",
    ["result"],
)
KEYWORD_RANK_SCHEDULE_DURATION_SECONDS = Histogram(
    "seo_dashboard_keyword_rank_schedule_duration_seconds",
    "Keyword rank schedule run duration in seconds",
)

DB_POOL_EVENTS_TOTAL = Counter(
    "seo_dashboard_db_pool_events_total",
    "Database connection pool events",
    ["event"],
)
DB_POOL_IN_USE = Gauge(
    "seo_dashboard_db_pool_in_use",
    "Database connections currently checked out from pool",
)

_db_in_use = 0
_db_lock = threading.Lock()


def observe_http_request(method: str, path: str, status_code: int, elapsed_seconds: float) -> None:
    HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status_code=str(status_code)).inc()
    HTTP_REQUEST_DURATION_SECONDS.labels(method=method, path=path).observe(elapsed_seconds)


def timed_request() -> float:
    return perf_counter()


def finish_timed_request(start_time: float) -> float:
    return perf_counter() - start_time


def update_crawl_status(previous_status: str | None, current_status: str) -> None:
    if previous_status:
        CRAWL_TASK_STATUS.labels(status=previous_status).dec()
    CRAWL_TASK_STATUS.labels(status=current_status).inc()


def record_db_pool_event(event: str) -> None:
    global _db_in_use
    DB_POOL_EVENTS_TOTAL.labels(event=event).inc()

    with _db_lock:
        if event == "checkout":
            _db_in_use += 1
        elif event == "checkin":
            _db_in_use = max(0, _db_in_use - 1)
        DB_POOL_IN_USE.set(_db_in_use)
