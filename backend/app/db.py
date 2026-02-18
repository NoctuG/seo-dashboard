from sqlalchemy import event, text
from sqlmodel import Session, create_engine

from app.metrics import record_db_pool_event
from .config import settings


def _build_engine():
    database_url = settings.DATABASE_URL
    is_sqlite = database_url.startswith("sqlite:///") or database_url.startswith("sqlite+")

    if is_sqlite:
        return create_engine(database_url, echo=True, connect_args={"check_same_thread": False})

    return create_engine(database_url, echo=True)


engine = _build_engine()


@event.listens_for(engine, "connect")
def on_db_connect(dbapi_connection, connection_record):  # noqa: ANN001, ARG001
    record_db_pool_event("connect")


@event.listens_for(engine, "checkout")
def on_db_checkout(dbapi_connection, connection_record, connection_proxy):  # noqa: ANN001, ARG001
    record_db_pool_event("checkout")


@event.listens_for(engine, "checkin")
def on_db_checkin(dbapi_connection, connection_record):  # noqa: ANN001, ARG001
    record_db_pool_event("checkin")


@event.listens_for(engine, "invalidate")
def on_db_invalidate(dbapi_connection, connection_record, exception):  # noqa: ANN001, ARG001
    record_db_pool_event("invalidate")


def get_session():
    with Session(engine) as session:
        yield session


def check_database_connection() -> tuple[bool, str | None]:
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
        return True, None
    except Exception as exc:  # noqa: BLE001
        error = str(exc)
        migration_hint = ""
        missing_table_markers = (
            "no such table",
            "relation",
            "does not exist",
            "UndefinedTable",
        )

        if any(marker in error for marker in missing_table_markers):
            migration_hint = " Please run `alembic upgrade head` before starting the API."

        return False, f"{error}{migration_hint}"
