import logging

from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from sqlmodel import Session

from app.auth_service import create_initial_admin
from app.config import settings, validate_settings
from app.api.api import api_router
from app.db import init_db, engine
from app.rate_limit import limiter, rate_limit_exceeded_handler
from app.logging_config import REQUEST_PATH_CONTEXT, TRACE_ID_CONTEXT, generate_trace_id
from app.metrics import finish_timed_request, observe_http_request, timed_request
from app.scheduler_service import scheduler_service
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from slowapi.errors import RateLimitExceeded

app = FastAPI(title=settings.PROJECT_NAME)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    validate_settings()
    init_db()
    with Session(engine) as session:
        create_initial_admin(session)
    scheduler_service.start()


@app.middleware("http")
async def add_trace_id(request: Request, call_next):
    request_started_at = timed_request()
    trace_id = request.headers.get("X-Trace-Id") or generate_trace_id()
    trace_token = TRACE_ID_CONTEXT.set(trace_id)
    path_token = REQUEST_PATH_CONTEXT.set(request.url.path)

    response = None
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    finally:
        elapsed_seconds = finish_timed_request(request_started_at)
        observe_http_request(request.method, request.url.path, status_code, elapsed_seconds)
        TRACE_ID_CONTEXT.reset(trace_token)
        REQUEST_PATH_CONTEXT.reset(path_token)

    response.headers["X-Trace-Id"] = trace_id
    return response


app.include_router(api_router, prefix="/api/v1")


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/")
def read_root():
    return {"message": "SEO Tool API is running"}


@app.on_event("shutdown")
def on_shutdown():
    scheduler_service.shutdown()
