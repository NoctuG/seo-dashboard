from sqlalchemy import event, text
from sqlmodel import SQLModel, Session, create_engine

from app.metrics import record_db_pool_event
from .config import settings

connect_args = {"check_same_thread": False}
engine = create_engine(settings.DATABASE_URL, echo=True, connect_args=connect_args)


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


def init_db():
    SQLModel.metadata.create_all(engine)


def check_database_connection() -> tuple[bool, str | None]:
    try:
        with Session(engine) as session:
            session.exec(text("SELECT 1"))
        return True, None
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)
