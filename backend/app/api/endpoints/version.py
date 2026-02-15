from fastapi import APIRouter
from pydantic import BaseModel

from app.config import settings

router = APIRouter()


class VersionResponse(BaseModel):
    version: str
    source: str
    release_check_enabled: bool


@router.get('/version', response_model=VersionResponse)
def get_version() -> VersionResponse:
    return VersionResponse(
        version=settings.APP_VERSION,
        source=settings.APP_VERSION_SOURCE,
        release_check_enabled=settings.RELEASE_CHECK_ENABLED,
    )
