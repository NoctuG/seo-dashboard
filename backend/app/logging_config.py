import contextvars
import json
import logging
import sys
import uuid
from datetime import datetime, timezone

TRACE_ID_CONTEXT: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="-")
REQUEST_PATH_CONTEXT: contextvars.ContextVar[str] = contextvars.ContextVar("request_path", default="-")


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.trace_id = TRACE_ID_CONTEXT.get()
        record.path = REQUEST_PATH_CONTEXT.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "message": record.getMessage(),
            "trace_id": getattr(record, "trace_id", "-"),
            "path": getattr(record, "path", "-"),
        }

        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


def configure_logging(log_level: str, log_format: str) -> None:
    level = getattr(logging, (log_level or "INFO").upper(), logging.INFO)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(RequestContextFilter())

    if (log_format or "json").lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s trace_id=%(trace_id)s path=%(path)s %(message)s"
            )
        )

    logging.basicConfig(level=level, handlers=[handler], force=True)


def generate_trace_id() -> str:
    return uuid.uuid4().hex
