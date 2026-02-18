from app import db


def test_build_engine_adds_check_same_thread_for_sqlite(monkeypatch):
    captured = {}

    def fake_create_engine(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(db, "create_engine", fake_create_engine)
    monkeypatch.setattr(db.settings, "DATABASE_URL", "sqlite:///./test.db")

    db._build_engine()

    assert captured["url"] == "sqlite:///./test.db"
    assert captured["kwargs"] == {"echo": True, "connect_args": {"check_same_thread": False}}


def test_build_engine_omits_sqlite_connect_args_for_non_sqlite(monkeypatch):
    captured = {}

    def fake_create_engine(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return object()

    monkeypatch.setattr(db, "create_engine", fake_create_engine)
    monkeypatch.setattr(db.settings, "DATABASE_URL", "postgresql://user:pass@localhost:5432/seo")

    db._build_engine()

    assert captured["url"] == "postgresql://user:pass@localhost:5432/seo"
    assert captured["kwargs"] == {"echo": True}
