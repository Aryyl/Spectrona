"""
ingestion/normalizer.py
=======================
Converts a validated raw MQTT dict into a canonical SensorReading dataclass.
All downstream code works with SensorReading – never raw dicts.
"""

from __future__ import annotations

import datetime
from dataclasses import dataclass


@dataclass(frozen=True)
class SensorReading:
    """
    Canonical internal representation of one sensor sample.
    All fields are typed and immutable.
    """
    timestamp: datetime.datetime   # UTC datetime (timezone-aware)
    device_id: str
    heart_rate: float              # bpm
    spo2: float                    # %
    body_temperature: float        # °C
    room_temperature: float        # °C
    humidity: float                # %
    timestamp_epoch: float = 0.0   # Epoch seconds kept for DB storage
    bp_sys: float = 0.0            # mmHg – systolic blood pressure
    bp_dia: float = 0.0            # mmHg – diastolic blood pressure

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp.isoformat(),
            "timestamp_epoch": self.timestamp_epoch,
            "device_id": self.device_id,
            "heart_rate": self.heart_rate,
            "spo2": self.spo2,
            "body_temperature": self.body_temperature,
            "room_temperature": self.room_temperature,
            "humidity": self.humidity,
            "bp_sys": self.bp_sys,
            "bp_dia": self.bp_dia,
        }


def normalize(payload: dict) -> SensorReading:
    """
    Convert a validated MQTT payload dict to a SensorReading.

    Timestamp handling:
      - Assumes Unix epoch seconds (as ESP32 publishes).
      - Converts to UTC datetime.
    """
    epoch = float(payload["timestamp"])
    dt = datetime.datetime.fromtimestamp(epoch, tz=datetime.timezone.utc)

    # Blood pressure arrives as nested dict: {"sys": ..., "dia": ...} or flat bp_sys/bp_dia
    bp = payload.get("blood_pressure", {})
    if not isinstance(bp, dict):
        bp = {}
    sys_val = bp.get("sys") if "sys" in bp else payload.get("bp_sys", 0.0)
    dia_val = bp.get("dia") if "dia" in bp else payload.get("bp_dia", 0.0)

    return SensorReading(
        timestamp=dt,
        timestamp_epoch=epoch,
        device_id=str(payload["device_id"]),
        heart_rate=float(payload["heart_rate"]),
        spo2=float(payload["spo2"]),
        body_temperature=float(payload["body_temperature"]),
        room_temperature=float(payload["room_temperature"]),
        humidity=float(payload["humidity"]),
        bp_sys=float(sys_val or 0.0),
        bp_dia=float(dia_val or 0.0),
    )
