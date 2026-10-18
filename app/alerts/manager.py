"""
alerts/manager.py
=================
Multi-tier vital sign alert and notification engine.

Monitors every physiological vital (Heart Rate, SpO2, Body Temperature,
Blood Pressure, and Thermal Heat Strain) in real-time. Emits actionable alerts
with clinical context whenever a vital breaches normal thresholds (higher or lower).

Features:
  1. Granular Per-Vital Detection (Specific alerts for Tachycardia, Bradycardia,
     Hypoxemia, Fever, Hypothermia, Hypertension, and Heat Strain).
  2. Severity Escalation (Instant alert when WARNING escalates to CRITICAL).
  3. Automatic Recovery / Normalization Notices (Emits a RESOLVED alert when a vital stabilizes).
  4. Per-vital Debouncing & Cooldown to prevent alert fatigue.
  5. Active Alerts Registry & Historical Archive.
"""

from __future__ import annotations

import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.config_loader import cfg
from app.ingestion.normalizer import SensorReading
from app.risk.fusion import FusedRisk

_log = logging.getLogger(__name__)


@dataclass
class Alert:
    """A structured health alert event."""
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    severity: str = "WARNING"          # CRITICAL | WARNING | NORMAL
    category: str = "vital"            # vital | respiratory | heat | overall
    vital: str = "overall"             # heart_rate | spo2 | body_temperature | blood_pressure | heat_index | overall
    title: str = "Health Alert"
    message: str = ""
    value: str = ""                    # e.g. "128 bpm"
    normal_range: str = ""             # e.g. "60 – 100 bpm"
    direction: str = "HIGH"            # HIGH | LOW | NORMAL
    reasons: List[str] = field(default_factory=list)
    timestamp: float = field(default_factory=time.time)
    acknowledged: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "severity": self.severity,
            "category": self.category,
            "vital": self.vital,
            "title": self.title,
            "message": self.message,
            "value": self.value,
            "normal_range": self.normal_range,
            "direction": self.direction,
            "reasons": self.reasons,
            "timestamp": self.timestamp,
            "acknowledged": self.acknowledged,
        }


class AlertManager:
    """
    Stateful health notification engine.
    Tracks active alarms per vital, logs history, and prevents alert spamming.
    """

    def __init__(self) -> None:
        self._cooldown: float = getattr(cfg, "alert_cooldown", 60.0)
        self._active_alerts: Dict[str, Alert] = {}
        self._alert_history: List[Alert] = []
        self._last_alert_time_by_key: Dict[str, float] = {}
        self._previous_overall: Optional[str] = None

    def process(
        self,
        fused: FusedRisk,
        reading: Optional[SensorReading] = None,
        features: Optional[Any] = None,
    ) -> List[Alert]:
        """
        Evaluate sensor readings, features, and fused risks.
        Returns a list of newly triggered or recovered alerts.
        """
        now = time.time()
        emitted_alerts: List[Alert] = []

        # ── 1. Evaluate Individual Vitals ─────────────────────────────────────
        if reading is not None:
            vital_evals = self._evaluate_vitals(reading, features)
            for vital_key, eval_result in vital_evals.items():
                if eval_result is not None:
                    # An abnormal condition was detected
                    severity, title, msg, val_str, norm_str, direction, reasons = eval_result
                    active = self._active_alerts.get(vital_key)
                    last_time = self._last_alert_time_by_key.get(vital_key, 0.0)

                    # Determine if we should emit:
                    # - Brand new alert
                    # - Escalation (WARNING -> CRITICAL)
                    # - Cooldown elapsed and still abnormal
                    is_new = active is None
                    is_escalation = active is not None and active.severity == "WARNING" and severity == "CRITICAL"
                    is_cooldown_ready = (now - last_time) >= self._cooldown

                    if is_new or is_escalation or is_cooldown_ready:
                        alert = Alert(
                            severity=severity,
                            category="vital" if vital_key != "heat_index" else "heat",
                            vital=vital_key,
                            title=title,
                            message=msg,
                            value=val_str,
                            normal_range=norm_str,
                            direction=direction,
                            reasons=reasons,
                            timestamp=now,
                        )
                        self._active_alerts[vital_key] = alert
                        self._last_alert_time_by_key[vital_key] = now
                        self._record_alert(alert)
                        emitted_alerts.append(alert)
                    else:
                        # Update current reading in existing active alert without spamming
                        if active:
                            active.value = val_str
                            active.timestamp = now
                else:
                    # Vital is currently NORMAL
                    if vital_key in self._active_alerts:
                        prev = self._active_alerts.pop(vital_key)
                        resolved_alert = Alert(
                            severity="NORMAL",
                            category=prev.category,
                            vital=vital_key,
                            title=f"{self._vital_display_name(vital_key)} Normalized",
                            message=f"{self._vital_display_name(vital_key)} has stabilized back to safe physiological range.",
                            value=self._get_vital_value_str(reading, vital_key),
                            normal_range=prev.normal_range,
                            direction="NORMAL",
                            reasons=["Vital readings have stabilized within standard clinical limits."],
                            timestamp=now,
                        )
                        self._record_alert(resolved_alert)
                        emitted_alerts.append(resolved_alert)

        # ── 2. Evaluate Overall Risk Transitions ──────────────────────────────
        overall = fused.overall_status
        if overall != self._previous_overall:
            if overall in ("WATCH", "HIGH"):
                overall_alert = Alert(
                    severity=overall,
                    category="overall",
                    vital="overall",
                    title="System Risk Status: " + ("High Triage Risk" if overall == "HIGH" else "Elevated Watch State"),
                    message=fused.recommendation or "Health parameters require clinical attention.",
                    value=overall,
                    normal_range="NORMAL",
                    direction="HIGH" if overall == "HIGH" else "WATCH",
                    reasons=fused.reasons,
                    timestamp=now,
                )
                self._record_alert(overall_alert)
                emitted_alerts.append(overall_alert)
            elif overall == "NORMAL" and self._previous_overall in ("WATCH", "HIGH"):
                norm_alert = Alert(
                    severity="NORMAL",
                    category="overall",
                    vital="overall",
                    title="All Vitals Normalized",
                    message="All physiological indicators and environmental strains have stabilized.",
                    value="NORMAL",
                    normal_range="NORMAL",
                    direction="NORMAL",
                    reasons=["All monitoring sub-engines report normal resting status."],
                    timestamp=now,
                )
                self._record_alert(norm_alert)
                emitted_alerts.append(norm_alert)
            self._previous_overall = overall

        return emitted_alerts

    def _evaluate_vitals(
        self,
        r: SensorReading,
        features: Optional[Any],
    ) -> Dict[str, Optional[tuple]]:
        """
        Evaluates each vital against clinical thresholds.
        Returns tuple: (severity, title, message, value_str, normal_range_str, direction, reasons)
        or None if normal.
        """
        results: Dict[str, Optional[tuple]] = {}

        # ── Heart Rate ────────────────────────────────────────────────────────
        hr = r.heart_rate
        if hr is not None and hr > 0:
            if hr >= 120:
                results["heart_rate"] = (
                    "CRITICAL",
                    "Critical Tachycardia",
                    f"Heart rate is dangerously high at {hr:.0f} bpm. Immediate rest or clinical evaluation needed.",
                    f"{hr:.0f} bpm",
                    "60 – 100 bpm",
                    "HIGH",
                    [f"Heart rate ({hr:.0f} bpm) exceeds critical safety limit (120 bpm)"]
                )
            elif hr >= 100:
                results["heart_rate"] = (
                    "WARNING",
                    "Elevated Heart Rate (Tachycardia)",
                    f"Heart rate is elevated at {hr:.0f} bpm (above normal resting limit).",
                    f"{hr:.0f} bpm",
                    "60 – 100 bpm",
                    "HIGH",
                    [f"Heart rate ({hr:.0f} bpm) exceeds normal threshold (100 bpm)"]
                )
            elif hr <= 45:
                results["heart_rate"] = (
                    "CRITICAL",
                    "Critical Bradycardia",
                    f"Heart rate is critically low at {hr:.0f} bpm. Immediate evaluation advised.",
                    f"{hr:.0f} bpm",
                    "60 – 100 bpm",
                    "LOW",
                    [f"Heart rate ({hr:.0f} bpm) is below critical limit (45 bpm)"]
                )
            elif hr <= 55:
                results["heart_rate"] = (
                    "WARNING",
                    "Low Heart Rate (Bradycardia)",
                    f"Heart rate is low at {hr:.0f} bpm (below normal resting limit).",
                    f"{hr:.0f} bpm",
                    "60 – 100 bpm",
                    "LOW",
                    [f"Heart rate ({hr:.0f} bpm) is below normal threshold (55 bpm)"]
                )
            else:
                results["heart_rate"] = None

        # ── Blood Oxygen (SpO2) ───────────────────────────────────────────────
        spo2 = r.spo2
        if spo2 is not None and spo2 > 0:
            if spo2 < 90.0:
                results["spo2"] = (
                    "CRITICAL",
                    "Severe Hypoxemia (Low SpO₂)",
                    f"Blood oxygen is critically low at {spo2:.1f}%. Immediate supplemental oxygen or medical response required.",
                    f"{spo2:.1f}%",
                    "95 – 100%",
                    "LOW",
                    [f"SpO₂ ({spo2:.1f}%) is below severe threshold (90.0%)"]
                )
            elif spo2 < 95.0:
                results["spo2"] = (
                    "WARNING",
                    "Below-Normal Blood Oxygen (Hypoxemia)",
                    f"Blood oxygen is lower than normal at {spo2:.1f}%. Continuous monitoring recommended.",
                    f"{spo2:.1f}%",
                    "95 – 100%",
                    "LOW",
                    [f"SpO₂ ({spo2:.1f}%) is below standard resting threshold (95.0%)"]
                )
            else:
                results["spo2"] = None

        # ── Body Temperature ──────────────────────────────────────────────────
        temp = r.body_temperature
        if temp is not None and temp > 0:
            if temp >= 38.5:
                results["body_temperature"] = (
                    "CRITICAL",
                    "High Fever (Hyperthermia)",
                    f"Body temperature is high at {temp:.1f} °C. Active cooling and antipyretic evaluation needed.",
                    f"{temp:.1f} °C",
                    "36.1 – 37.2 °C",
                    "HIGH",
                    [f"Body temperature ({temp:.1f} °C) exceeds high fever threshold (38.5 °C)"]
                )
            elif temp >= 37.5:
                results["body_temperature"] = (
                    "WARNING",
                    "Low-Grade Fever",
                    f"Body temperature is slightly elevated at {temp:.1f} °C.",
                    f"{temp:.1f} °C",
                    "36.1 – 37.2 °C",
                    "HIGH",
                    [f"Body temperature ({temp:.1f} °C) exceeds resting threshold (37.5 °C)"]
                )
            elif temp <= 35.0:
                results["body_temperature"] = (
                    "CRITICAL",
                    "Severe Hypothermia",
                    f"Body temperature has dropped to {temp:.1f} °C. Immediate thermal rewarming needed.",
                    f"{temp:.1f} °C",
                    "36.1 – 37.2 °C",
                    "LOW",
                    [f"Body temperature ({temp:.1f} °C) is dangerously subnormal (≤ 35.0 °C)"]
                )
            elif temp <= 35.8:
                results["body_temperature"] = (
                    "WARNING",
                    "Subnormal Body Temperature",
                    f"Body temperature is low at {temp:.1f} °C.",
                    f"{temp:.1f} °C",
                    "36.1 – 37.2 °C",
                    "LOW",
                    [f"Body temperature ({temp:.1f} °C) is below standard limit (35.8 °C)"]
                )
            else:
                results["body_temperature"] = None

        # ── Blood Pressure ────────────────────────────────────────────────────
        sys = r.bp_sys
        dia = r.bp_dia
        if sys is not None and dia is not None and sys > 0 and dia > 0:
            if sys >= 140 or dia >= 90:
                results["blood_pressure"] = (
                    "CRITICAL",
                    "Stage 2 Hypertension",
                    f"Blood pressure ({sys:.0f}/{dia:.0f} mmHg) is significantly elevated. Rest and clinical check advised.",
                    f"{sys:.0f}/{dia:.0f} mmHg",
                    "< 120/80 mmHg",
                    "HIGH",
                    [f"Systolic {sys:.0f} ≥ 140 mmHg or Diastolic {dia:.0f} ≥ 90 mmHg"]
                )
            elif sys >= 130 or dia >= 85:
                results["blood_pressure"] = (
                    "WARNING",
                    "Stage 1 Elevated Blood Pressure",
                    f"Blood pressure ({sys:.0f}/{dia:.0f} mmHg) is higher than normal.",
                    f"{sys:.0f}/{dia:.0f} mmHg",
                    "< 120/80 mmHg",
                    "HIGH",
                    [f"Systolic {sys:.0f} ≥ 130 mmHg or Diastolic {dia:.0f} ≥ 85 mmHg"]
                )
            elif sys <= 90 or dia <= 60:
                results["blood_pressure"] = (
                    "WARNING",
                    "Hypotension (Low Blood Pressure)",
                    f"Blood pressure ({sys:.0f}/{dia:.0f} mmHg) is below normal resting pressure.",
                    f"{sys:.0f}/{dia:.0f} mmHg",
                    "90–120 / 60–80 mmHg",
                    "LOW",
                    [f"Systolic {sys:.0f} ≤ 90 mmHg or Diastolic {dia:.0f} ≤ 60 mmHg"]
                )
            else:
                results["blood_pressure"] = None

        # ── Environmental Heat Index ──────────────────────────────────────────
        hi = None
        if features is not None and hasattr(features, "heat_index"):
            hi = features.heat_index
        elif r.room_temperature is not None and r.humidity is not None and r.room_temperature >= 26.0:
            # Simple approximation of heat index if features not passed
            T = r.room_temperature
            RH = r.humidity
            hi = T + 0.5555 * (6.11 * (10 ** (7.5 * T / (237.3 + T))) * (RH / 100.0) - 10)

        if hi is not None and hi >= 26.0:
            if hi >= 41.0:
                results["heat_index"] = (
                    "CRITICAL",
                    "Extreme Heat Index Hazard",
                    f"Environmental heat index is {hi:.1f} °C. High risk of heat exhaustion or heat stroke.",
                    f"{hi:.1f} °C",
                    "< 32.0 °C",
                    "HIGH",
                    [f"Heat index ({hi:.1f} °C) is in Danger zone (≥ 41.0 °C)"]
                )
            elif hi >= 32.0:
                results["heat_index"] = (
                    "WARNING",
                    "Elevated Thermal Heat Strain",
                    f"Heat index is {hi:.1f} °C. Ensure adequate fluid intake and ventilation.",
                    f"{hi:.1f} °C",
                    "< 32.0 °C",
                    "HIGH",
                    [f"Heat index ({hi:.1f} °C) exceeds caution threshold (32.0 °C)"]
                )
            else:
                results["heat_index"] = None

        return results

    def _record_alert(self, alert: Alert) -> None:
        self._alert_history.append(alert)
        if len(self._alert_history) > 100:
            self._alert_history = self._alert_history[-100:]
        _log.info(
            "ALERT [%s] %s (%s): %s | Value=%s",
            alert.severity, alert.vital, alert.title, alert.message, alert.value
        )

    @property
    def active_alerts(self) -> List[Alert]:
        """List of currently active unresolved alerts."""
        return list(self._active_alerts.values())

    @property
    def recent_alerts(self) -> List[Alert]:
        """Last 30 alerts, newest first."""
        return list(reversed(self._alert_history[-30:]))

    def acknowledge_alert(self, alert_id: str) -> bool:
        found = False
        for a in self._alert_history:
            if a.id == alert_id:
                a.acknowledged = True
                found = True
        for a in self._active_alerts.values():
            if a.id == alert_id:
                a.acknowledged = True
                found = True
        return found

    def acknowledge_all(self) -> None:
        for a in self._alert_history:
            a.acknowledged = True
        for a in self._active_alerts.values():
            a.acknowledged = True

    def clear_history(self) -> None:
        self._alert_history.clear()

    @staticmethod
    def _vital_display_name(key: str) -> str:
        names = {
            "heart_rate": "Heart Rate",
            "spo2": "Blood Oxygen (SpO₂)",
            "body_temperature": "Body Temperature",
            "blood_pressure": "Blood Pressure",
            "heat_index": "Heat Index",
            "overall": "Overall Health Status",
        }
        return names.get(key, key.replace("_", " ").title())

    @staticmethod
    def _get_vital_value_str(r: SensorReading, key: str) -> str:
        if key == "heart_rate":
            return f"{r.heart_rate:.0f} bpm" if r.heart_rate else "—"
        if key == "spo2":
            return f"{r.spo2:.1f}%" if r.spo2 else "—"
        if key == "body_temperature":
            return f"{r.body_temperature:.1f} °C" if r.body_temperature else "—"
        if key == "blood_pressure":
            return f"{r.bp_sys:.0f}/{r.bp_dia:.0f} mmHg" if r.bp_sys else "—"
        if key == "heat_index":
            return f"{r.room_temperature:.1f} °C" if r.room_temperature else "—"
        return "Normal"


# Module-level singleton
alert_manager = AlertManager()
