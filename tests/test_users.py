"""
tests/test_users.py
===================
Unit tests for the multi-user profile management system and routes.
Verifies support for Aryyaman & Hirok profiles, setting updates,
active patient switching, and simultaneous dual telemetry querying.
"""

import json
from pathlib import Path
import pytest
from app.users import (
    load_user_store,
    update_user_profile,
    set_active_user,
    get_active_user,
    _derive_initials,
    USERS_FILE,
    DEFAULT_PROFILES,
)
from app.main import create_app


def test_derive_initials():
    assert _derive_initials("Aryyaman") == "AR"
    assert _derive_initials("Aryyaman Roy") == "AR"
    assert _derive_initials("Hirok") == "HI"
    assert _derive_initials("Hirok Jyoti Sharma") == "HS"
    assert _derive_initials("") == "U"


def test_user_store_defaults():
    store = load_user_store()
    assert "users" in store
    assert "user_1" in store["users"]
    assert "user_2" in store["users"]
    assert "Aryyaman" in store["users"]["user_1"]["name"]
    assert "Hirok" in store["users"]["user_2"]["name"]


def test_update_user_profile(tmp_path, monkeypatch):
    test_file = tmp_path / "test_users.json"
    monkeypatch.setattr("app.users.USERS_FILE", test_file)

    # Initial load will create defaults
    store = load_user_store()
    assert "user_1" in store["users"]

    # Update Aryyaman to "Aryyaman Roy"
    updated = update_user_profile("user_1", {
        "name": "Aryyaman Roy",
        "role": "Lead Subject 01",
        "demographics": "24, Adult Male (O+)",
        "notes": "Verified telemetry stream",
    })
    assert updated is not None
    assert updated["name"] == "Aryyaman Roy"
    assert updated["initials"] == "AR"
    assert updated["role"] == "Lead Subject 01"

    # Verify persistent load
    reloaded = load_user_store()
    assert reloaded["users"]["user_1"]["name"] == "Aryyaman Roy"
    assert reloaded["users"]["user_1"]["role"] == "Lead Subject 01"


def test_active_user_switch(tmp_path, monkeypatch):
    test_file = tmp_path / "test_users.json"
    monkeypatch.setattr("app.users.USERS_FILE", test_file)
    monkeypatch.setattr("app.users._in_memory_store", None)

    assert set_active_user("user_2") is True
    active = get_active_user()
    assert active["id"] == "user_2"
    assert "Hirok" in active["name"]

    # Switching to invalid returns False
    assert set_active_user("user_invalid") is False


def test_api_user_routes(tmp_path, monkeypatch):
    test_file = tmp_path / "test_users.json"
    monkeypatch.setattr("app.users.USERS_FILE", test_file)

    app = create_app()
    client = app.test_client()

    # 1. GET /api/users
    res = client.get("/api/users")
    assert res.status_code == 200
    data = res.get_json()
    assert "users" in data
    assert "user_1" in data["users"]
    assert "user_2" in data["users"]

    # 2. POST /api/users (update name in settings)
    res = client.post("/api/users", json={
        "user_id": "user_2",
        "name": "Hirok J.",
        "role": "Specialist Patient",
    })
    assert res.status_code == 200
    res_data = res.get_json()
    assert res_data["status"] == "ok"
    assert res_data["user"]["name"] == "Hirok J."

    # 3. POST /api/users/active
    res = client.post("/api/users/active", json={"user_id": "user_2"})
    assert res.status_code == 200
    assert res.get_json()["active_user_id"] == "user_2"

    # 4. GET /api/users/telemetry (simultaneous dual data)
    res = client.get("/api/users/telemetry")
    assert res.status_code == 200
    telemetry_data = res.get_json()
    assert "users" in telemetry_data
    assert "user_1" in telemetry_data["users"]
    assert "user_2" in telemetry_data["users"]
    assert telemetry_data["users"]["user_1"]["profile"]["device_id"] == "patient_01"
    assert telemetry_data["users"]["user_2"]["profile"]["device_id"] == "patient_02"


def test_pwa_endpoints():
    app = create_app()
    client = app.test_client()

    # 1. /manifest.json
    res_manifest = client.get("/manifest.json")
    assert res_manifest.status_code == 200
    assert "application/manifest+json" in res_manifest.content_type
    manifest_data = res_manifest.get_json()
    assert manifest_data["short_name"] == "Jeev One"
    assert "Jeev One" in manifest_data["name"]
    assert manifest_data["display"] == "standalone"
    assert manifest_data["scope"] in ("/", "/dashboard")
    assert "/dashboard" in manifest_data["start_url"]
    assert len(manifest_data["icons"]) >= 2

    # 2. /sw.js
    res_sw = client.get("/sw.js")
    assert res_sw.status_code == 200
    assert "javascript" in res_sw.content_type
    assert res_sw.headers.get("Service-Worker-Allowed") == "/"
    assert b"CACHE_NAME" in res_sw.data

