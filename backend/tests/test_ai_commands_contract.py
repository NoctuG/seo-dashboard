from fastapi.testclient import TestClient

from app.api.deps import get_current_user
from app.main import app
from app.models import User


def _fake_user() -> User:
    return User(id=1, email="tester@example.com", password_hash="x", is_active=True, is_superuser=True)


def test_ai_command_unknown_command_returns_400():
    app.dependency_overrides[get_current_user] = _fake_user
    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/commands/execute",
            json={"project_id": 1, "command": "/unknown", "payload": {}, "context": {}},
            headers={"Authorization": "Bearer test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "unsupported_command" in response.json()["detail"]


def test_ai_command_payload_validation_error():
    app.dependency_overrides[get_current_user] = _fake_user
    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/commands/execute",
            json={"project_id": 1, "command": "/rewrite", "payload": {}, "context": {}},
            headers={"Authorization": "Bearer test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 400
    assert "/rewrite requires payload.content" in response.json()["detail"]


def test_ai_command_success_response_structure():
    app.dependency_overrides[get_current_user] = _fake_user
    try:
        client = TestClient(app)
        response = client.post(
            "/api/v1/ai/commands/execute",
            json={
                "project_id": 42,
                "command": "/priorities",
                "payload": {"focus": ["流量", "转化"]},
                "context": {},
            },
            headers={"Authorization": "Bearer test"},
        )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"command", "status", "output", "next_actions"}
    assert body["command"] == "/priorities"
    assert body["status"] == "success"
    assert isinstance(body["output"], dict)
    assert isinstance(body["next_actions"], list)
