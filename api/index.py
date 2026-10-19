"""
api/index.py
============
Vercel Serverless Function entry point.
Exposes WSGI `app` object for Vercel Python runtime.
"""
from __future__ import annotations

import sys
from pathlib import Path

# Add project root directory to sys.path so 'app' package is discoverable
_ROOT_DIR = Path(__file__).resolve().parent.parent
if str(_ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(_ROOT_DIR))

# Import pre-configured Flask app instance
from app.main import app
