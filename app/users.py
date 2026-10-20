"""
users.py
========
Manages multi-user profile identities and account configuration.
Stores persistent profile settings in data/users.json on the edge node.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
import threading
from typing import Dict, Any, Optional

_log = logging.getLogger(__name__)

_lock = threading.RLock()
_in_memory_store: Optional[Dict[str, Any]] = None

def _get_users_file() -> Path:
    primary = Path(__file__).resolve().parent.parent / "data" / "users.json"
    try:
        primary.parent.mkdir(parents=True, exist_ok=True)
        # Test write permission
        test_file = primary.parent / ".perm_check"
        test_file.touch()
        test_file.unlink(missing_ok=True)
        return primary
    except (OSError, PermissionError):
        import tempfile
        fallback_dir = Path(tempfile.gettempdir()) / "jeev_one_data"
        fallback_dir.mkdir(parents=True, exist_ok=True)
        return fallback_dir / "users.json"

USERS_FILE = _get_users_file()

DEFAULT_PROFILES: Dict[str, Dict[str, Any]] = {
    "user_1": {
        "id": "user_1",
        "device_id": "patient_01",
        "name": "Aryyaman",
        "role": "Subject 01",
        "demographics": "24, Adult Male",
        "initials": "AR",
        "bgClass": "avatar-blue",
        "notes": "Primary Node • Baseline Telemetry",
        "welcomeSubtitle": "Viewing real-time biometric telemetry and edge risk evaluation for Aryyaman.",
        "baseline": {
            "heart_rate": 74.0,
            "spo2": 98.2,
            "body_temperature": 36.6,
            "bp_sys": 118,
            "bp_dia": 76,
        }
    },
    "user_2": {
        "id": "user_2",
        "device_id": "patient_02",
        "name": "Hirok",
        "role": "Subject 02",
        "demographics": "25, Adult Male",
        "initials": "HK",
        "bgClass": "avatar-emerald",
        "notes": "Secondary Node • Dynamic Observation",
        "welcomeSubtitle": "Viewing real-time biometric telemetry and edge risk evaluation for Hirok.",
        "baseline": {
            "heart_rate": 80.0,
            "spo2": 97.8,
            "body_temperature": 36.7,
            "bp_sys": 122,
            "bp_dia": 80,
        }
    }
}


def _derive_initials(name: str) -> str:
    """Derive clean 2-letter uppercase initials from a name."""
    parts = [p.strip() for p in name.strip().split() if p.strip()]
    if not parts:
        return "U"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def load_user_store() -> Dict[str, Any]:
    """Load user store from disk or initialize with default Aryyaman & Hirok profiles."""
    global _in_memory_store
    with _lock:
        target = _get_users_file()
        if _in_memory_store is not None:
            return _in_memory_store

        if not target.exists():
            data = {
                "active_user_id": "user_1",
                "users": DEFAULT_PROFILES
            }
            save_user_store(data)
            _in_memory_store = data
            return data

        try:
            with open(target, "r", encoding="utf-8") as f:
                content = json.load(f)
                # Ensure user_1 and user_2 exist
                users = content.get("users", {})
                for k, default_val in DEFAULT_PROFILES.items():
                    if k not in users:
                        users[k] = default_val
                content["users"] = users
                if "active_user_id" not in content or content["active_user_id"] not in users:
                    content["active_user_id"] = "user_1"
                _in_memory_store = content
                return content
        except Exception as e:
            _log.warning("Failed to parse %s (%s). Reverting to defaults.", target, e)
            fallback = {"active_user_id": "user_1", "users": DEFAULT_PROFILES}
            _in_memory_store = fallback
            return fallback


def save_user_store(data: Dict[str, Any]) -> None:
    """Save user store to disk atomically and keep memory store synced."""
    global _in_memory_store
    with _lock:
        _in_memory_store = data
        target = _get_users_file()
        try:
            target.parent.mkdir(parents=True, exist_ok=True)
            tmp_file = target.with_suffix(".tmp")
            with open(tmp_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            tmp_file.replace(target)
        except Exception as e:
            _log.error("Failed to save user store to %s: %s", target, e)


def update_user_profile(user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update user profile fields and persist to disk."""
    store = load_user_store()
    users = store.get("users", {})
    if user_id not in users:
        return None

    current = users[user_id]
    if "name" in updates and updates["name"].strip():
        current["name"] = updates["name"].strip()
        current["initials"] = _derive_initials(current["name"])
        first_name = current["name"].split()[0]
        current["welcomeSubtitle"] = f"Viewing real-time biometric telemetry and edge risk evaluation for {first_name}."

    if "role" in updates:
        current["role"] = updates["role"].strip()
    if "demographics" in updates:
        current["demographics"] = updates["demographics"].strip()
    if "notes" in updates:
        current["notes"] = updates["notes"].strip()

    users[user_id] = current
    store["users"] = users
    save_user_store(store)
    return current


def set_active_user(user_id: str) -> bool:
    """Set the currently active user profile."""
    store = load_user_store()
    if user_id not in store.get("users", {}):
        return False
    store["active_user_id"] = user_id
    save_user_store(store)
    return True


def get_active_user() -> Dict[str, Any]:
    """Get the currently active user profile."""
    store = load_user_store()
    active_id = store.get("active_user_id", "user_1")
    return store.get("users", {}).get(active_id, DEFAULT_PROFILES["user_1"])
