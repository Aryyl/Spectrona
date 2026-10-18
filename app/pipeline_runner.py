"""
pipeline_runner.py
==================
Shared execution function for sensor payload processing.
Can be invoked by:
  - MQTT client listener (app/main.py)
  - REST API simulation/ingest endpoints (app/api/routes.py)
  - Testing scripts
"""

from __future__ import annotations

import logging
from typing import Optional

from app.alerts.manager import alert_manager
from app.api.websocket import notify_update
from app.ingestion.processor import process_raw
from app.pipeline_state import state_store
from app.processing.baseline import baseline_engine
from app.processing.features import compute_features
from app.processing.windows import sensor_windows
from app.risk.fusion import fuse_risks
from app.risk.heat import assess_heat_risk
from app.risk.respiratory import respiratory_risk_engine
from app.risk.vital import vital_risk_engine
from app.storage.repository import insert_reading, insert_risk_state

_log = logging.getLogger(__name__)


def process_sensor_payload(payload: dict) -> bool:
    """
    Full processing pipeline for one sensor payload dict.

    Stages:
      validate -> normalize -> store raw -> update windows -> update baseline
      -> compute features -> assess risks -> fuse -> recommend
      -> store risk state -> evaluate alerts -> update shared state -> notify SSE clients

    Returns True if successfully processed, False if rejected by validation.
    """
    reading = process_raw(payload)
    if reading is None:
        state_store.increment_rejected()
        return False

    # Store raw reading in SQLite
    insert_reading(reading)

    # Update sliding windows
    sensor_windows.push(reading)

    # Update personal baseline
    baseline_engine.update(
        heart_rate=reading.heart_rate,
        spo2=reading.spo2,
        body_temperature=reading.body_temperature,
    )
    baseline = baseline_engine.current

    # Derived features
    features = compute_features(reading, sensor_windows, baseline)

    # Risk engines
    heat_result = assess_heat_risk(features)
    vital_result = vital_risk_engine.assess(features)
    resp_result = respiratory_risk_engine.assess(features)

    # Fuse
    fused = fuse_risks(heat_result, vital_result, resp_result)

    _log.info(
        "Pipeline processed reading | Device=%s HR=%.0f SpO2=%.1f Temp=%.1f BP=%.0f/%.0f | Overall=%s",
        reading.device_id,
        reading.heart_rate,
        reading.spo2,
        reading.body_temperature,
        reading.bp_sys,
        reading.bp_dia,
        fused.overall_status,
    )

    # Persist risk state
    insert_risk_state(
        reading=reading,
        heat_risk=fused.heat_risk,
        vital_risk=fused.vital_risk,
        respiratory_risk=fused.respiratory_risk,
        overall_status=fused.overall_status,
        recommendation=fused.recommendation,
        reasons=fused.reasons,
    )

    # Evaluate vital alerts
    new_alerts = alert_manager.process(fused=fused, reading=reading, features=features)
    active_alerts = [a.to_dict() for a in alert_manager.active_alerts]
    new_alerts_dict = [a.to_dict() for a in new_alerts]

    # Update thread-safe shared in-memory state
    state_store.update(
        reading=reading,
        fused_risk=fused,
        active_alerts=active_alerts,
        new_alerts=new_alerts_dict,
    )

    # Notify SSE listeners
    notify_update()

    return True
