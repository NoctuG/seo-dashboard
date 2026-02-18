from pathlib import Path


def test_startup_no_longer_calls_runtime_init_db():
    main_source = Path("app/main.py").read_text(encoding="utf-8")
    db_source = Path("app/db.py").read_text(encoding="utf-8")

    assert "init_db(" not in main_source
    assert "metadata.create_all" not in db_source
