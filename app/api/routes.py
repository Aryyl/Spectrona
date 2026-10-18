"""
api/routes.py
=============
Flask REST API exposing processed pipeline data to the local dashboard.

Endpoints:
  GET /api/health         – service liveness check
  GET /api/status         – pipeline stats
  GET /api/latest         – latest reading + risk state (in-memory, fast)
  GET /api/risk           – risk breakdown
  GET /api/history        – recent sensor readings from DB
  GET /api/alerts         – recent alert history
  GET /api/baseline       – current personal baseline
"""

from __future__ import annotations

import json
import logging

from flask import Blueprint, jsonify, request, Response

from app.alerts.manager import Alert, alert_manager
from app.pipeline_state import state_store
from app.processing.baseline import baseline_engine
from app.storage.repository import get_recent_readings, get_recent_risk_states

_log = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.route("/health", methods=["GET"])
def health() -> Response:
    """Liveness check – always returns 200 if the service is up."""
    return jsonify({"status": "ok", "service": "personal-health-companion"})


@api_bp.route("/status", methods=["GET"])
def status() -> Response:
    """Pipeline statistics."""
    snap = state_store.snapshot()
    return jsonify({
        "status": "ok",
        "last_update": snap.last_update,
        "total_readings": snap.total_readings,
        "total_rejected": snap.total_rejected,
        "has_data": snap.reading is not None,
    })


@api_bp.route("/latest", methods=["GET"])
def latest() -> Response:
    """Latest reading and risk state from in-memory store (fast path)."""
    snap = state_store.snapshot()
    if snap.reading is None:
        return jsonify({"status": "no_data", "message": "No readings received yet"}), 200

    return jsonify({
        "latest": snap.reading.to_dict(),
        "risk": snap.fused_risk.to_dict() if snap.fused_risk else None,
        "last_update": snap.last_update,
    })


@api_bp.route("/risk", methods=["GET"])
def risk() -> Response:
    """Current risk breakdown."""
    snap = state_store.snapshot()
    if snap.fused_risk is None:
        return jsonify({"status": "no_data"}), 200

    return jsonify(snap.fused_risk.to_dict())


@api_bp.route("/history", methods=["GET"])
def history() -> Response:
    """Recent sensor readings from the database (last 60 by default)."""
    try:
        records = get_recent_readings(limit=60)
        data = [
            {
                "id": r.id,
                "timestamp": r.timestamp_iso,
                "device_id": r.device_id,
                "heart_rate": r.heart_rate,
                "spo2": r.spo2,
                "body_temperature": r.body_temperature,
                "room_temperature": r.room_temperature,
                "humidity": r.humidity,
                "bp_sys": r.bp_sys,
                "bp_dia": r.bp_dia,
            }
            for r in records
        ]
        return jsonify({"count": len(data), "readings": data})
    except Exception as exc:
        _log.error("Error fetching history: %s", exc)
        return jsonify({"error": "Database error"}), 500


@api_bp.route("/alerts", methods=["GET"])
def alerts() -> Response:
    """Active and recent alert history."""
    active = [a.to_dict() for a in alert_manager.active_alerts]
    history = [a.to_dict() for a in alert_manager.recent_alerts]
    return jsonify({
        "active": active,
        "history": history,
        "active_count": len(active),
        "total_history": len(history),
        # Backward compatibility for any consumers expecting 'alerts' key
        "alerts": history,
    })


@api_bp.route("/alerts/acknowledge", methods=["POST"])
def acknowledge_alerts() -> Response:
    """Acknowledge a specific alert or all active alerts."""
    data = request.get_json(silent=True) or {}
    alert_id = data.get("id")
    if alert_id:
        alert_manager.acknowledge_alert(alert_id)
    else:
        alert_manager.acknowledge_all()
        alert_manager._active_alerts.clear()
        snap = state_store.snapshot()
        if snap.reading:
            state_store.update(
                reading=snap.reading,
                fused_risk=snap.fused_risk,
                active_alerts=[],
                new_alerts=[],
            )
            from app.api.websocket import notify_update
            notify_update()
    return jsonify({"status": "ok", "active_count": len(alert_manager.active_alerts)})


@api_bp.route("/alerts/clear", methods=["POST"])
def clear_alerts() -> Response:
    """Clear historical alert log."""
    alert_manager.clear_history()
    return jsonify({"status": "ok"})


@api_bp.route("/alerts/test", methods=["POST"])
def test_alert() -> Response:
    """Trigger a simulated test alert through the full pipeline."""
    import time
    from app.pipeline_runner import process_sensor_payload

    data = request.get_json(silent=True) or {}
    severity = str(data.get("severity", "WARNING")).upper()
    vital = str(data.get("vital", "heart_rate"))
    
    presets = {
        "heart_rate": {
            "heart_rate": 134.0,
            "spo2": 98.0,
            "body_temperature": 36.6,
            "room_temperature": 24.5,
            "humidity": 48.0,
            "blood_pressure": {"sys": 122, "dia": 78},
        },
        "spo2": {
            "heart_rate": 82.0,
            "spo2": 88.5,
            "body_temperature": 36.6,
            "room_temperature": 24.5,
            "humidity": 48.0,
            "blood_pressure": {"sys": 118, "dia": 76},
        },
        "body_temperature": {
            "heart_rate": 108.0,
            "spo2": 96.5,
            "body_temperature": 39.2,
            "room_temperature": 26.0,
            "humidity": 55.0,
            "blood_pressure": {"sys": 126, "dia": 82},
        },
        "blood_pressure": {
            "heart_rate": 90.0,
            "spo2": 98.0,
            "body_temperature": 36.6,
            "room_temperature": 24.5,
            "humidity": 48.0,
            "blood_pressure": {"sys": 156, "dia": 98},
        },
        "normal": {
            "heart_rate": 72.0,
            "spo2": 98.5,
            "body_temperature": 36.6,
            "room_temperature": 24.5,
            "humidity": 48.0,
            "blood_pressure": {"sys": 118, "dia": 76},
        },
    }

    if severity == "NORMAL" or vital == "normal":
        cfg_vital = presets["normal"]
        payload = {
            "device_id": "patient_01",
            "timestamp": int(time.time()),
            **cfg_vital,
        }
        process_sensor_payload(payload)
        alert_manager.clear_active()
        return jsonify({
            "status": "ok",
            "message": "Telemetry restored to normal baseline.",
            "active_count": len(alert_manager.active_alerts),
        })

    cfg_vital = presets.get(vital, presets["heart_rate"])
    payload = {
        "device_id": "patient_01",
        "timestamp": int(time.time()),
        **cfg_vital,
    }
    process_sensor_payload(payload)
    return jsonify({
        "status": "ok",
        "active_count": len(alert_manager.active_alerts),
        "alerts": [a.to_dict() for a in alert_manager.active_alerts],
    })


@api_bp.route("/telemetry/simulate", methods=["POST"])
def simulate_telemetry() -> Response:
    """Inject a simulated sensor telemetry reading through the pipeline."""
    import time
    from app.pipeline_runner import process_sensor_payload

    data = request.get_json(silent=True) or {}
    scenario = data.get("scenario", "combined")

    scenarios = {
        "normal": {
            "heart_rate": 72.0,
            "spo2": 98.5,
            "body_temperature": 36.6,
            "room_temperature": 24.0,
            "humidity": 48.0,
            "blood_pressure": {"sys": 116, "dia": 76},
        },
        "tachycardia": {
            "heart_rate": 134.0,
            "spo2": 98.0,
            "body_temperature": 36.7,
            "room_temperature": 24.5,
            "humidity": 49.0,
            "blood_pressure": {"sys": 128, "dia": 82},
        },
        "hypoxemia": {
            "heart_rate": 86.0,
            "spo2": 88.5,
            "body_temperature": 36.6,
            "room_temperature": 24.0,
            "humidity": 50.0,
            "blood_pressure": {"sys": 118, "dia": 76},
        },
        "fever": {
            "heart_rate": 106.0,
            "spo2": 96.5,
            "body_temperature": 39.2,
            "room_temperature": 25.5,
            "humidity": 52.0,
            "blood_pressure": {"sys": 124, "dia": 80},
        },
        "hypertension": {
            "heart_rate": 92.0,
            "spo2": 97.5,
            "body_temperature": 36.7,
            "room_temperature": 24.5,
            "humidity": 48.0,
            "blood_pressure": {"sys": 156, "dia": 98},
        },
        "combined": {
            "heart_rate": 134.0,
            "spo2": 89.0,
            "body_temperature": 38.9,
            "room_temperature": 38.5,
            "humidity": 78.0,
            "blood_pressure": {"sys": 154, "dia": 96},
        },
    }

    base = scenarios.get(scenario, scenarios["combined"]).copy()
    
    # Allow overriding specific parameters via request body
    if "heart_rate" in data:
        base["heart_rate"] = float(data["heart_rate"])
    if "spo2" in data:
        base["spo2"] = float(data["spo2"])
    if "body_temperature" in data:
        base["body_temperature"] = float(data["body_temperature"])
    if "room_temperature" in data:
        base["room_temperature"] = float(data["room_temperature"])
    if "humidity" in data:
        base["humidity"] = float(data["humidity"])
    if "blood_pressure" in data:
        base["blood_pressure"] = data["blood_pressure"]

    payload = {
        "device_id": "patient_01",
        "timestamp": int(time.time()),
        **base,
    }

    ok = process_sensor_payload(payload)
    if not ok:
        return jsonify({"status": "error", "message": "Payload failed validation"}), 400

    return jsonify({
        "status": "ok",
        "scenario": scenario,
        "payload": payload,
        "active_alerts": [a.to_dict() for a in alert_manager.active_alerts],
    })



@api_bp.route("/baseline", methods=["GET"])
def baseline() -> Response:
    """Current personal baseline."""
    bl = baseline_engine.current
    return jsonify({
        "heart_rate": bl.heart_rate,
        "spo2": bl.spo2,
        "body_temperature": bl.body_temperature,
        "sample_count": bl.sample_count,
        "is_established": bl.is_established,
    })
