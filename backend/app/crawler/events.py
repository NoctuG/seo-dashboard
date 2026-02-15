import queue
from threading import Lock
from typing import Any, Dict, List


class CrawlEventBroker:
    def __init__(self) -> None:
        self._lock = Lock()
        self._subscribers: Dict[int, List[queue.Queue]] = {}

    def subscribe(self, crawl_id: int) -> queue.Queue:
        subscriber: queue.Queue = queue.Queue()
        with self._lock:
            self._subscribers.setdefault(crawl_id, []).append(subscriber)
        return subscriber

    def unsubscribe(self, crawl_id: int, subscriber: queue.Queue) -> None:
        with self._lock:
            subscribers = self._subscribers.get(crawl_id)
            if not subscribers:
                return
            if subscriber in subscribers:
                subscribers.remove(subscriber)
            if not subscribers:
                self._subscribers.pop(crawl_id, None)

    def publish(self, crawl_id: int, event: Dict[str, Any]) -> None:
        with self._lock:
            subscribers = list(self._subscribers.get(crawl_id, []))

        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                continue


crawl_event_broker = CrawlEventBroker()
