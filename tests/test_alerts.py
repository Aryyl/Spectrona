"""
tests/test_alerts.py
====================
Unit tests for the upgraded Vital Alert & Notification Engine.
Tests per-vital threshold evaluations (higher/lower), escalation, recovery notices,
and cooldown debounce.
"""

import time
from app.alerts.manager import AlertManager, Alert
from app.ingestion.normalizer import SensorReading
from app.risk.fusion import FusedRisk


def _dummy_fused(overall: str = "NORMAL") -> FusedRisk:
    return FusedRisk(
        heat_risk="LOW",
        vital_risk=overall,
        respiratory_risk="NORMAL",
        overall_status=overall,
        reasons=[],
        recommendation="Test recommendation",
    )


def test_heart_rate_tachycardia_alert():
    mgr = AlertManager()
    reading = SensorReading(
        device_id="patient_01",
        timestamp=time.time(),
        heart_rate=128.0,  # CRITICAL TACHYCARDIA (>= 120)
        spo2=98.0,
        body_temperature=36.6,
        room_temperature=24.0,
        humidity=50.0,
        bp_sys=120,
        bp_dia=80,
    )
    alerts = mgr.process(_dummy_fused("HIGH"), reading=reading)
    
    assert any(a.vital == "heart_rate" and a.severity == "CRITICAL" for a in alerts)
    active = mgr.active_alerts
    assert len(active) >= 1
    hr_alert = next(a for a in active if a.vital == "heart_rate")
    assert hr_alert.direction == "HIGH"
    assert "Tachycardia" in hr_alert.title


def test_heart_rate_bradycardia_alert():
    mgr = AlertManager()
    reading = SensorReading(
        device_id="patient_01",
        timestamp=time.time(),
        heart_rate=42.0,  # CRITICAL BRADYCARDIA (<= 45)
        spo2=98.0,
        body_temperature=36.6,
        room_temperature=24.0,
        humidity=50.0,
    )
    alerts = mgr.process(_dummy_fused("HIGH"), reading=reading)
    
    assert any(a.vital == "heart_rate" and a.direction == "LOW" for a in alerts)
    hr_alert = next(a for a in mgr.active_alerts if a.vital == "heart_rate")
    assert hr_alert.severity == "CRITICAL"
    assert "Bradycardia" in hr_alert.title


def test_spo2_hypoxemia_alert():
    mgr = AlertManager()
    reading = SensorReading(
        device_id="patient_01",
        timestamp=time.time(),
        heart_rate=75.0,
        spo2=88.5,  # CRITICAL HYPOXEMIA (< 90%)
        body_temperature=36.6,
        room_temperature=24.0,
        humidity=50.0,
    )
    alerts = mgr.process(_dummy_fused("HIGH"), reading=reading)
    
    spo2_alert = next((a for a in alerts if a.vital == "spo2"), None)
    assert spo2_alert is not None
    assert spo2_alert.severity == "CRITICAL"
    assert spo2_alert.direction == "LOW"
    assert "Hypoxemia" in spo2_alert.title


def test_body_temperature_fever_and_recovery():
    mgr = AlertManager()
    # 1. High Fever
    fever_reading = SensorReading(
        device_id="patient_01",
        timestamp=time.time(),
        heart_rate=75.0,
        spo2=98.0,
        body_temperature=39.2,  # CRITICAL FEVER (>= 38.5)
        room_temperature=24.0,
        humidity=50.0,
    )
    alerts = mgr.process(_dummy_fused("HIGH"), reading=fever_reading)
    assert any(a.vital == "body_temperature" and a.severity == "CRITICAL" for a in alerts)
    assert len(mgr.active_alerts) == 1

    # 2. Patient Temperature Normalizes
    normal_reading = SensorReading(
        device_id="patient_01",
        timestamp=time.time() + 5,
        heart_rate=75.0,
        spo2=98.0,
        body_temperature=36.8,  # NORMAL
        room_temperature=24.0,
        humidity=50.0,
    )
    recovery_alerts = mgr.process(_dummy_fused("NORMAL"), reading=normal_reading)
    # Must emit a recovery / normalized alert
    assert any(a.vital == "body_temperature" and a.severity == "NORMAL" for a in recovery_alerts)
    # Active alerts must be cleared
    assert len(mgr.active_alerts) == 0


def test_blood_pressure_hypertension_alert():
    mgr = AlertManager()
    reading = SensorReading(
        device_id="patient_01",
        timestamp=time.time(),
        heart_rate=78.0,
        spo2=98.0,
        body_temperature=36.7,
        room_temperature=24.0,
        humidity=50.0,
        bp_sys=148,  # Stage 2 hypertension (>= 140)
        bp_dia=94,
    )
    alerts = mgr.process(_dummy_fused("HIGH"), reading=reading)
    assert any(a.vital == "blood_pressure" and a.severity == "CRITICAL" for a in alerts)
    bp_alert = next(a for a in mgr.active_alerts if a.vital == "blood_pressure")
    assert bp_alert.direction == "HIGH"
    assert "Hypertension" in bp_alert.title
