import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from sqlmodel import Session

from app.auth_service import create_initial_admin
from app.config import settings
from app.api.api import api_router
from app.db import init_db, engine
from app.logging_config import (
    REQUEST_PATH_CONTEXT,
    TRACE_ID_CONTEXT,
    configure_logging,
    generate_trace_id,
)
from app.scheduler_service import scheduler_service

app = FastAPI(title=settings.PROJECT_NAME)
logger = logging.getLogger(__name__)

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
    configure_logging(settings.LOG_LEVEL, settings.LOG_FORMAT)
    logger.info("Logging initialized")
    init_db()
    with Session(engine) as session:
        create_initial_admin(session)
    scheduler_service.start()


@app.middleware("http")
async def add_trace_id(request: Request, call_next):
    trace_id = request.headers.get("X-Trace-Id") or generate_trace_id()
    trace_token = TRACE_ID_CONTEXT.set(trace_id)
    path_token = REQUEST_PATH_CONTEXT.set(request.url.path)

    try:
        response = await call_next(request)
    finally:
        TRACE_ID_CONTEXT.reset(trace_token)
        REQUEST_PATH_CONTEXT.reset(path_token)

    response.headers["X-Trace-Id"] = trace_id
    return response


app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"message": "SEO Tool API is running"}


@app.on_event("shutdown")
def on_shutdown():
    scheduler_service.shutdown()
