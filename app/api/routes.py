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
    """Trigger a simulated test alert to verify notification & sound subsystems."""
    data = request.get_json(silent=True) or {}
    severity = data.get("severity", "WARNING").upper()
    vital = data.get("vital", "heart_rate")
    
    test_presets = {
        "heart_rate": ("Critical Tachycardia", "Heart rate critically high at 134 bpm.", "134 bpm", "60 – 100 bpm", "HIGH"),
        "spo2": ("Severe Hypoxemia", "Blood oxygen level dropped to 88.5%.", "88.5%", "95 – 100%", "LOW"),
        "body_temperature": ("High Fever Detected", "Body temperature elevated at 39.1 °C.", "39.1 °C", "36.1 – 37.2 °C", "HIGH"),
        "blood_pressure": ("Stage 2 Hypertension", "Blood pressure spike measured at 152/98 mmHg.", "152/98 mmHg", "< 120/80 mmHg", "HIGH"),
    }
    title, msg, val, norm, direction = test_presets.get(
        vital, 
        ("Simulated Test Alert", "Alert notification subsystem test active.", "120 bpm", "60 – 100 bpm", "HIGH")
    )
    
    test_alert_obj = Alert(
        severity=severity,
        category="vital",
        vital=vital,
        title=f"[TEST] {title}",
        message=msg,
        value=val,
        normal_range=norm,
        direction=direction,
        reasons=["User initiated simulated alarm test from Settings."],
    )
    if severity in ("CRITICAL", "HIGH", "WARNING", "WATCH"):
        alert_manager._active_alerts[vital] = test_alert_obj
    else:
        alert_manager._active_alerts.pop(vital, None)
    alert_manager._record_alert(test_alert_obj)
    
    # Also push to state_store so SSE clients get notified immediately
    import time
    from app.ingestion.normalizer import SensorReading
    from app.risk.fusion import FusedRisk
    from app.api.websocket import notify_update

    snap = state_store.snapshot()
    reading = snap.reading
    if reading is None:
        reading = SensorReading(
            device_id="patient_01",
            timestamp=time.time(),
            heart_rate=134.0 if vital == "heart_rate" else 75.0,
            spo2=88.5 if vital == "spo2" else 98.0,
            body_temperature=39.1 if vital == "body_temperature" else 36.6,
            room_temperature=24.0,
            humidity=50.0,
            bp_sys=152 if vital == "blood_pressure" else 120,
            bp_dia=98 if vital == "blood_pressure" else 80,
        )
    
    state_store.update(
        reading=reading,
        fused_risk=snap.fused_risk or FusedRisk("LOW", "HIGH" if severity in ("CRITICAL", "HIGH") else "WATCH", "NORMAL", "HIGH" if severity in ("CRITICAL", "HIGH") else "WATCH", ["Test alert"], "Test alarm active"),
        active_alerts=[a.to_dict() for a in alert_manager.active_alerts],
        new_alerts=[test_alert_obj.to_dict()],
    )
    notify_update()

    return jsonify({"status": "ok", "alert": test_alert_obj.to_dict(), "active_count": len(alert_manager.active_alerts)})


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
