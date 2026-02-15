from fastapi import APIRouter
from app.api.endpoints import projects, crawls, pages, issues, ai, keywords

api_router = APIRouter()
api_router.include_router(projects.router, prefix="/projects", tags=["projects"])
api_router.include_router(crawls.router, prefix="/crawls", tags=["crawls"])
api_router.include_router(pages.router, prefix="/pages", tags=["pages"])
api_router.include_router(issues.router, prefix="/issues", tags=["issues"])
api_router.include_router(keywords.router, prefix="/projects", tags=["keywords"])

api_router.include_router(ai.router, prefix="/ai", tags=["ai"])
