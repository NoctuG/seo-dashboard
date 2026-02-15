from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from app.auth_service import create_initial_admin
from app.config import settings
from app.api.api import api_router
from app.db import init_db, engine
from app.scheduler_service import scheduler_service

app = FastAPI(title=settings.PROJECT_NAME)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    with Session(engine) as session:
        create_initial_admin(session)
    scheduler_service.start()


app.include_router(api_router, prefix="/api/v1")


@app.get("/")
def read_root():
    return {"message": "SEO Tool API is running"}


@app.on_event("shutdown")
def on_shutdown():
    scheduler_service.shutdown()
