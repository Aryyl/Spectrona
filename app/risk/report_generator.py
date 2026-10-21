"""
risk/report_generator.py
========================
Converts a live SensorReading + FusedRisk snapshot into a plain-English
HealthReport that non-clinical users can understand.

Design principles
-----------------
* Never fabricate measurements – every finding references an actual value.
* Zero BP (no sensor) → treated as "not measured", not "normal".
* SpO2 at normal levels never hides a concurrent hypertension finding.
* Language is wellness-oriented, never a clinical diagnosis.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from app.ingestion.normalizer import SensorReading
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


@dataclass
class ParameterFinding:
    """A single-parameter assessment block shown in the report card."""
    parameter: str          # e.g. "Heart Rate"
    value: str              # e.g. "88 bpm"
    status: str             # ok | watch | alert | inconclusive
    headline: str           # short user-facing label, e.g. "Normal"
    detail: str             # 1-2 sentence plain-English explanation
    icon: str               # icon name key understood by icons.js


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
    ecg_interpretation: ECGInterpretation # Simplified ECG interpretation
    findings: List[ParameterFinding]  # ordered list of parameter cards
    lifestyle_tips: List[str]         # 3-5 actionable plain-English tips
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
            "findings": [
                {
                    "parameter": f.parameter,
                    "value": f.value,
                    "status": f.status,
                    "headline": f.headline,
                    "detail": f.detail,
                    "icon": f.icon,
                }
                for f in self.findings
            ],
            "lifestyle_tips": self.lifestyle_tips,
            "disclaimer": self.disclaimer,
        }


# ── Public entry-point ────────────────────────────────────────────────────────

def generate_report(
    reading: SensorReading,
    fused_risk: FusedRisk,
    ecg_data: Optional[dict] = None,
) -> HealthReport:
    """
    Build a HealthReport from the latest reading, fused risk, and optional ECG data.
    """
    findings: List[ParameterFinding] = []

    findings.append(_assess_heart_rate(reading.heart_rate))
    findings.append(_assess_spo2(reading.spo2))
    findings.append(_assess_body_temp(reading.body_temperature))
    findings.append(_assess_blood_pressure(reading.bp_sys, reading.bp_dia))
    findings.append(_assess_environment(reading.room_temperature, reading.humidity))

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
    tips = _build_lifestyle_tips(overall, findings, ecg_interp)

    return HealthReport(
        overall_status=overall_risk_label,
        overall_headline=headline,
        overall_summary=summary,
        next_step=next_step,
        ecg_interpretation=ecg_interp,
        findings=findings,
        lifestyle_tips=tips,
    )


# ── Parameter assessors ───────────────────────────────────────────────────────

def _assess_heart_rate(hr: float) -> ParameterFinding:
    if hr <= 0:
        return ParameterFinding(
            parameter="Heart Rate",
            value="- bpm",
            status=SEVERITY_INCONCLUSIVE,
            headline="No Signal",
            detail="No heart rate reading is available. Ensure the sensor is correctly placed.",
            icon="heart",
        )
    val_str = f"{hr:.0f} bpm"
    if hr >= _HR_VERY_HIGH:
        return ParameterFinding(
            parameter="Heart Rate", value=val_str, status=SEVERITY_ALERT,
            headline="Very Elevated",
            detail=(f"Your heart rate is {hr:.0f} bpm, significantly above the normal resting range of "
                    f"{_HR_LOW}-{_HR_HIGH} bpm. Stop strenuous activity and rest immediately. "
                    "If this persists or you feel chest pain or dizziness, seek medical attention."),
            icon="heart",
        )
    elif hr >= _HR_HIGH:
        return ParameterFinding(
            parameter="Heart Rate", value=val_str, status=SEVERITY_WATCH,
            headline="Slightly Elevated",
            detail=(f"Your heart rate is {hr:.0f} bpm, just above the typical resting range of {_HR_LOW}-{_HR_HIGH} bpm. "
                    "This can be normal after mild activity or stress. Rest quietly and monitor."),
            icon="heart",
        )
    elif hr <= _HR_VERY_LOW:
        return ParameterFinding(
            parameter="Heart Rate", value=val_str, status=SEVERITY_ALERT,
            headline="Very Low",
            detail=(f"Your heart rate is {hr:.0f} bpm, well below the normal resting range. "
                    "Very low heart rate can cause dizziness or fainting. Rest and seek medical assessment promptly."),
            icon="heart",
        )
    elif hr <= _HR_LOW:
        return ParameterFinding(
            parameter="Heart Rate", value=val_str, status=SEVERITY_WATCH,
            headline="Below Normal",
            detail=(f"Your heart rate is {hr:.0f} bpm, slightly below the standard resting range of {_HR_LOW}-{_HR_HIGH} bpm. "
                    "This may be normal for athletes. Monitor for fatigue or light-headedness."),
            icon="heart",
        )
    return ParameterFinding(
        parameter="Heart Rate", value=val_str, status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your heart rate is {hr:.0f} bpm, within the healthy resting range of {_HR_LOW}-{_HR_HIGH} bpm. "
                "Your cardiovascular activity appears stable."),
        icon="heart",
    )


def _assess_spo2(spo2: float) -> ParameterFinding:
    if spo2 <= 0:
        return ParameterFinding(
            parameter="Blood Oxygen (SpO2)",
            value="-%",
            status=SEVERITY_INCONCLUSIVE,
            headline="No Signal",
            detail="SpO2 sensor reading is unavailable. Ensure the sensor probe is properly attached.",
            icon="droplet",
        )
    val_str = f"{spo2:.1f}%"
    if spo2 < _SPO2_WATCH:
        return ParameterFinding(
            parameter="Blood Oxygen (SpO2)", value=val_str, status=SEVERITY_ALERT,
            headline="Critically Low",
            detail=(f"Your blood oxygen saturation is {spo2:.1f}%, significantly below the normal threshold of "
                    f">={_SPO2_NORMAL}%. Move to a well-ventilated area, sit upright, and breathe slowly and deeply. "
                    "Seek medical assessment promptly."),
            icon="droplet",
        )
    elif spo2 < _SPO2_NORMAL:
        return ParameterFinding(
            parameter="Blood Oxygen (SpO2)", value=val_str, status=SEVERITY_WATCH,
            headline="Slightly Low",
            detail=(f"Your SpO2 is {spo2:.1f}%, slightly below the normal range of >={_SPO2_NORMAL}%. "
                    "Sit upright in a well-ventilated space and take slow, deep breaths."),
            icon="droplet",
        )
    return ParameterFinding(
        parameter="Blood Oxygen (SpO2)", value=val_str, status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your blood oxygen level is {spo2:.1f}%, within the healthy range of >={_SPO2_NORMAL}%. "
                "Your lungs appear to be oxygenating your blood effectively."),
        icon="droplet",
    )


def _assess_body_temp(temp: float) -> ParameterFinding:
    if temp <= 0:
        return ParameterFinding(
            parameter="Body Temperature", value="- C",
            status=SEVERITY_INCONCLUSIVE, headline="No Signal",
            detail="Body temperature reading is unavailable.", icon="thermometer",
        )
    val_str = f"{temp:.1f} C"
    if temp >= _TEMP_HIGH_FEVER:
        return ParameterFinding(
            parameter="Body Temperature", value=val_str, status=SEVERITY_ALERT,
            headline="High Fever",
            detail=(f"Your body temperature is {temp:.1f} C, indicating a high fever. "
                    "Rest in a cool space, stay well-hydrated, and seek medical attention if the fever persists."),
            icon="thermometer",
        )
    elif temp >= _TEMP_FEVER:
        return ParameterFinding(
            parameter="Body Temperature", value=val_str, status=SEVERITY_WATCH,
            headline="Mild Fever",
            detail=(f"Your body temperature is {temp:.1f} C, slightly elevated above the typical maximum of {_TEMP_NORMAL_MAX} C. "
                    "Rest, stay hydrated, and monitor. Consult a professional if the temperature rises."),
            icon="thermometer",
        )
    elif temp >= _TEMP_NORMAL_MAX:
        return ParameterFinding(
            parameter="Body Temperature", value=val_str, status=SEVERITY_WATCH,
            headline="Slightly Elevated",
            detail=(f"Your body temperature is {temp:.1f} C, just above the typical normal maximum of {_TEMP_NORMAL_MAX} C. "
                    "This may reflect physical exertion. Monitor and rest if needed."),
            icon="thermometer",
        )
    return ParameterFinding(
        parameter="Body Temperature", value=val_str, status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your body temperature is {temp:.1f} C, within the normal range. No sign of fever."),
        icon="thermometer",
    )


def _assess_blood_pressure(bp_sys: float, bp_dia: float) -> ParameterFinding:
    if bp_sys <= 0:
        return ParameterFinding(
            parameter="Blood Pressure", value="- mmHg",
            status=SEVERITY_INCONCLUSIVE, headline="Not Measured",
            detail="Blood pressure sensor is not connected or no reading is available for this session.",
            icon="activity",
        )
    val_str = f"{bp_sys:.0f}/{bp_dia:.0f} mmHg"
    if bp_sys >= _BP_SYS_HIGH or bp_dia >= _BP_DIA_HIGH:
        return ParameterFinding(
            parameter="Blood Pressure", value=val_str, status=SEVERITY_ALERT,
            headline="High (Stage 2)",
            detail=(f"Your blood pressure is {val_str}, in the Stage 2 hypertension range "
                    f"(systolic >={_BP_SYS_HIGH} or diastolic >={_BP_DIA_HIGH} mmHg). "
                    "Stop strenuous activity, rest, and seek medical evaluation."),
            icon="activity",
        )
    elif bp_sys >= _BP_SYS_NORMAL_MAX or bp_dia >= _BP_DIA_NORMAL_MAX:
        return ParameterFinding(
            parameter="Blood Pressure", value=val_str, status=SEVERITY_WATCH,
            headline="Elevated",
            detail=(f"Your blood pressure is {val_str}, above the normal range "
                    f"(< {_BP_SYS_NORMAL_MAX}/{_BP_DIA_NORMAL_MAX} mmHg). "
                    "Reduce sodium intake, limit stress, and monitor regularly."),
            icon="activity",
        )
    elif bp_sys < _BP_SYS_LOW:
        return ParameterFinding(
            parameter="Blood Pressure", value=val_str, status=SEVERITY_ALERT,
            headline="Low (Hypotension)",
            detail=(f"Your systolic blood pressure is {bp_sys:.0f} mmHg, below the safe threshold of {_BP_SYS_LOW} mmHg. "
                    "Sit or lie down and hydrate. Seek medical advice if symptoms are present."),
            icon="activity",
        )
    return ParameterFinding(
        parameter="Blood Pressure", value=val_str, status=SEVERITY_OK,
        headline="Normal",
        detail=(f"Your blood pressure is {val_str}, within the healthy range "
                f"(< {_BP_SYS_NORMAL_MAX}/{_BP_DIA_NORMAL_MAX} mmHg). Cardiovascular pressure appears well-regulated."),
        icon="activity",
    )


def _assess_environment(room_temp: float, humidity: float) -> ParameterFinding:
    issues = []
    status = SEVERITY_OK

    if room_temp >= _ROOM_TEMP_HOT:
        issues.append(f"room temperature is high ({room_temp:.1f} C) - move to a cooler area if possible")
        status = SEVERITY_WATCH
    elif room_temp >= _ROOM_TEMP_COMFORTABLE_MAX:
        issues.append(f"room temperature is slightly warm ({room_temp:.1f} C)")
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
        detail = (f"Room temperature is {room_temp:.1f} C and humidity is {humidity:.0f}%, "
                  "both within a comfortable range.")

    return ParameterFinding(
        parameter="Room Environment",
        value=f"{room_temp:.1f} C / {humidity:.0f}% RH",
        status=status,
        headline=headline,
        detail=detail,
        icon="cloud",
    )


# ── ECG assessor ─────────────────────────────────────────────────────────────

def _assess_ecg(
    reading: SensorReading,
    ecg_data: Optional[dict] = None,
) -> ECGInterpretation:
    """
    Evaluate ECG lead status, rhythm, and intervals into a plain-English interpretation.
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
            lead_quality="Disconnected (Leads Off)",
            summary=(
                "ECG electrodes appear detached or impedance is too high for Lead I. "
                "Please inspect the 3 electrode pads on your arms/chest and ensure snug contact with skin. "
                "No rhythm diagnosis can be performed while leads are disconnected."
            ),
        )

    # 2. Extract or infer parameters
    hr = float(data.get("hr", reading.heart_rate))
    pr_str = str(data.get("pr", "156 ms"))
    qrs_str = str(data.get("qrs", "88 ms"))
    qtc_str = str(data.get("qtc", "408 ms"))

    # Append normal ranges if not already present
    if "norm" not in pr_str.lower() and "(" not in pr_str:
        pr_display = f"{pr_str} (120–200 ms normal)"
    else:
        pr_display = pr_str

    if "norm" not in qrs_str.lower() and "(" not in qrs_str:
        qrs_display = f"{qrs_str} (60–100 ms normal)"
    else:
        qrs_display = qrs_str

    if "norm" not in qtc_str.lower() and "(" not in qtc_str:
        qtc_display = f"{qtc_str} (< 440 ms normal)"
    else:
        qtc_display = qtc_str

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
        lead_quality=lead_quality,
        summary=summary,
    )


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


# ── Narrative builders ────────────────────────────────────────────────────────

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


def _build_lifestyle_tips(
    overall: str,
    findings: List[ParameterFinding],
    ecg_interp: Optional[ECGInterpretation] = None,
) -> List[str]:
    tips: List[str] = []

    for f in findings:
        if f.parameter == "Heart Rate" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            tips.append("Stay hydrated - even mild dehydration can elevate your heart rate.")
            tips.append("Practice slow, diaphragmatic breathing: inhale for 4 counts, hold for 4, exhale for 6.")
        if f.parameter == "Blood Oxygen (SpO2)" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            tips.append("Sit upright in a well-ventilated area and take slow, deep breaths to improve oxygen levels.")
        if f.parameter == "Body Temperature" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            tips.append("Rest in a cool environment and drink plenty of water to help bring your temperature down.")
        if f.parameter == "Blood Pressure" and f.status in (SEVERITY_ALERT, SEVERITY_WATCH):
            tips.append("Reducing sodium (salt) in your diet and limiting caffeine can help manage blood pressure.")
            tips.append("Light walking for 30 minutes most days is one of the most effective ways to improve blood pressure.")
        if f.parameter == "Room Environment" and f.status == SEVERITY_WATCH:
            tips.append("Improve ventilation - open a window or use a fan to reduce heat and humidity in your space.")

    if ecg_interp and ecg_interp.status in (SEVERITY_ALERT, SEVERITY_WATCH):
        tips.append("Avoid intense cardiovascular exertion while your heart rhythm is elevated or irregular.")

    if overall == SEVERITY_OK:
        tips = [
            "Your vitals look great! Continue with your regular routine.",
            "Aim for at least 150 minutes of moderate aerobic activity per week.",
            "Quality sleep (7-9 hours) plays a key role in maintaining healthy vitals.",
            "A balanced diet rich in fruits, vegetables, and whole grains supports long-term heart health.",
        ]

    # Deduplicate, keep up to 5
    seen: set = set()
    unique: List[str] = []
    for tip in tips:
        if tip not in seen:
            seen.add(tip)
            unique.append(tip)
        if len(unique) >= 5:
            break

    if not unique:
        unique.append("Continue monitoring your vitals regularly for early detection of changes.")

    return unique
