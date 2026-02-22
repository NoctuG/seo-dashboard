from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.db import check_database_connection
from app.integrations.provider import get_all_status as get_integration_status
from app.scheduler_service import scheduler_service
from app.task_queue import task_queue

router = APIRouter()


@router.get("/health")
def health_check():
    db_connected, db_error = check_database_connection()
    scheduler_status = scheduler_service.get_status()
    queue_stats = task_queue.get_queue_stats()

    return {
        "status": "ok" if db_connected else "degraded",
        "database": {
            "connected": db_connected,
            "error": db_error,
        },
        "scheduler": scheduler_status,
        "task_queue": queue_stats,
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


@router.get("/health/integrations")
def integration_status():
    """Return the status of all registered external integrations."""
    return {"integrations": get_integration_status()}
