from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.api.api import api_router
from app.db import init_db
from app.api.deps import verify_basic_auth
from app.scheduler_service import scheduler_service

app = FastAPI(title=settings.PROJECT_NAME, dependencies=[Depends(verify_basic_auth)])

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
    scheduler_service.start()

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
def read_root():
    return {"message": "SEO Tool API is running"}


@app.on_event("shutdown")
def on_shutdown():
    scheduler_service.shutdown()
