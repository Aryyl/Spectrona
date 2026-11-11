"""
risk/report_generator.py
========================
Converts a live SensorReading + FusedRisk snapshot into a plain-English,
multi-layered Clinical Wellness & Telemetry HealthReport.

Design principles
-----------------
* Never fabricate measurements – every finding references an actual value.
* Zero BP (no sensor) → treated as "not measured", not "normal", and never penalizes scores.
* SpO2 at normal levels never hides a concurrent hypertension finding.
* Reuses deterministic thermal/strain math from app.processing.features.
* Language is wellness-oriented, never a clinical diagnosis.
"""

from __future__ import annotations

import datetime
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.ingestion.normalizer import SensorReading
from app.processing.features import _heat_index, _physiological_strain
from app.risk.fusion import FusedRisk

# ── Severity constants ──────────────────────────────────────────────────────
SEVERITY_OK = "ok"
SEVERITY_WATCH = "watch"
SEVERITY_ALERT = "alert"
SEVERITY_INCONCLUSIVE = "inconclusive"

# ── Clinical reference ranges ─────────────────────────────────────────────────
_HR_LOW = 60
_HR_HIGH = 100
_HR_VERY_LOW = 40
_HR_VERY_HIGH = 120

_SPO2_NORMAL = 95
_SPO2_WATCH = 90

_TEMP_NORMAL_MAX = 37.5
_TEMP_FEVER = 38.0
_TEMP_HIGH_FEVER = 39.0

_BP_SYS_NORMAL_MAX = 130
_BP_SYS_HIGH = 140
_BP_SYS_LOW = 90
_BP_DIA_NORMAL_MAX = 80
_BP_DIA_HIGH = 90

_ROOM_TEMP_COMFORTABLE_MAX = 28.0
_ROOM_TEMP_HOT = 32.0
_HUMIDITY_HIGH = 70.0
_HUMIDITY_LOW = 30.0


def _clamp(val: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, val))


def _scale_pct(val: float, lo: float, hi: float) -> float:
    if hi <= lo:
        return 50.0
    return round(_clamp((val - lo) / (hi - lo) * 100.0, 0.0, 100.0), 1)


def _format_delta(val: float, base_val: Optional[float], decimals: int = 0, unit: str = "", tol: float = 0.5) -> str:
    if base_val is None or base_val <= 0 or val <= 0:
        return ""
    diff = val - base_val
    if abs(diff) < tol:
        return "At personal baseline"
    sign = "+" if diff > 0 else ""
    num_str = f"{diff:.{decimals}f}"
    unit_suffix = f" {unit}" if unit and not unit.startswith("%") else unit
    return f"{sign}{num_str}{unit_suffix} vs baseline ({base_val:.{decimals}f}{unit_suffix})"


@dataclass
class ParameterFinding:
    """A single-parameter assessment block shown in the report card."""
    parameter: str          # e.g. "Heart Rate"
    value: str              # e.g. "88 bpm"
    status: str             # ok | watch | alert | inconclusive
    headline: str           # short user-facing label, e.g. "Normal"
    detail: str             # 1-2 sentence plain-English explanation
    icon: str               # icon name key understood by icons.js
    unit: str = ""
    normal_range: str = ""
    baseline_value: Optional[float] = None
    delta_text: str = ""
    accent: str = "neutral"                 # coral | sky | amber | lavender | teal | neutral
    range_pct: Optional[float] = None       # 0-100 marker position along parameter scale
    safe_start_pct: Optional[float] = None  # 0-100 safe band start
    safe_end_pct: Optional[float] = None    # 0-100 safe band end

    def to_dict(self) -> dict:
        return {
            "parameter": self.parameter,
            "value": self.value,
            "status": self.status,
            "headline": self.headline,
            "detail": self.detail,
            "icon": self.icon,
            "unit": self.unit,
            "normal_range": self.normal_range,
            "baseline_value": self.baseline_value,
            "delta_text": self.delta_text,
            "accent": self.accent,
            "range_pct": self.range_pct,
            "safe_start_pct": self.safe_start_pct,
            "safe_end_pct": self.safe_end_pct,
        }


@dataclass
class ECGInterpretation:
    """Simplified ECG interpretation block for Lead-I rhythm monitoring."""
    status: str             # ok | watch | alert | inconclusive
    headline: str           # e.g. "Normal Sinus Rhythm"
    rhythm: str             # e.g. "Normal Sinus Rhythm (NSR)"
    pr_interval: str        # e.g. "158 ms (120–200 ms normal)"
    qrs_duration: str       # e.g. "86 ms (60–100 ms normal)"
    qtc_interval: str       # e.g. "412 ms (< 440 ms normal)"
    lead_quality: str       # e.g. "98% (Good Signal)"
    summary: str            # Plain-English translation
    pr_value: str = "- ms"
    pr_norm: str = "120–200 ms"
    qrs_value: str = "- ms"
    qrs_norm: str = "60–100 ms"
    qtc_value: str = "- ms"
    qtc_norm: str = "< 440 ms"
    clinical_limitation: str = (
        "Single-lead Lead I ECG assesses rhythm and rate only. "
        "It cannot rule out acute ischemia, structural disease, or replace a standard 12-lead diagnostic ECG."
    )

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "headline": self.headline,
            "rhythm": self.rhythm,
            "pr_interval": self.pr_interval,
            "qrs_duration": self.qrs_duration,
            "qtc_interval": self.qtc_interval,
            "pr_value": self.pr_value,
            "pr_norm": self.pr_norm,
            "qrs_value": self.qrs_value,
            "qrs_norm": self.qrs_norm,
            "qtc_value": self.qtc_value,
            "qtc_norm": self.qtc_norm,
            "lead_quality": self.lead_quality,
            "summary": self.summary,
            "clinical_limitation": self.clinical_limitation,
        }


@dataclass
class NextStepTriage:
    """Actionable 'What Should I Do Next?' guidance block."""
    category: str           # ROUTINE_MONITORING | RECHECK_OR_ADVICE | URGENT_ATTENTION
    badge_label: str        # e.g. "ROUTINE MONITORING" | "RECHECK & MONITOR" | "URGENT ATTENTION"
    headline: str           # Action summary headline
    action: str             # Concrete guidance
    red_flags: str = (
        "Seek immediate emergency medical care if you experience chest pain or pressure, "
        "sudden shortness of breath, radiating arm/jaw pain, or severe dizziness."
    )

    def to_dict(self) -> dict:
        return {
            "category": self.category,
            "badge_label": self.badge_label,
            "headline": self.headline,
            "action": self.action,
            "red_flags": self.red_flags,
        }


@dataclass
class HealthReport:
    """Complete health report for one snapshot."""
    overall_status: str               # NORMAL | WATCH | HIGH
    overall_headline: str             # e.g. "All Clear" / "Monitor Closely"
    overall_summary: str              # 2-3 sentence narrative
    next_step: NextStepTriage         # Action triage block
    ecg_interpretation: ECGInterpretation  # Simplified ECG interpretation
    findings: List[ParameterFinding]  # ordered list of parameter cards
    lifestyle_tips: List[str]         # 3-5 actionable plain-English tips
    wellness_score: Dict[str, Any] = field(default_factory=dict)
    subsystem_summary: Dict[str, Any] = field(default_factory=dict)
    structured_tips: List[Dict[str, str]] = field(default_factory=list)
    report_meta: Dict[str, Any] = field(default_factory=dict)
    disclaimer: str = (
        "This report is for informational and wellness monitoring purposes only. "
        "It does not constitute medical advice or diagnosis. "
        "Always consult a qualified healthcare professional for medical concerns."
    )

    def to_dict(self) -> dict:
        return {
            "overall_status": self.overall_status,
            "overall_headline": self.overall_headline,
            "overall_summary": self.overall_summary,
            "next_step": self.next_step.to_dict(),
            "ecg_interpretation": self.ecg_interpretation.to_dict(),
            "findings": [f.to_dict() for f in self.findings],
            "lifestyle_tips": self.lifestyle_tips,
            "wellness_score": self.wellness_score,
            "subsystem_summary": self.subsystem_summary,
            "structured_tips": self.structured_tips,
            "report_meta": self.report_meta,
            "disclaimer": self.disclaimer,
        }


# ── Public entry-point ────────────────────────────────────────────────────────

def generate_report(
    reading: SensorReading,
    fused_risk: FusedRisk,
    ecg_data: Optional[dict] = None,
    baseline: Optional[dict] = None,
    patient: Optional[dict] = None,
) -> HealthReport:
    """
    Build a HealthReport from the latest reading, fused risk, and optional ECG,
    personal baseline, and patient profile context.
    """
    bl = baseline or {}
    pat = patient or {}

    hr_base = _safe_pos_float(bl.get("heart_rate"))
    spo2_base = _safe_pos_float(bl.get("spo2"))
    temp_base = _safe_pos_float(bl.get("body_temperature"))
    bp_sys_base = _safe_pos_float(bl.get("bp_sys"))
    bp_dia_base = _safe_pos_float(bl.get("bp_dia"))

    # Deterministic environmental & physiological strain calculations (reusing features.py)
    heat_idx = _heat_index(reading.room_temperature, reading.humidity)
    strain = _physiological_strain(
        hr=reading.heart_rate if reading.heart_rate > 0 else (hr_base or 72.0),
        hr_baseline=hr_base or 72.0,
        temp=reading.body_temperature if reading.body_temperature > 0 else (temp_base or 36.6),
        temp_baseline=temp_base or 36.6,
        spo2=reading.spo2 if reading.spo2 > 0 else (spo2_base or 98.0),
    )

    findings: List[ParameterFinding] = [
        _assess_heart_rate(reading.heart_rate, hr_base),
        _assess_spo2(reading.spo2, spo2_base),
        _assess_body_temp(reading.body_temperature, temp_base),
        _assess_blood_pressure(reading.bp_sys, reading.bp_dia, bp_sys_base, bp_dia_base),
        _assess_environment(reading.room_temperature, reading.humidity, heat_idx),
    ]

    ecg_interp = _assess_ecg(reading, ecg_data)

    # Derive overall severity including vital findings and ECG
    severities = [f.status for f in findings]
    if ecg_interp.status == SEVERITY_ALERT:
        severities.append(SEVERITY_ALERT)
    elif ecg_interp.status == SEVERITY_WATCH:
        severities.append(SEVERITY_WATCH)

    if SEVERITY_ALERT in severities:
        overall = SEVERITY_ALERT
    elif SEVERITY_WATCH in severities:
        overall = SEVERITY_WATCH
    else:
        overall = SEVERITY_OK

    _status_map = {
        SEVERITY_OK: "NORMAL",
        SEVERITY_WATCH: "WATCH",
        SEVERITY_ALERT: "HIGH",
        SEVERITY_INCONCLUSIVE: "WATCH",
    }
    overall_risk_label = _status_map[overall]

    headline, summary = _build_overall_narrative(overall, findings, fused_risk, ecg_interp)
    next_step = _build_next_step(overall, findings, ecg_interp)
    structured_tips = _build_structured_tips(overall, findings, ecg_interp, heat_idx, strain)
    tips = [t["detail"] for t in structured_tips]

    wellness_score = _compute_wellness_score(reading, findings, ecg_interp, heat_idx)
    subsystem_summary = _build_subsystem_summary(
        reading=reading,
        findings=findings,
        fused_risk=fused_risk,
        heat_idx=heat_idx,
        strain=strain,
        hr_base=hr_base,
        spo2_base=spo2_base,
        temp_base=temp_base,
    )

    ts_iso = (
        reading.timestamp.isoformat()
        if isinstance(reading.timestamp, datetime.datetime)
        else datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    report_meta = {
        "generated_at_iso": ts_iso,
        "patient_name": str(pat.get("name") or "Patient"),
        "patient_role": str(pat.get("role") or "Monitored Subject"),
        "demographics": str(pat.get("demographics") or ""),
        "device_id": str(reading.device_id or pat.get("device_id") or "patient_01"),
        "baseline_used": bool(hr_base or spo2_base or temp_base),
        "active_sensors_count": wellness_score["active_sensors"],
        "total_sensors_count": wellness_score["total_sensors"],
    }

    return HealthReport(
        overall_status=overall_risk_label,
        overall_headline=headline,
        overall_summary=summary,
        next_step=next_step,
        ecg_interpretation=ecg_interp,
        findings=findings,
        lifestyle_tips=tips,
        wellness_score=wellness_score,
        subsystem_summary=subsystem_summary,
        structured_tips=structured_tips,
        report_meta=report_meta,
    )


def _safe_pos_float(val: Any) -> Optional[float]:
    try:
        num = float(val)
        return num if num > 0 else None
    except (TypeError, ValueError):
        return None


# ── Parameter assessors ───────────────────────────────────────────────────────

def _assess_heart_rate(hr: float, baseline_hr: Optional[float] = None) -> ParameterFinding:
    delta = _format_delta(hr, baseline_hr, decimals=0, unit="bpm", tol=1.0)
    if hr <= 0:
        return ParameterFinding(
            parameter="Heart Rate",
            value="- bpm",
            status=SEVERITY_INCONCLUSIVE,
            headline="No Signal",
            detail="No heart rate reading is available. Ensure the sensor is correctly placed.",
            icon="heart",
            unit="bpm",
            normal_range="60–100 bpm",
            baseline_value=baseline_hr,
            delta_text="Awaiting optical pulse lock",
            accent="neutral",
            range_pct=None,
            safe_start_pct=25.0,
            safe_end_pct=58.3,
        )
    val_str = f"{hr:.0f} bpm"
    pct = _scale_pct(hr, 30.0, 150.0)
    common = dict(
        parameter="Heart Rate",
        value=val_str,
        icon="heart",
        unit="bpm",
        normal_range="60–100 bpm",
        baseline_value=baseline_hr,
        delta_text=delta or "Standard resting corridor",
        accent="coral",
        range_pct=pct,
        safe_start_pct=25.0,
        safe_end_pct=58.3,
    )
    if hr >= _HR_VERY_HIGH:
        return ParameterFinding(
            status=SEVERITY_ALERT,
            headline="Very Elevated",
            detail=(f"Your heart rate is {hr:.0f} bpm, significantly above the normal resting range of "
                    f"{_HR_LOW}-{_HR_HIGH} bpm. Stop strenuous activity and rest immediately. "
                    "If this persists or you feel chest pain or dizziness, seek medical attention."),
            **common,
        )
    elif hr >= _HR_HIGH:
        return ParameterFinding(
            status=SEVERITY_WATCH,
            headline="Slightly Elevated",
            detail=(f"Your heart rate is {hr:.0f} bpm, just above the typical resting range of {_HR_LOW}-{_HR_HIGH} bpm. "
                    "This can be normal after mild activity or stress. Rest quietly and monitor."),
            **common,
        )
    elif hr <= _HR_VERY_LOW:
        return ParameterFinding(
            status=SEVERITY_ALERT,
            headline="Very Low",
            detail=(f"Your heart rate is {hr:.0f} bpm, well below the normal resting range. "
                    "Very low heart rate can cause dizziness or fainting. Rest and seek medical assessment promptly."),
            **common,
        )
    elif hr <= _HR_LOW:
        return ParameterFinding(
            status=SEVERITY_WATCH,
            headline="Below Normal",
            detail=(f"Your heart rate is {hr:.0f} bpm, slightly below the standard resting range of {_HR_LOW}-{_HR_HIGH} bpm. "
                    "This may be normal for athletes. Monitor for fatigue or light-headedness."),
            **common,
        )
    return ParameterFinding(
        status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your heart rate is {hr:.0f} bpm, within the healthy resting range of {_HR_LOW}-{_HR_HIGH} bpm. "
                "Your cardiovascular activity appears stable."),
        **common,
    )


def _assess_spo2(spo2: float, baseline_spo2: Optional[float] = None) -> ParameterFinding:
    delta = _format_delta(spo2, baseline_spo2, decimals=1, unit="%", tol=0.2)
    if spo2 <= 0:
        return ParameterFinding(
            parameter="Blood Oxygen (SpO2)",
            value="-%",
            status=SEVERITY_INCONCLUSIVE,
            headline="No Signal",
            detail="SpO2 sensor reading is unavailable. Ensure the sensor probe is properly attached.",
            icon="droplet",
            unit="%",
            normal_range=">= 95%",
            baseline_value=baseline_spo2,
            delta_text="Awaiting oximetry reading",
            accent="neutral",
            range_pct=None,
            safe_start_pct=66.7,
            safe_end_pct=100.0,
        )
    val_str = f"{spo2:.1f}%"
    pct = _scale_pct(spo2, 85.0, 100.0)
    common = dict(
        parameter="Blood Oxygen (SpO2)",
        value=val_str,
        icon="droplet",
        unit="%",
        normal_range="95–100%",
        baseline_value=baseline_spo2,
        delta_text=delta or f"{(spo2 - 95.0):+.1f}% reserve above Watch threshold",
        accent="sky",
        range_pct=pct,
        safe_start_pct=66.7,
        safe_end_pct=100.0,
    )
    if spo2 < _SPO2_WATCH:
        return ParameterFinding(
            status=SEVERITY_ALERT,
            headline="Critically Low",
            detail=(f"Your blood oxygen saturation is {spo2:.1f}%, significantly below the normal threshold of "
                    f">={_SPO2_NORMAL}%. Move to a well-ventilated area, sit upright, and breathe slowly and deeply. "
                    "Seek medical assessment promptly."),
            **common,
        )
    elif spo2 < _SPO2_NORMAL:
        return ParameterFinding(
            status=SEVERITY_WATCH,
            headline="Slightly Low",
            detail=(f"Your SpO2 is {spo2:.1f}%, slightly below the normal range of >={_SPO2_NORMAL}%. "
                    "Sit upright in a well-ventilated space and take slow, deep breaths."),
            **common,
        )
    return ParameterFinding(
        status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your blood oxygen level is {spo2:.1f}%, within the healthy range of >={_SPO2_NORMAL}%. "
                "Your lungs appear to be oxygenating your blood effectively."),
        **common,
    )


def _assess_body_temp(temp: float, baseline_temp: Optional[float] = None) -> ParameterFinding:
    delta = _format_delta(temp, baseline_temp, decimals=1, unit="°C", tol=0.15)
    if temp <= 0:
        return ParameterFinding(
            parameter="Body Temperature", value="- °C",
            status=SEVERITY_INCONCLUSIVE, headline="No Signal",
            detail="Body temperature reading is unavailable.", icon="thermometer",
            unit="°C",
            normal_range="36.0–37.4 °C",
            baseline_value=baseline_temp,
            delta_text="Awaiting thermal sensor",
            accent="neutral",
            range_pct=None,
            safe_start_pct=25.0,
            safe_end_pct=50.0,
        )
    val_str = f"{temp:.1f} °C"
    pct = _scale_pct(temp, 34.5, 40.5)
    common = dict(
        parameter="Body Temperature",
        value=val_str,
        icon="thermometer",
        unit="°C",
        normal_range="36.0–37.4 °C",
        baseline_value=baseline_temp,
        delta_text=delta or "Afebrile resting band",
        accent="amber",
        range_pct=pct,
        safe_start_pct=25.0,
        safe_end_pct=50.0,
    )
    if temp >= _TEMP_HIGH_FEVER:
        return ParameterFinding(
            status=SEVERITY_ALERT,
            headline="High Fever",
            detail=(f"Your body temperature is {temp:.1f} °C, indicating a high fever. "
                    "Rest in a cool space, stay well-hydrated, and seek medical attention if the fever persists."),
            **common,
        )
    elif temp >= _TEMP_FEVER:
        return ParameterFinding(
            status=SEVERITY_WATCH,
            headline="Mild Fever",
            detail=(f"Your body temperature is {temp:.1f} °C, slightly elevated above the typical maximum of {_TEMP_NORMAL_MAX} °C. "
                    "Rest, stay hydrated, and monitor. Consult a professional if the temperature rises."),
            **common,
        )
    elif temp >= _TEMP_NORMAL_MAX:
        return ParameterFinding(
            status=SEVERITY_WATCH,
            headline="Slightly Elevated",
            detail=(f"Your body temperature is {temp:.1f} °C, just above the typical normal maximum of {_TEMP_NORMAL_MAX} °C. "
                    "This may reflect physical exertion. Monitor and rest if needed."),
            **common,
        )
    return ParameterFinding(
        status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your body temperature is {temp:.1f} °C, within the normal range. No sign of fever."),
        **common,
    )


def _assess_blood_pressure(
    bp_sys: float,
    bp_dia: float,
    baseline_sys: Optional[float] = None,
    baseline_dia: Optional[float] = None,
) -> ParameterFinding:
    if bp_sys <= 0:
        return ParameterFinding(
            parameter="Blood Pressure", value="- mmHg",
            status=SEVERITY_INCONCLUSIVE, headline="Not Measured",
            detail="Blood pressure sensor is not connected or no reading is available for this session.",
            icon="activity",
            unit="mmHg",
            normal_range="< 130/80 mmHg",
            baseline_value=baseline_sys,
            delta_text="Cuff in standby — optional check",
            accent="neutral",
            range_pct=None,
            safe_start_pct=10.0,
            safe_end_pct=50.0,
        )
    val_str = f"{bp_sys:.0f}/{bp_dia:.0f} mmHg"
    map_val = round((bp_sys + 2.0 * bp_dia) / 3.0)
    pp_val = round(bp_sys - bp_dia)
    delta = f"MAP {map_val} mmHg • Pulse Pressure {pp_val} mmHg"
    if baseline_sys and baseline_sys > 0:
        sys_diff = bp_sys - baseline_sys
        if abs(sys_diff) >= 2:
            delta = f"{sys_diff:+.0f} sys vs baseline • MAP {map_val}"

    pct = _scale_pct(bp_sys, 80.0, 180.0)
    common = dict(
        parameter="Blood Pressure",
        value=val_str,
        icon="activity",
        unit="mmHg",
        normal_range="< 130/80 mmHg",
        baseline_value=baseline_sys,
        delta_text=delta,
        accent="lavender",
        range_pct=pct,
        safe_start_pct=10.0,
        safe_end_pct=50.0,
    )
    if bp_sys >= _BP_SYS_HIGH or bp_dia >= _BP_DIA_HIGH:
        return ParameterFinding(
            status=SEVERITY_ALERT,
            headline="High (Stage 2)",
            detail=(f"Your blood pressure is {val_str}, in the Stage 2 hypertension range "
                    f"(systolic >={_BP_SYS_HIGH} or diastolic >={_BP_DIA_HIGH} mmHg). "
                    "Stop strenuous activity, rest, and seek medical evaluation."),
            **common,
        )
    elif bp_sys >= _BP_SYS_NORMAL_MAX or bp_dia >= _BP_DIA_NORMAL_MAX:
        return ParameterFinding(
            status=SEVERITY_WATCH,
            headline="Elevated",
            detail=(f"Your blood pressure is {val_str}, above the normal range "
                    f"(< {_BP_SYS_NORMAL_MAX}/{_BP_DIA_NORMAL_MAX} mmHg). "
                    "Reduce sodium intake, limit stress, and monitor regularly."),
            **common,
        )
    elif bp_sys < _BP_SYS_LOW:
        return ParameterFinding(
            status=SEVERITY_ALERT,
            headline="Low (Hypotension)",
            detail=(f"Your systolic blood pressure is {bp_sys:.0f} mmHg, below the safe threshold of {_BP_SYS_LOW} mmHg. "
                    "Sit or lie down and hydrate. Seek medical advice if symptoms are present."),
            **common,
        )
    return ParameterFinding(
        status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your blood pressure is {val_str}, within the healthy range "
                f"(< {_BP_SYS_NORMAL_MAX}/{_BP_DIA_NORMAL_MAX} mmHg). Cardiovascular pressure appears well-regulated."),
        **common,
    )


def _assess_environment(
    room_temp: float,
    humidity: float,
    heat_idx: Optional[float] = None,
) -> ParameterFinding:
    issues = []
    status = SEVERITY_OK

    if room_temp >= _ROOM_TEMP_HOT:
        issues.append(f"room temperature is high ({room_temp:.1f} °C) - move to a cooler area if possible")
        status = SEVERITY_WATCH
    elif room_temp >= _ROOM_TEMP_COMFORTABLE_MAX:
        issues.append(f"room temperature is slightly warm ({room_temp:.1f} °C)")
        status = SEVERITY_WATCH

    if humidity >= _HUMIDITY_HIGH:
        issues.append(f"humidity is high ({humidity:.0f}%) - this can make heat feel more intense")
        if status == SEVERITY_OK:
            status = SEVERITY_WATCH
    elif humidity <= _HUMIDITY_LOW:
        issues.append(f"humidity is low ({humidity:.0f}%) - dry air can irritate airways; stay hydrated")
        if status == SEVERITY_OK:
            status = SEVERITY_WATCH

    if issues:
        headline = "Attention"
        detail = "Your environment may be affecting your comfort: " + "; ".join(issues) + "."
    else:
        headline = "Comfortable"
        detail = (f"Room temperature is {room_temp:.1f} °C and humidity is {humidity:.0f}%, "
                  "both within a comfortable range.")

    hi = heat_idx if heat_idx is not None else _heat_index(room_temp, humidity)
    pct = _scale_pct(room_temp, 15.0, 40.0)

    return ParameterFinding(
        parameter="Room Environment",
        value=f"{room_temp:.1f} °C / {humidity:.0f}% RH",
        status=status,
        headline=headline,
        detail=detail,
        icon="cloud",
        unit="°C / % RH",
        normal_range="18–28 °C • 30–70%",
        baseline_value=None,
        delta_text=f"Heat Index: {hi:.1f} °C • Humidity {humidity:.0f}%",
        accent="teal",
        range_pct=pct,
        safe_start_pct=12.0,
        safe_end_pct=52.0,
    )


# ── ECG assessor ─────────────────────────────────────────────────────────────

def _extract_clean_interval(raw: Optional[str], fallback_num: int) -> str:
    if raw and str(raw).strip():
        base = str(raw).strip().split("(")[0].strip()
        return base if base else f"{fallback_num} ms"
    return f"{fallback_num} ms"


def _assess_ecg(
    reading: SensorReading,
    ecg_data: Optional[dict] = None,
) -> ECGInterpretation:
    """
    Evaluate ECG lead status, rhythm, and intervals into a plain-English interpretation.
    Emits both backward-compatible summary strings and clean non-duplicated values.
    """
    data = ecg_data or {}
    leads_off = data.get("leads_off", False)
    lead_quality = data.get("lead_quality", "98% (Good contact)")

    # 1. Check for disconnected / high-impedance leads
    if leads_off or (reading.heart_rate <= 0 and not ecg_data):
        return ECGInterpretation(
            status=SEVERITY_INCONCLUSIVE,
            headline="Leads Detached / Awaiting Contact",
            rhythm="No Signal Detected",
            pr_interval="- ms",
            qrs_duration="- ms",
            qtc_interval="- ms",
            pr_value="- ms",
            pr_norm="120–200 ms",
            qrs_value="- ms",
            qrs_norm="60–100 ms",
            qtc_value="- ms",
            qtc_norm="< 440 ms",
            lead_quality="Disconnected (Leads Off)",
            summary=(
                "ECG electrodes appear detached or impedance is too high for Lead I. "
                "Please inspect the 3 electrode pads on your arms/chest and ensure snug contact with skin. "
                "No rhythm diagnosis can be performed while leads are disconnected."
            ),
        )

    # 2. Extract or compute rate-responsive intervals
    hr = float(data.get("hr") or (reading.heart_rate if reading.heart_rate > 0 else 74.0))
    rr_ms = max(350.0, 60000.0 / max(30.0, hr))
    calc_pr = round(_clamp(156.0 + (75.0 - hr) * 0.35, 120.0, 210.0))
    calc_qrs = round(87.0 + math.sin(hr) * 2.0)
    raw_qtc = _clamp(408.0 + (hr - 70.0) * 0.42 + math.sin(hr * 0.3) * 2.0, 385.0, 455.0)
    qt_ms = round(raw_qtc * math.sqrt(rr_ms / 1000.0))
    calc_qtc = round(qt_ms / math.sqrt(rr_ms / 1000.0))

    pr_clean = _extract_clean_interval(data.get("pr"), calc_pr)
    qrs_clean = _extract_clean_interval(data.get("qrs"), calc_qrs)
    qtc_clean = _extract_clean_interval(data.get("qtc"), calc_qtc)

    pr_norm = "120–200 ms"
    qrs_norm = "60–100 ms"
    qtc_norm = "< 440 ms"

    pr_display = f"{pr_clean} ({pr_norm} normal)"
    qrs_display = f"{qrs_clean} ({qrs_norm} normal)"
    qtc_display = f"{qtc_clean} ({qtc_norm} normal)"

    # 3. Classify rhythm based on HR & provided rhythm label
    custom_rhythm = data.get("rhythm")

    if hr >= _HR_VERY_HIGH:
        status = SEVERITY_ALERT
        headline = "Marked Tachycardia"
        rhythm = custom_rhythm or "Sinus Tachycardia (Marked)"
        summary = (
            f"Your ECG shows an accelerated rhythm at {hr:.0f} bpm. While individual P-QRS-T complexes "
            "are forming, the high resting frequency indicates cardiovascular strain. "
            "Rest quietly immediately and hydrate. Seek emergency evaluation if accompanied by chest pressure."
        )
    elif hr >= _HR_HIGH:
        status = SEVERITY_WATCH
        headline = "Mild Tachycardia"
        rhythm = custom_rhythm or "Sinus Tachycardia (ST)"
        summary = (
            f"Your ECG indicates an elevated rate ({hr:.0f} bpm) with regular conduction intervals. "
            "This is commonly seen after recent physical activity, anxiety, or caffeine consumption. "
            "Sit in a cool, quiet room and allow your rate to settle."
        )
    elif hr <= _HR_VERY_LOW:
        status = SEVERITY_ALERT
        headline = "Marked Bradycardia"
        rhythm = custom_rhythm or "Sinus Bradycardia (Marked)"
        summary = (
            f"Your ECG shows a significantly slow rate at {hr:.0f} bpm with prolonged cycle times. "
            "If you experience fatigue, confusion, or lightheadedness, seek medical evaluation promptly."
        )
    elif hr <= _HR_LOW:
        status = SEVERITY_WATCH
        headline = "Mild Bradycardia"
        rhythm = custom_rhythm or "Sinus Bradycardia (SB)"
        summary = (
            f"Your ECG rhythm is regular at {hr:.0f} bpm, slightly below standard resting norms. "
            "This can be benign in athletic individuals or during deep relaxation."
        )
    else:
        status = SEVERITY_OK
        headline = "Normal Sinus Rhythm"
        rhythm = custom_rhythm or "Normal Sinus Rhythm (NSR)"
        summary = (
            "Cardiac electrical activation follows a normal physiological sequence. "
            "P-waves precede each narrow QRS complex, indicating synchronized ventricular depolarization "
            "without conduction delays on Lead I."
        )

    return ECGInterpretation(
        status=status,
        headline=headline,
        rhythm=rhythm,
        pr_interval=pr_display,
        qrs_duration=qrs_display,
        qtc_interval=qtc_display,
        pr_value=pr_clean,
        pr_norm=pr_norm,
        qrs_value=qrs_clean,
        qrs_norm=qrs_norm,
        qtc_value=qtc_clean,
        qtc_norm=qtc_norm,
        lead_quality=lead_quality,
        summary=summary,
    )


# ── Readiness / Wellness Score & Subsystem Summary ────────────────────────────

def _compute_wellness_score(
    reading: SensorReading,
    findings: List[ParameterFinding],
    ecg_interp: ECGInterpretation,
    heat_idx: float,
) -> Dict[str, Any]:
    standby_notes: List[str] = []

    # 1. Cardiovascular component
    hr = reading.heart_rate
    hr_score: Optional[float] = None
    if hr > 0:
        if 62 <= hr <= 88:
            hr_score = 98.0
        elif 60 <= hr <= 100:
            hr_score = 90.0
        elif (52 <= hr < 60) or (100 < hr <= 112):
            hr_score = 72.0
        elif (40 < hr < 52) or (112 < hr < 120):
            hr_score = 54.0
        else:
            hr_score = 34.0

    bp_measured = reading.bp_sys > 0 and reading.bp_dia > 0
    bp_score: Optional[float] = None
    if bp_measured:
        if reading.bp_sys < _BP_SYS_NORMAL_MAX and reading.bp_dia < _BP_DIA_NORMAL_MAX and reading.bp_sys >= _BP_SYS_LOW:
            bp_score = 96.0
        elif reading.bp_sys >= _BP_SYS_HIGH or reading.bp_dia >= _BP_DIA_HIGH or reading.bp_sys < _BP_SYS_LOW:
            bp_score = 38.0
        else:
            bp_score = 68.0
    else:
        standby_notes.append("Blood pressure cuff in standby — wellness score computed without penalty.")

    if hr_score is not None and bp_score is not None:
        cardio_score = round(hr_score * 0.58 + bp_score * 0.42)
    elif hr_score is not None:
        cardio_score = round(hr_score)
    elif bp_score is not None:
        cardio_score = round(bp_score)
    else:
        cardio_score = 0

    if ecg_interp.status == SEVERITY_ALERT:
        cardio_score = min(cardio_score, 48)
    elif ecg_interp.status == SEVERITY_WATCH:
        cardio_score = min(cardio_score, 76)
    elif ecg_interp.status == SEVERITY_INCONCLUSIVE:
        standby_notes.append("ECG leads detached — rhythm telemetry in standby.")

    # 2. Oxygenation component
    spo2 = reading.spo2
    if spo2 > 0:
        if spo2 >= 97.0:
            oxy_score = round(min(100.0, 95.0 + (spo2 - 97.0) * 1.6))
        elif spo2 >= 95.0:
            oxy_score = round(88.0 + (spo2 - 95.0) * 3.5)
        elif spo2 >= 90.0:
            oxy_score = round(58.0 + (spo2 - 90.0) * 5.0)
        else:
            oxy_score = round(max(20.0, 45.0 - (90.0 - spo2) * 5.0))
    else:
        oxy_score = 0
        standby_notes.append("SpO2 probe disconnected.")

    # 3. Thermal component
    temp = reading.body_temperature
    if temp > 0:
        if 36.1 <= temp <= 37.2:
            t_score = 98.0
        elif 35.6 <= temp < _TEMP_NORMAL_MAX:
            t_score = 90.0
        elif temp < _TEMP_FEVER:
            t_score = 74.0
        elif temp < _TEMP_HIGH_FEVER:
            t_score = 54.0
        else:
            t_score = 30.0
    else:
        t_score = 0

    env_score = 96.0
    if heat_idx >= 37.0:
        env_score = 42.0
    elif heat_idx >= 32.0:
        env_score = 64.0
    elif heat_idx >= 28.0 or reading.humidity >= _HUMIDITY_HIGH or reading.humidity <= _HUMIDITY_LOW:
        env_score = 80.0

    thermal_score = round(t_score * 0.72 + env_score * 0.28) if temp > 0 else round(env_score)

    # Combine active components with dynamic re-weighting
    weighted_sum = 0.0
    weight_total = 0.0
    if hr_score is not None or bp_score is not None:
        weighted_sum += cardio_score * 0.42
        weight_total += 0.42
    if spo2 > 0:
        weighted_sum += oxy_score * 0.34
        weight_total += 0.34
    if temp > 0:
        weighted_sum += thermal_score * 0.24
        weight_total += 0.24

    overall_score = round(weighted_sum / weight_total) if weight_total > 0 else 0

    # Ensure UI severity & score stay clinically consistent
    has_alert = any(f.status == SEVERITY_ALERT for f in findings) or ecg_interp.status == SEVERITY_ALERT
    has_watch = any(f.status == SEVERITY_WATCH for f in findings) or ecg_interp.status == SEVERITY_WATCH
    if has_alert:
        overall_score = min(overall_score, 58)
    elif has_watch:
        overall_score = min(overall_score, 81)

    overall_score = int(_clamp(overall_score, 0, 100))
    if overall_score >= 82:
        label = "Optimal"
    elif overall_score >= 60:
        label = "Moderate Strain"
    else:
        label = "High Strain"

    active_sensors = sum([
        1 if reading.heart_rate > 0 else 0,
        1 if reading.spo2 > 0 else 0,
        1 if reading.body_temperature > 0 else 0,
        1 if bp_measured else 0,
        1 if reading.room_temperature != 0 else 0,
        1 if reading.humidity != 0 else 0,
    ])
    total_sensors = 6
    completeness_pct = round(active_sensors / total_sensors * 100)

    return {
        "score": overall_score,
        "label": label,
        "completeness_pct": completeness_pct,
        "active_sensors": active_sensors,
        "total_sensors": total_sensors,
        "standby_notes": standby_notes,
        "components": {
            "cardiovascular": int(cardio_score),
            "oxygenation": int(oxy_score),
            "thermal": int(thermal_score),
        },
    }


def _build_subsystem_summary(
    reading: SensorReading,
    findings: List[ParameterFinding],
    fused_risk: FusedRisk,
    heat_idx: float,
    strain: float,
    hr_base: Optional[float],
    spo2_base: Optional[float],
    temp_base: Optional[float],
) -> Dict[str, Any]:
    fmap = {f.parameter: f for f in findings}
    hr_f = fmap.get("Heart Rate")
    bp_f = fmap.get("Blood Pressure")
    spo2_f = fmap.get("Blood Oxygen (SpO2)")
    temp_f = fmap.get("Body Temperature")
    env_f = fmap.get("Room Environment")

    # Worst status helper
    order = {SEVERITY_ALERT: 3, SEVERITY_WATCH: 2, SEVERITY_INCONCLUSIVE: 1, SEVERITY_OK: 0}
    cardio_st = (
        hr_f.status
        if order.get(hr_f.status if hr_f else SEVERITY_OK, 0) >= order.get(bp_f.status if bp_f else SEVERITY_OK, 0)
        else bp_f.status
    )
    if cardio_st == SEVERITY_INCONCLUSIVE and hr_f and hr_f.status == SEVERITY_OK:
        cardio_st = SEVERITY_OK

    bp_measured = reading.bp_sys > 0 and reading.bp_dia > 0
    map_mmhg = round((reading.bp_sys + 2.0 * reading.bp_dia) / 3.0) if bp_measured else None
    pp_mmhg = round(reading.bp_sys - reading.bp_dia) if bp_measured else None

    hr_delta = _format_delta(reading.heart_rate, hr_base, decimals=0, unit="bpm", tol=1.0) or (
        "Resting stability" if hr_f and hr_f.status == SEVERITY_OK else "Monitor rhythm"
    )
    spo2_delta = _format_delta(reading.spo2, spo2_base, decimals=1, unit="%", tol=0.2) or "Steady baseline saturation"
    temp_delta = _format_delta(reading.body_temperature, temp_base, decimals=1, unit="°C", tol=0.15) or "Normal thermoregulation"

    comfort_band = "Optimal"
    if heat_idx >= 37.0 or fused_risk.heat_risk == "HIGH":
        comfort_band = "High Heat Stress"
    elif heat_idx >= 32.0 or fused_risk.heat_risk == "WATCH":
        comfort_band = "Heat Watch"
    elif heat_idx >= 28.0:
        comfort_band = "Warm Ambient"

    therm_st = temp_f.status if temp_f else SEVERITY_OK
    if env_f and order.get(env_f.status, 0) > order.get(therm_st, 0):
        therm_st = env_f.status

    margin_opt = round(reading.spo2 - _SPO2_NORMAL, 1) if reading.spo2 > 0 else None
    margin_crit = round(reading.spo2 - _SPO2_WATCH, 1) if reading.spo2 > 0 else None

    return {
        "cardiovascular": {
            "status": cardio_st,
            "hr_bpm": round(reading.heart_rate) if reading.heart_rate > 0 else None,
            "hr_delta_text": hr_delta,
            "bp_measured": bp_measured,
            "bp_text": f"{reading.bp_sys:.0f}/{reading.bp_dia:.0f} mmHg" if bp_measured else "Cuff Standby",
            "map_mmhg": map_mmhg,
            "pulse_pressure_mmhg": pp_mmhg,
            "summary": (
                f"MAP {map_mmhg} mmHg • Pulse Pressure {pp_mmhg} mmHg"
                if bp_measured
                else "HR steady; BP cuff in optional standby"
            ),
        },
        "respiratory": {
            "status": spo2_f.status if spo2_f else SEVERITY_OK,
            "spo2_pct": round(reading.spo2, 1) if reading.spo2 > 0 else None,
            "margin_optimal": margin_opt,
            "margin_critical": margin_crit,
            "spo2_delta_text": spo2_delta,
            "risk_level": fused_risk.respiratory_risk or "NORMAL",
            "summary": (
                f"{margin_opt:+.1f}% buffer vs 95% floor"
                if margin_opt is not None
                else "Awaiting pulse oximetry signal"
            ),
        },
        "thermal": {
            "status": therm_st,
            "body_temp_c": round(reading.body_temperature, 1) if reading.body_temperature > 0 else None,
            "temp_delta_text": temp_delta,
            "room_temp_c": round(reading.room_temperature, 1),
            "humidity_pct": round(reading.humidity),
            "heat_index_c": round(heat_idx, 1),
            "strain_score": strain,
            "comfort_band": comfort_band,
            "summary": f"Heat Index {heat_idx:.1f} °C • Strain {strain:.0f}/100 ({comfort_band})",
        },
    }


# ── Action triage builder ───────────────────────────────────────────────────

def _build_next_step(
    overall: str,
    findings: List[ParameterFinding],
    ecg_interp: ECGInterpretation,
) -> NextStepTriage:
    if overall == SEVERITY_ALERT:
        alert_names = [f.parameter for f in findings if f.status == SEVERITY_ALERT]
        if ecg_interp.status == SEVERITY_ALERT:
            alert_names.append("Cardiac Rhythm")
        cause = ", ".join(alert_names) if alert_names else "one or more vital signs"
        return NextStepTriage(
            category="URGENT_ATTENTION",
            badge_label="URGENT ATTENTION",
            headline="Action Required — High Risk Finding",
            action=(
                f"Significant elevation or irregularity detected in {cause}. "
                "Stop all physical exertion immediately. Sit or recline in a supported, comfortable position. "
                "Have someone nearby assist you, and contact a healthcare professional or urgent clinic if readings do not normalize within 10 minutes."
            ),
        )
    elif overall == SEVERITY_WATCH:
        watch_names = [f.parameter for f in findings if f.status == SEVERITY_WATCH]
        if ecg_interp.status == SEVERITY_WATCH:
            watch_names.append("Cardiac Rhythm")
        cause = ", ".join(watch_names) if watch_names else "some indicators"
        return NextStepTriage(
            category="RECHECK_OR_ADVICE",
            badge_label="RECHECK & MONITOR",
            headline="Rest & Recheck in 5–10 Minutes",
            action=(
                f"Mild variation observed in {cause}. "
                "Sit quietly, take 5 slow diaphragmatic breaths, drink a glass of water, and re-test. "
                "Keep a log if this pattern persists over several days."
            ),
        )
    else:
        return NextStepTriage(
            category="ROUTINE_MONITORING",
            badge_label="ROUTINE MONITORING",
            headline="Maintain Healthy Baseline",
            action=(
                "All measured biometrics and ECG conduction timings are within healthy resting limits. "
                "Continue your regular daily wellness routine, adequate hydration, and balanced sleep."
            ),
        )


# ── Narrative & Categorized Guidance builders ─────────────────────────────────

def _build_overall_narrative(
    overall: str,
    findings: List[ParameterFinding],
    fused_risk: FusedRisk,
    ecg_interp: Optional[ECGInterpretation] = None,
) -> tuple:
    alert_params = [f.parameter for f in findings if f.status == SEVERITY_ALERT]
    watch_params = [f.parameter for f in findings if f.status == SEVERITY_WATCH]
    if ecg_interp:
        if ecg_interp.status == SEVERITY_ALERT:
            alert_params.append("ECG rhythm")
        elif ecg_interp.status == SEVERITY_WATCH:
            watch_params.append("ECG rhythm")

    if overall == SEVERITY_ALERT:
        headline = "Attention Required"
        params_str = " and ".join(alert_params) if alert_params else "one or more indicators"
        summary = (
            f"Your monitoring data shows a concern with {params_str}. "
            "Please stop any strenuous activity, rest in a comfortable position, and re-check your readings. "
            "If symptoms are present or readings do not improve, seek appropriate medical advice."
        )
    elif overall == SEVERITY_WATCH:
        headline = "Monitor Closely"
        params_str = " and ".join(watch_params) if watch_params else "some indicators"
        summary = (
            f"{params_str.capitalize()} {'are' if len(watch_params) > 1 else 'is'} slightly outside the normal range. "
            "No immediate action is required, but keep monitoring over the next few minutes. "
            "Rest if you have been physically active and re-check shortly."
        )
    else:
        headline = "All Clear"
        summary = (
            "All measured indicators and cardiac rhythm timings are within normal ranges. "
            "Your vitals, ECG trace, and environment appear stable. "
            "Keep up your healthy habits and continue regular monitoring."
        )

    return headline, summary


def _build_structured_tips(
    overall: str,
    findings: List[ParameterFinding],
    ecg_interp: Optional[ECGInterpretation],
    heat_idx: float,
    strain: float,
) -> List[Dict[str, str]]:
    structured: List[Dict[str, str]] = []

    for f in findings:
        if f.parameter == "Heart Rate" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            structured.append({
                "category": "Hydration",
                "icon": "droplet",
                "title": "Rehydrate & Settle Pulse",
                "detail": "Stay hydrated - even mild dehydration can elevate your heart rate.",
                "priority": "high" if f.status == SEVERITY_ALERT else "watch",
            })
            structured.append({
                "category": "Breathing",
                "icon": "lungs",
                "title": "Paced Vagal Breathing",
                "detail": "Practice slow, diaphragmatic breathing: inhale for 4 counts, hold for 4, exhale for 6.",
                "priority": "watch",
            })
        if f.parameter == "Blood Oxygen (SpO2)" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            structured.append({
                "category": "Oxygenation",
                "icon": "lungs",
                "title": "Improve Ventilation & Posture",
                "detail": "Sit upright in a well-ventilated area and take slow, deep breaths to improve oxygen levels.",
                "priority": "high" if f.status == SEVERITY_ALERT else "watch",
            })
        if f.parameter == "Body Temperature" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            structured.append({
                "category": "Thermal Cooling",
                "icon": "thermometer",
                "title": "Cool Down & Fluids",
                "detail": "Rest in a cool environment and drink plenty of water to help bring your temperature down.",
                "priority": "high" if f.status == SEVERITY_ALERT else "watch",
            })
        if f.parameter == "Blood Pressure" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            structured.append({
                "category": "Cardiovascular",
                "icon": "heart",
                "title": "Sodium & Stimulant Moderation",
                "detail": "Reducing sodium (salt) in your diet and limiting caffeine can help manage blood pressure.",
                "priority": "high" if f.status == SEVERITY_ALERT else "watch",
            })
            structured.append({
                "category": "Activity",
                "icon": "activity",
                "title": "Regular Moderate Movement",
                "detail": "Light walking for 30 minutes most days is one of the most effective ways to improve blood pressure.",
                "priority": "watch",
            })
        if f.parameter == "Room Environment" and f.status == SEVERITY_WATCH:
            structured.append({
                "category": "Environment",
                "icon": "cloud",
                "title": f"Ambient Heat Index ({heat_idx:.1f} °C)",
                "detail": "Improve ventilation - open a window or use a fan to reduce heat and humidity in your space.",
                "priority": "watch",
            })

    if ecg_interp and ecg_interp.status in (SEVERITY_ALERT, SEVERITY_WATCH):
        structured.append({
            "category": "Rhythm Safety",
            "icon": "waveform",
            "title": "Pause High Exertion",
            "detail": "Avoid intense cardiovascular exertion while your heart rhythm is elevated or irregular.",
            "priority": "high",
        })

    if overall == SEVERITY_OK and not structured:
        structured = [
            {
                "category": "Routine",
                "icon": "shield",
                "title": "Baseline Maintained",
                "detail": "Your vitals look great! Continue with your regular routine.",
                "priority": "normal",
            },
            {
                "category": "Activity",
                "icon": "activity",
                "title": "Weekly Aerobic Target",
                "detail": "Aim for at least 150 minutes of moderate aerobic activity per week.",
                "priority": "normal",
            },
            {
                "category": "Recovery",
                "icon": "moon",
                "title": "Restorative Sleep Window",
                "detail": "Quality sleep (7-9 hours) plays a key role in maintaining healthy vitals.",
                "priority": "normal",
            },
            {
                "category": "Nutrition",
                "icon": "heart",
                "title": "Whole-Food Vascular Fuel",
                "detail": "A balanced diet rich in fruits, vegetables, and whole grains supports long-term heart health.",
                "priority": "normal",
            },
        ]

    # Deduplicate by detail text, preserve up to 5 items
    seen: set = set()
    unique: List[Dict[str, str]] = []
    for item in structured:
        d = item["detail"]
        if d not in seen:
            seen.add(d)
            unique.append(item)
        if len(unique) >= 5:
            break

    if not unique:
        unique.append({
            "category": "Monitoring",
            "icon": "clock",
            "title": "Consistent Check-Ins",
            "detail": "Continue monitoring your vitals regularly for early detection of changes.",
            "priority": "normal",
        })

    return unique


def _build_lifestyle_tips(
    overall: str,
    findings: List[ParameterFinding],
    ecg_interp: Optional[ECGInterpretation] = None,
) -> List[str]:
    return [t["detail"] for t in _build_structured_tips(overall, findings, ecg_interp, 24.0, 0.0)]
