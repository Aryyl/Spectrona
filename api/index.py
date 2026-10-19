"""
api/index.py
============
Vercel Serverless Function entry point.

Vercel looks for a Flask instance named `app` in this file.
Format used in pyproject.toml:  entrypoint = "api.index:app"
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# ── Ensure project root is on sys.path so 'app' package is importable ──────
# Vercel runs from /var/task; this file lives at /var/task/api/index.py
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

# ── Import pre-built Flask WSGI app ─────────────────────────────────────────
# app.main.create_app() resolves all absolute paths and calls init_db()
from app.main import app  # noqa: E402  (import after sys.path manipulation)

__all__ = ["app"]
