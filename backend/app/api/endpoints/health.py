from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db import check_database_connection
from app.scheduler_service import scheduler_service

router = APIRouter()


@router.get("/health")
def health_check():
    db_connected, db_error = check_database_connection()
    scheduler_status = scheduler_service.get_status()

    return {
        "status": "ok" if db_connected else "degraded",
        "database": {
            "connected": db_connected,
            "error": db_error,
        },
        "scheduler": scheduler_status,
    }


@router.get("/health/ready")
def readiness_check():
    db_connected, db_error = check_database_connection()
    scheduler_status = scheduler_service.get_status()
    ready = db_connected and bool(scheduler_status.get("running"))

    payload = {
        "status": "ready" if ready else "not_ready",
        "database": {
            "connected": db_connected,
            "error": db_error,
        },
        "scheduler": scheduler_status,
    }

    if ready:
        return payload

    return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
