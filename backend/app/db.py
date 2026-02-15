from sqlmodel import SQLModel, Session, create_engine
from sqlalchemy import text
from .config import settings

connect_args = {"check_same_thread": False}
engine = create_engine(settings.DATABASE_URL, echo=True, connect_args=connect_args)

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
