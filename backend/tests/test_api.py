"""Smoke tests that need no database.

TestClient is deliberately NOT used as a context manager: that would run the
lifespan, which talks to Mongo. These cover the two things that break
silently — the health probe and SSO header parsing.

    pip install -r requirements-dev.txt && pytest
"""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.main import app, mount_spa
from app.models.models import Item

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_me_reads_x_auth_request_headers():
    response = client.get(
        "/api/me",
        headers={
            "X-Auth-Request-Email": "someone@example.com",
            "X-Auth-Request-Preferred-Username": "someone",
        },
    )
    assert response.status_code == 200
    assert response.json()["email"] == "someone@example.com"
    assert response.json()["preferred_username"] == "someone"


def test_me_falls_back_to_x_forwarded_headers():
    response = client.get(
        "/api/me", headers={"X-Forwarded-Email": "legacy@example.com"}
    )
    assert response.json()["email"] == "legacy@example.com"


def test_me_is_empty_without_sso():
    # Local dev has no gateway in front; the UI must still render.
    assert client.get("/api/me").json() == {
        "email": None,
        "user": None,
        "preferred_username": None,
    }


def test_create_item_rejects_server_owned_fields():
    response = client.post("/api/items", json={"name": "x", "created_at": "2020-01-01"})
    assert response.status_code == 422


def test_item_serialises_id_not_underscore_id():
    # The SPA keys rows on `id`; Mongo hands us `_id`.
    item = Item.model_validate({"_id": "6a6af1c94f721903aa704283", "name": "Widget"})
    payload = item.model_dump(by_alias=True)
    assert payload["id"] == "6a6af1c94f721903aa704283"
    assert "_id" not in payload


def test_spa_deep_link_falls_back_to_index(tmp_path):
    # A hard refresh on /items must return the SPA shell, not a 404.
    (tmp_path / "index.html").write_text("<!doctype html><div id=root></div>")
    spa_app = FastAPI()
    mount_spa(spa_app, tmp_path)

    response = TestClient(spa_app).get("/items")

    assert response.status_code == 200
    assert "id=root" in response.text
