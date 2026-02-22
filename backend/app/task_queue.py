"""Lightweight in-process task queue for decoupling long-running tasks from the API.

This module provides a simple thread-pool-based task runner that decouples
crawl jobs, SERP checks, and AI generation tasks from the API request/response
cycle.  It is intentionally minimal so that it can be swapped out for a
Redis-backed queue (e.g. ARQ, RQ, Celery) when the deployment outgrows a
single process.

Usage
-----
    from app.task_queue import task_queue

    # Submit a task (non-blocking)
    task_id = task_queue.submit("crawl", crawl_fn, crawl_id=42, max_pages=100)

    # Check status
    status = task_queue.status(task_id)
    # => {"task_id": "...", "state": "running", "submitted_at": "..."}

    # Cancel (best-effort)
    task_queue.cancel(task_id)
"""

from __future__ import annotations

import logging
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger(__name__)

_DEFAULT_MAX_WORKERS = 4


class TaskState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskInfo:
    task_id: str
    category: str  # e.g. "crawl", "serp_check", "ai_generate"
    state: TaskState = TaskState.PENDING
    submitted_at: datetime = field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    error: Optional[str] = None
    result: Any = None


class TaskQueue:
    """In-process async task queue backed by a thread pool.

    Thread-safe.  All long-running work (crawling, SERP checks, AI generation)
    should be submitted here instead of running inline in API handlers.

    The queue enforces a configurable concurrency limit (``max_workers``) which
    caps CPU/memory usage.  Tasks that exceed the pool size wait in a FIFO queue.
    """

    def __init__(self, max_workers: int = _DEFAULT_MAX_WORKERS) -> None:
        self._max_workers = max(1, max_workers)
        self._executor = ThreadPoolExecutor(
            max_workers=self._max_workers,
            thread_name_prefix="task-queue",
        )
        self._lock = threading.Lock()
        self._tasks: Dict[str, TaskInfo] = {}
        self._futures: Dict[str, Future] = {}

    # -- Public API -----------------------------------------------------------

    def submit(self, category: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> str:
        """Submit a callable for background execution.

        Returns a unique task_id that can be used to query status or cancel.
        """
        task_id = uuid.uuid4().hex
        info = TaskInfo(task_id=task_id, category=category)

        with self._lock:
            self._tasks[task_id] = info
            future = self._executor.submit(self._run_task, task_id, fn, *args, **kwargs)
            self._futures[task_id] = future

        logger.info("Task submitted: id=%s category=%s", task_id, category)
        return task_id

    def status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """Return current status of a task, or None if unknown."""
        with self._lock:
            info = self._tasks.get(task_id)
        if info is None:
            return None
        return {
            "task_id": info.task_id,
            "category": info.category,
            "state": info.state.value,
            "submitted_at": info.submitted_at.isoformat(),
            "started_at": info.started_at.isoformat() if info.started_at else None,
            "finished_at": info.finished_at.isoformat() if info.finished_at else None,
            "error": info.error,
        }

    def cancel(self, task_id: str) -> bool:
        """Best-effort cancellation.  Returns True if the task was still pending."""
        with self._lock:
            future = self._futures.get(task_id)
            info = self._tasks.get(task_id)

        if future is None or info is None:
            return False

        cancelled = future.cancel()
        if cancelled:
            with self._lock:
                info.state = TaskState.CANCELLED
                info.finished_at = datetime.utcnow()
            logger.info("Task cancelled: id=%s", task_id)

        return cancelled

    def active_count(self) -> int:
        """Number of currently running tasks."""
        with self._lock:
            return sum(1 for info in self._tasks.values() if info.state == TaskState.RUNNING)

    def pending_count(self) -> int:
        """Number of tasks waiting in the queue."""
        with self._lock:
            return sum(1 for info in self._tasks.values() if info.state == TaskState.PENDING)

    def get_queue_stats(self) -> Dict[str, Any]:
        """Return overall queue statistics."""
        with self._lock:
            states = {}
            for info in self._tasks.values():
                states[info.state.value] = states.get(info.state.value, 0) + 1
        return {
            "max_workers": self._max_workers,
            "total_tasks": len(self._tasks),
            **states,
        }

    def shutdown(self, wait: bool = True) -> None:
        """Shutdown the thread pool.  Called on application shutdown."""
        logger.info("Task queue shutting down (wait=%s)", wait)
        self._executor.shutdown(wait=wait)

    def cleanup_finished(self, max_age_seconds: int = 3600) -> int:
        """Remove completed/failed/cancelled task records older than max_age_seconds."""
        cutoff = datetime.utcnow()
        removed = 0
        with self._lock:
            to_remove = []
            for task_id, info in self._tasks.items():
                if info.state in (TaskState.COMPLETED, TaskState.FAILED, TaskState.CANCELLED):
                    if info.finished_at and (cutoff - info.finished_at).total_seconds() > max_age_seconds:
                        to_remove.append(task_id)
            for task_id in to_remove:
                del self._tasks[task_id]
                self._futures.pop(task_id, None)
                removed += 1
        return removed

    # -- Internal -------------------------------------------------------------

    def _run_task(self, task_id: str, fn: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        with self._lock:
            info = self._tasks.get(task_id)
            if info is None:
                return None
            info.state = TaskState.RUNNING
            info.started_at = datetime.utcnow()

        try:
            result = fn(*args, **kwargs)
            with self._lock:
                info.state = TaskState.COMPLETED
                info.finished_at = datetime.utcnow()
                info.result = result
            logger.info("Task completed: id=%s category=%s", task_id, info.category)
            return result
        except Exception as exc:
            with self._lock:
                info.state = TaskState.FAILED
                info.finished_at = datetime.utcnow()
                info.error = str(exc)
            logger.exception("Task failed: id=%s category=%s error=%s", task_id, info.category, exc)
            raise


# Module-level singleton
task_queue = TaskQueue()
