from dataclasses import dataclass
from typing import Optional, Protocol

import requests

from app.config import settings


@dataclass
class WebVitalsMetrics:
    lcp_ms: Optional[int] = None
    fcp_ms: Optional[int] = None
    cls: Optional[float] = None
    source: str = "none"


class PerformanceAdapter(Protocol):
    def collect(self, url: str) -> WebVitalsMetrics:
        ...


class LighthouseWebVitalsAdapter:
    def collect(self, url: str) -> WebVitalsMetrics:
        endpoint = settings.LIGHTHOUSE_API_URL
        if not endpoint:
            return WebVitalsMetrics(source="disabled")

        try:
            response = requests.get(endpoint, params={"url": url}, timeout=20)
            response.raise_for_status()
            data = response.json()
            return WebVitalsMetrics(
                lcp_ms=_to_int(data.get("lcp_ms") or data.get("lcp")),
                fcp_ms=_to_int(data.get("fcp_ms") or data.get("fcp")),
                cls=_to_float(data.get("cls")),
                source="lighthouse",
            )
        except Exception:
            return WebVitalsMetrics(source="lighthouse_error")


class WebVitalsApiAdapter:
    def collect(self, url: str) -> WebVitalsMetrics:
        endpoint = settings.WEB_VITALS_API_URL
        if not endpoint:
            return WebVitalsMetrics(source="disabled")

        try:
            response = requests.get(endpoint, params={"url": url}, timeout=20)
            response.raise_for_status()
            data = response.json()
            return WebVitalsMetrics(
                lcp_ms=_to_int(data.get("lcp_ms") or data.get("largest_contentful_paint")),
                fcp_ms=_to_int(data.get("fcp_ms") or data.get("first_contentful_paint")),
                cls=_to_float(data.get("cls") or data.get("cumulative_layout_shift")),
                source="web_vitals_api",
            )
        except Exception:
            return WebVitalsMetrics(source="web_vitals_api_error")


class CompositePerformanceAdapter:
    def __init__(self):
        self.adapters = [LighthouseWebVitalsAdapter(), WebVitalsApiAdapter()]

    def collect(self, url: str) -> WebVitalsMetrics:
        for adapter in self.adapters:
            metrics = adapter.collect(url)
            if metrics.lcp_ms is not None or metrics.fcp_ms is not None or metrics.cls is not None:
                return metrics
        return WebVitalsMetrics(source="unavailable")


def _to_int(value) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _to_float(value) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


performance_adapter = CompositePerformanceAdapter()
