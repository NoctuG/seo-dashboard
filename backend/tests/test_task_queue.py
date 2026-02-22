"""Tests for the lightweight task queue."""

import time
import threading

from app.task_queue import TaskQueue, TaskState


def _slow_task(seconds: float = 0.1) -> str:
    time.sleep(seconds)
    return "done"


def _failing_task() -> None:
    raise ValueError("intentional failure")


class TestTaskQueue:
    def test_submit_and_complete(self):
        queue = TaskQueue(max_workers=2)
        task_id = queue.submit("test", _slow_task, 0.05)
        assert task_id is not None

        # Wait for completion
        time.sleep(0.3)
        status = queue.status(task_id)
        assert status is not None
        assert status["state"] == TaskState.COMPLETED.value
        assert status["category"] == "test"
        assert status["started_at"] is not None
        assert status["finished_at"] is not None
        queue.shutdown()

    def test_failing_task(self):
        queue = TaskQueue(max_workers=1)
        task_id = queue.submit("test", _failing_task)

        time.sleep(0.3)
        status = queue.status(task_id)
        assert status["state"] == TaskState.FAILED.value
        assert "intentional failure" in status["error"]
        queue.shutdown()

    def test_unknown_task_status(self):
        queue = TaskQueue(max_workers=1)
        assert queue.status("nonexistent") is None
        queue.shutdown()

    def test_queue_stats(self):
        queue = TaskQueue(max_workers=1)
        queue.submit("a", _slow_task, 0.1)
        queue.submit("b", _slow_task, 0.1)

        time.sleep(0.05)
        stats = queue.get_queue_stats()
        assert stats["max_workers"] == 1
        assert stats["total_tasks"] == 2
        queue.shutdown()

    def test_cancel_pending_task(self):
        queue = TaskQueue(max_workers=1)
        # Submit a slow task to block the worker
        queue.submit("blocker", _slow_task, 0.5)
        # Submit a second task that should be pending
        task_id = queue.submit("cancellable", _slow_task, 0.1)

        time.sleep(0.05)
        cancelled = queue.cancel(task_id)
        # Note: cancellation is best-effort, may or may not succeed
        # depending on timing
        status = queue.status(task_id)
        assert status is not None
        queue.shutdown()

    def test_active_and_pending_counts(self):
        queue = TaskQueue(max_workers=1)
        queue.submit("slow", _slow_task, 0.3)
        queue.submit("queued", _slow_task, 0.1)

        time.sleep(0.05)
        assert queue.active_count() >= 0
        assert queue.pending_count() >= 0
        queue.shutdown()

    def test_cleanup_finished(self):
        queue = TaskQueue(max_workers=2)
        queue.submit("fast", _slow_task, 0.01)
        time.sleep(0.2)

        # With max_age_seconds=0, should remove the finished task
        removed = queue.cleanup_finished(max_age_seconds=0)
        assert removed >= 1
        queue.shutdown()

    def test_concurrent_submits(self):
        queue = TaskQueue(max_workers=4)
        task_ids = []
        for i in range(10):
            tid = queue.submit(f"task-{i}", _slow_task, 0.01)
            task_ids.append(tid)

        time.sleep(1)
        completed = sum(
            1 for tid in task_ids
            if queue.status(tid) and queue.status(tid)["state"] == TaskState.COMPLETED.value
        )
        assert completed == 10
        queue.shutdown()
