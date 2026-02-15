from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address


limiter = Limiter(key_func=get_remote_address)


def rate_limit_exceeded_handler(_: Request, exc: RateLimitExceeded) -> JSONResponse:
    retry_after = max(int(getattr(exc, "retry_after", 60) or 60), 1)
    response = JSONResponse(status_code=429, content={"detail": "Too Many Requests"})
    response.headers["Retry-After"] = str(retry_after)
    return response
