"""
tests/test_health_report.py
===========================
Unit tests for the personalized health report generator, simplified ECG
interpretation, and lifestyle guidance engine.
"""

import datetime
import pytest

from app.ingestion.normalizer import SensorReading
from app.risk.fusion import FusedRisk
from app.risk.report_generator import (
    SEVERITY_ALERT,
    SEVERITY_INCONCLUSIVE,
    SEVERITY_OK,
    SEVERITY_WATCH,
    generate_report,
)


def _make_reading(
    hr: float = 72.0,
    spo2: float = 98.0,
    body_temp: float = 36.6,
    room_temp: float = 24.0,
    humidity: float = 45.0,
    bp_sys: float = 120.0,
    bp_dia: float = 80.0,
    device_id: str = "test_node_01",
) -> SensorReading:
    return SensorReading(
        timestamp=datetime.datetime.now(datetime.timezone.utc),
        device_id=device_id,
        heart_rate=hr,
        spo2=spo2,
        body_temperature=body_temp,
        room_temperature=room_temp,
        humidity=humidity,
        bp_sys=bp_sys,
        bp_dia=bp_dia,
    )


def _make_fused_risk(vital_risk: str = "NORMAL", reasons: list | None = None) -> FusedRisk:
    return FusedRisk(
        heat_risk="NORMAL",
        vital_risk=vital_risk,
        respiratory_risk="NORMAL",
        overall_status=vital_risk,
        reasons=reasons or [],
        recommendation="Continue normal activity.",
    )


# ── T1: Healthy Baseline ──────────────────────────────────────────────────────
def test_healthy_baseline():
    reading = _make_reading(hr=72, spo2=98.5, body_temp=36.6, bp_sys=118, bp_dia=76)
    risk = _make_fused_risk("NORMAL")

    report = generate_report(reading, risk)

    assert report.overall_status == "NORMAL"
    assert report.overall_headline == "All Clear"
    assert report.next_step.category == "ROUTINE_MONITORING"
    assert report.next_step.badge_label == "ROUTINE MONITORING"
    assert report.ecg_interpretation.status == SEVERITY_OK
    assert "Sinus" in report.ecg_interpretation.rhythm
    assert len(report.findings) == 5
    assert len(report.lifestyle_tips) >= 3
    assert "not constitute medical advice" in report.disclaimer.lower()


# ── T2: Stage 2 Hypertension (Never concealed by normal SpO2) ─────────────────
def test_stage2_hypertension_not_concealed():
    # Patient has Stage 2 hypertension (156/98), but normal oxygen (99%) and temp (36.6)
    reading = _make_reading(hr=74, spo2=99.0, body_temp=36.6, bp_sys=156, bp_dia=98)
    risk = _make_fused_risk("HIGH")

    report = generate_report(reading, risk)

    assert report.overall_status == "HIGH"
    assert report.next_step.category == "URGENT_ATTENTION"
    assert "Blood Pressure" in report.overall_summary

    # Verify BP finding specifically
    bp_finding = next(f for f in report.findings if f.parameter == "Blood Pressure")
    assert bp_finding.status == SEVERITY_ALERT
    assert "Stage 2" in bp_finding.headline

    # Verify lifestyle tips include blood pressure recommendations
    bp_tips = [t for t in report.lifestyle_tips if "sodium" in t.lower() or "blood pressure" in t.lower()]
    assert len(bp_tips) > 0


# ── T3: Disconnected ECG Leads ────────────────────────────────────────────────
def test_disconnected_ecg_leads():
    reading = _make_reading(hr=70)
    risk = _make_fused_risk("NORMAL")

    # Client reports leads disconnected
    report = generate_report(reading, risk, ecg_data={"leads_off": True})

    assert report.ecg_interpretation.status == SEVERITY_INCONCLUSIVE
    assert "Detached" in report.ecg_interpretation.headline
    assert "Disconnected" in report.ecg_interpretation.lead_quality
    assert "No rhythm diagnosis can be performed" in report.ecg_interpretation.summary
    assert report.ecg_interpretation.clinical_limitation != ""


# ── T4: Standby / Missing Blood Pressure ──────────────────────────────────────
def test_missing_blood_pressure_standby():
    # Cuff is detached / 0 mmHg
    reading = _make_reading(bp_sys=0.0, bp_dia=0.0)
    risk = _make_fused_risk("NORMAL")

    report = generate_report(reading, risk)

    bp_finding = next(f for f in report.findings if f.parameter == "Blood Pressure")
    assert bp_finding.status == SEVERITY_INCONCLUSIVE
    assert bp_finding.headline == "Not Measured"
    assert "not connected" in bp_finding.detail.lower()


# ── T5: Critically Low SpO2 ───────────────────────────────────────────────────
def test_critically_low_spo2():
    reading = _make_reading(spo2=86.5)
    risk = _make_fused_risk("HIGH")

    report = generate_report(reading, risk)

    assert report.overall_status == "HIGH"
    spo2_finding = next(f for f in report.findings if "SpO2" in f.parameter)
    assert spo2_finding.status == SEVERITY_ALERT
    assert "Critically Low" in spo2_finding.headline
    assert report.next_step.category == "URGENT_ATTENTION"


# ── T6: Marked Tachycardia ────────────────────────────────────────────────────
def test_marked_tachycardia_rhythm():
    reading = _make_reading(hr=132)
    risk = _make_fused_risk("HIGH")

    report = generate_report(reading, risk, ecg_data={"hr": 132})

    hr_finding = next(f for f in report.findings if f.parameter == "Heart Rate")
    assert hr_finding.status == SEVERITY_ALERT
    assert report.ecg_interpretation.status == SEVERITY_ALERT
    assert "Tachycardia" in report.ecg_interpretation.rhythm
    assert report.next_step.category == "URGENT_ATTENTION"


# ── T7: High Fever ────────────────────────────────────────────────────────────
def test_high_fever_alert():
    reading = _make_reading(body_temp=39.6)
    risk = _make_fused_risk("HIGH")

    report = generate_report(reading, risk)

    temp_finding = next(f for f in report.findings if f.parameter == "Body Temperature")
    assert temp_finding.status == SEVERITY_ALERT
    assert temp_finding.headline == "High Fever"
    assert report.overall_status == "HIGH"


# ── T8: Serialization & Dict Completeness ─────────────────────────────────────
def test_report_dict_serialization():
    reading = _make_reading()
    risk = _make_fused_risk()

    report = generate_report(reading, risk)
    d = report.to_dict()

    assert "overall_status" in d
    assert "overall_headline" in d
    assert "overall_summary" in d
    assert "next_step" in d
    assert "category" in d["next_step"]
    assert "action" in d["next_step"]
    assert "red_flags" in d["next_step"]
    assert "ecg_interpretation" in d
    assert "rhythm" in d["ecg_interpretation"]
    assert "clinical_limitation" in d["ecg_interpretation"]
    assert "findings" in d
    assert isinstance(d["findings"], list)
    assert "lifestyle_tips" in d
    assert isinstance(d["lifestyle_tips"], list)
    assert "disclaimer" in d


# ── T9: POST /api/report/latest with Client-Provided Reading ──────────────────
def test_report_latest_post_stage2_hypertension():
    from app.main import create_app

    app = create_app()
    client = app.test_client()

    payload = {
        "reading": {
            "device_id": "patient_01",
            "heart_rate": 76.0,
            "spo2": 98.0,
            "body_temperature": 36.6,
            "bp_sys": 152.0,
            "bp_dia": 96.0,
            "room_temperature": 23.5,
            "humidity": 45.0,
        }
    }

    res = client.post("/api/report/latest", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "ok"
    report = data["report"]
    assert report["overall_status"] == "HIGH"
    assert "Blood Pressure" in report["overall_summary"]
    bp_finding = next(f for f in report["findings"] if f["parameter"] == "Blood Pressure")
    assert bp_finding["status"] == "alert"
    assert "Stage 2" in bp_finding["headline"]


def test_report_latest_post_hypoxia():
    from app.main import create_app

    app = create_app()
    client = app.test_client()

    payload = {
        "reading": {
            "device_id": "patient_01",
            "heart_rate": 82.0,
            "spo2": 88.0,
            "body_temperature": 36.7,
            "bp_sys": 118.0,
            "bp_dia": 78.0,
        }
    }

    res = client.post("/api/report/latest", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "ok"
    report = data["report"]
    assert report["overall_status"] == "HIGH"
    spo2_finding = next(f for f in report["findings"] if f["parameter"] == "Blood Oxygen (SpO2)")
    assert spo2_finding["status"] == "alert"
    assert "Critically Low" in spo2_finding["headline"]

