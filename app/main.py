"""
main.py
=======
Application entry point for the Raspberry Pi health-processing service.

Start order:
  1. Configure logging
  2. Initialise SQLite database
  3. Start Flask API server in a background thread
  4. Start MQTT client (blocking, in the main thread)

The MQTT thread feeds the processing pipeline.
The Flask thread serves API / SSE requests.
Both share state through pipeline_state.state_store (thread-safe).

Run with:
    python -m app.main
or:
    python app/main.py
"""

from __future__ import annotations

import logging
import threading

from flask import Flask
from flask_cors import CORS

from app.api.routes import api_bp
from app.api.websocket import notify_update, ws_bp
from app.alerts.manager import alert_manager
from app.config_loader import cfg
from app.ingestion.processor import process_raw
from app.logger import configure_logging
from app.mqtt.client import HealthMQTTClient
from app.pipeline_state import state_store
from app.processing.baseline import baseline_engine
from app.processing.features import compute_features
from app.processing.windows import sensor_windows
from app.risk.fusion import fuse_risks
from app.risk.heat import assess_heat_risk
from app.risk.respiratory import respiratory_risk_engine
from app.risk.vital import vital_risk_engine
from app.storage.database import init_db
from app.storage.repository import insert_reading, insert_risk_state

_log = logging.getLogger(__name__)


from app.pipeline_runner import process_sensor_payload

# ── Pipeline callback (called by MQTT client on every message) ───────────────

def on_sensor_message(payload: dict) -> None:
    """MQTT callback: passes payload to central pipeline runner."""
    process_sensor_payload(payload)



# ── Flask app factory ────────────────────────────────────────────────────────

def create_app() -> Flask:
    app = Flask(__name__, template_folder="../dashboard/templates", static_folder="../dashboard/static")
    app.config["TEMPLATES_AUTO_RELOAD"] = True
    CORS(app)
    app.register_blueprint(api_bp)
    app.register_blueprint(ws_bp)

    # Serve landing page
    @app.route("/")
    def home():
        from flask import render_template
        return render_template("landing.html")

    # Serve live dashboard
    @app.route("/dashboard")
    def dashboard():
        from flask import render_template
        return render_template("index.html")

    return app


# ── Main entry point ─────────────────────────────────────────────────────────

def main() -> None:
    configure_logging(level=cfg.log_level, fmt=cfg.log_format)
    _log.info("=== Personal Health Companion starting ===")

    # Initialise database
    init_db()

    # Start Flask in a daemon thread
    flask_app = create_app()

    def run_flask():
        _log.info("API server starting at http://%s:%d", cfg.api_host, cfg.api_port)
        flask_app.run(
            host=cfg.api_host,
            port=cfg.api_port,
            debug=False,
            use_reloader=False,  # must be False when running in a thread
            threaded=True,
        )

    api_thread = threading.Thread(target=run_flask, name="flask-api", daemon=True)
    api_thread.start()

    # Start MQTT client (blocks until Ctrl+C)
    mqtt_client = HealthMQTTClient(on_message_callback=on_sensor_message)
    mqtt_client.start()

    _log.info("=== Personal Health Companion stopped ===")


if __name__ == "__main__":
    main()
