from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.endpoints import projects, crawls, pages, issues, ai, keywords, auth

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(projects.router, prefix="/projects", tags=["projects"], dependencies=[Depends(get_current_user)])
api_router.include_router(crawls.router, prefix="/crawls", tags=["crawls"], dependencies=[Depends(get_current_user)])
api_router.include_router(pages.router, prefix="/pages", tags=["pages"], dependencies=[Depends(get_current_user)])
api_router.include_router(issues.router, prefix="/issues", tags=["issues"], dependencies=[Depends(get_current_user)])
api_router.include_router(keywords.router, prefix="/projects", tags=["keywords"], dependencies=[Depends(get_current_user)])

api_router.include_router(ai.router, prefix="/ai", tags=["ai"], dependencies=[Depends(get_current_user)])