from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
import secrets

from app.config import settings

security = HTTPBasic(auto_error=False)


def verify_basic_auth(credentials: HTTPBasicCredentials = Depends(security)) -> None:
    """Enable HTTP basic auth only when username/password are configured in .env."""
    configured_user = settings.API_USERNAME
    configured_password = settings.API_PASSWORD

    if not configured_user and not configured_password:
        return

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )

    is_valid_username = secrets.compare_digest(credentials.username, configured_user)
    is_valid_password = secrets.compare_digest(credentials.password, configured_password)
    if not (is_valid_username and is_valid_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
