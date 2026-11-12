"""
app/api/care_routes.py
======================
Blueprint for Nearby Medical Services, Doctor Directory, and Emergency Geolocation.
Provides location-aware discovery of hospitals, clinics, cardiologists, 24/7 pharmacies,
and ambulance response hubs with direct contact details and emergency SOS actions.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Optional
from flask import Blueprint, jsonify, request

care_bp = Blueprint("care", __name__, url_prefix="/api/care")

# Default coordinates if device GPS is not granted (New Delhi Medical District)
DEFAULT_LAT = 28.6139
DEFAULT_LNG = 77.2090

# ── Haversine Distance Formula ────────────────────────────────────────────────
def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points in kilometers."""
    R = 6371.0  # Earth's radius in km
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 2)


# ── Relative Geographic Offset Calculation ────────────────────────────────────
def compute_offset_coordinates(center_lat: float, center_lng: float, distance_km: float, bearing_deg: float) -> tuple[float, float]:
    """Calculate destination lat/lng from a center point given distance and bearing."""
    R = 6371.0
    bearing_rad = math.radians(bearing_deg)
    lat_rad = math.radians(center_lat)
    lng_rad = math.radians(center_lng)

    dest_lat_rad = math.asin(
        math.sin(lat_rad) * math.cos(distance_km / R) +
        math.cos(lat_rad) * math.sin(distance_km / R) * math.cos(bearing_rad)
    )
    dest_lng_rad = lng_rad + math.atan2(
        math.sin(bearing_rad) * math.sin(distance_km / R) * math.cos(lat_rad),
        math.cos(distance_km / R) - math.sin(lat_rad) * math.sin(dest_lat_rad)
    )

    return (round(math.degrees(dest_lat_rad), 6), round(math.degrees(dest_lng_rad), 6))


# ── Master Medical Facility Blueprint Templates ──────────────────────────────
# 25 realistic facilities distributed systematically around the center
FACILITY_TEMPLATES = [
    # ── Category 1: Hospitals & 24/7 Trauma Centers ───────────────────────────
    {
        "id": "hosp_01",
        "name": "Apex Super-Specialty Hospital & Trauma Centre",
        "category": "hospitals",
        "category_label": "Hospital & 24/7 Trauma",
        "doctor_name": "Dr. Pradeep R. Joshi (Chief of Emergency Medicine)",
        "qualifications": "MBBS, MD (Emergency Medicine), FACEP",
        "specialty": "Level-1 Trauma, Multi-Specialty ICU, 24/7 Cardiac Care",
        "is_24_7": True,
        "phone": "+91 11 2658 8500",
        "whatsapp": "919810123456",
        "emergency_hotline": "108 / 011-26588700",
        "address": "Plot 14, Health Boulevard, Institutional Area",
        "landmark": "Opposite Metro Gate 3",
        "rating": 4.9,
        "reviews_count": 1420,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "₹1,000",
        "timings": "Open 24 Hours",
        "distance_offset_km": 0.85,
        "bearing_deg": 35.0,
        "services": ["Level-1 Trauma", "24/7 Emergency", "Cath Lab", "Blood Bank", "Ventilators"]
    },
    {
        "id": "hosp_02",
        "name": "Metro Lifeline Super-Specialty Hospital",
        "category": "hospitals",
        "category_label": "Hospital & 24/7 Trauma",
        "doctor_name": "Dr. S. K. Narang (Medical Superintendent)",
        "qualifications": "MBBS, MS, MCh (Cardiothoracic Surgery)",
        "specialty": "Cardiology, Critical Care, Dialysis, Stroke Unit",
        "is_24_7": True,
        "phone": "+91 11 4155 7700",
        "whatsapp": "919810234567",
        "emergency_hotline": "102 / 011-41557799",
        "address": "Ring Road Sector 7, Medical Enclave",
        "landmark": "Near Central Flyover",
        "rating": 4.7,
        "reviews_count": 980,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "₹1,200",
        "timings": "Open 24 Hours",
        "distance_offset_km": 2.10,
        "bearing_deg": 120.0,
        "services": ["Emergency ICU", "Primary PCI", "CT / MRI 24/7", "Trauma Care"]
    },
    {
        "id": "hosp_03",
        "name": "St. Jude Memorial Charitable Hospital",
        "category": "hospitals",
        "category_label": "Hospital & 24/7 Trauma",
        "doctor_name": "Dr. Mary Thomas (Director of Clinical Services)",
        "qualifications": "MBBS, MD (General Medicine)",
        "specialty": "General Medicine, Acute Care, Neonatal ICU, Maternity",
        "is_24_7": True,
        "phone": "+91 11 2390 1200",
        "whatsapp": "919810345678",
        "emergency_hotline": "011-23901299",
        "address": "88 Mission Road, Civil Lines",
        "landmark": "Near St. Jude Church",
        "rating": 4.6,
        "reviews_count": 650,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "₹300",
        "timings": "Open 24 Hours",
        "distance_offset_km": 3.40,
        "bearing_deg": 285.0,
        "services": ["Subsidized Care", "Emergency Triage", "General Surgery", "Pharmacy"]
    },
    {
        "id": "hosp_04",
        "name": "Premier Care Emergency & Trauma Pavilion",
        "category": "hospitals",
        "category_label": "Hospital & 24/7 Trauma",
        "doctor_name": "Dr. Amitav Sen (Head of Critical Care)",
        "qualifications": "MBBS, MD, EDIC (Critical Care)",
        "specialty": "Severe Trauma, Burn Unit, Organ Transplant, Cardiac Resuscitation",
        "is_24_7": True,
        "phone": "+91 11 4980 9000",
        "whatsapp": "919810456789",
        "emergency_hotline": "112 / 011-49809999",
        "address": "Tower C, Cyber Health City",
        "landmark": "Next to Express Highway Toll",
        "rating": 4.9,
        "reviews_count": 1820,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "₹1,500",
        "timings": "Open 24 Hours",
        "distance_offset_km": 4.80,
        "bearing_deg": 75.0,
        "services": ["Air Ambulance", "ECMO Support", "Hyperbaric Oxygen", "Cath Lab"]
    },
    {
        "id": "hosp_05",
        "name": "City Guild Community Hospital",
        "category": "hospitals",
        "category_label": "Hospital & 24/7 Trauma",
        "doctor_name": "Dr. R. K. Saxena (CMO)",
        "qualifications": "MBBS, DNB (Emergency)",
        "specialty": "Primary Emergency, Minor Surgeries, Orthopedic Care",
        "is_24_7": True,
        "phone": "+91 11 2788 3344",
        "whatsapp": "919810567890",
        "emergency_hotline": "011-27883399",
        "address": "45 Market Square, South Extension",
        "landmark": "Near Main Post Office",
        "rating": 4.5,
        "reviews_count": 510,
        "ambulance_available": True,
        "icu_available": False,
        "consultation_fee": "₹500",
        "timings": "Open 24 Hours",
        "distance_offset_km": 1.70,
        "bearing_deg": 210.0,
        "services": ["Emergency Ward", "Digital X-Ray", "Pathology Lab", "Observation Daycare"]
    },

    # ── Category 2: Cardiologists & Heart Specialists ─────────────────────────
    {
        "id": "cardio_01",
        "name": "Advanced Heart & Vascular Clinic — Dr. Vikram Malhotra",
        "category": "cardiologists",
        "category_label": "Cardiology Specialist",
        "doctor_name": "Dr. Vikram Malhotra, MD, DM, FACC",
        "qualifications": "Senior Consultant Interventional Cardiologist",
        "specialty": "Arrhythmia Diagnosis, Angioplasty, Holter & 12-Lead ECG Analysis",
        "is_24_7": False,
        "phone": "+91 98180 11223",
        "whatsapp": "919818011223",
        "emergency_hotline": "+91 98180 11224",
        "address": "Suite 204, Heart Institute Plaza, Ring Road",
        "landmark": "Opposite Apex Hospital",
        "rating": 5.0,
        "reviews_count": 680,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹1,200",
        "timings": "09:00 AM – 07:30 PM (Mon–Sat)",
        "distance_offset_km": 0.95,
        "bearing_deg": 50.0,
        "services": ["Echocardiography (Echo)", "Holter Monitoring", "TMT Stress Test", "Pacemaker Clinic"]
    },
    {
        "id": "cardio_02",
        "name": "Rhythm & Pacing Cardiac Care — Dr. Ananya Roy",
        "category": "cardiologists",
        "category_label": "Cardiology Specialist",
        "doctor_name": "Dr. Ananya Roy, MBBS, MD, Post-Doc Electrophysiology",
        "qualifications": "Cardiac Electrophysiologist & Arrhythmia Specialist",
        "specialty": "Atrial Fibrillation, PVC Ablation, Syncope Evaluation, Pacemaker Implants",
        "is_24_7": False,
        "phone": "+91 98711 44556",
        "whatsapp": "919871144556",
        "emergency_hotline": "+91 98711 44557",
        "address": "3rd Floor, Cardioplus Suites, Defense Colony",
        "landmark": "Above MedPlus Chemists",
        "rating": 4.9,
        "reviews_count": 420,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹1,500",
        "timings": "10:00 AM – 06:00 PM (Mon–Sat)",
        "distance_offset_km": 1.85,
        "bearing_deg": 160.0,
        "services": ["AFib Specialist", "EPS & RF Ablation", "24h Holter", "Heart Rhythm Telemetry"]
    },
    {
        "id": "cardio_03",
        "name": "Heart Health Foundation & Diagnostic Centre",
        "category": "cardiologists",
        "category_label": "Cardiology Specialist",
        "doctor_name": "Dr. H. P. Sharma & Associates",
        "qualifications": "Senior Panel of Cardiologists & Vascular Surgeons",
        "specialty": "Preventive Cardiology, Lipidology, Hypertension & Heart Failure",
        "is_24_7": False,
        "phone": "+91 11 2626 5500",
        "whatsapp": "919810889900",
        "emergency_hotline": "+91 11 2626 5599",
        "address": "12 Community Centre, Green Park",
        "landmark": "Near Green Park Metro Exit 2",
        "rating": 4.8,
        "reviews_count": 590,
        "ambulance_available": True,
        "icu_available": False,
        "consultation_fee": "₹1,000",
        "timings": "08:30 AM – 08:00 PM (Daily)",
        "distance_offset_km": 2.65,
        "bearing_deg": 225.0,
        "services": ["Color Doppler", "Carotid Ultrasound", "Cardio Risk Profiling", "Dietary Counseling"]
    },
    {
        "id": "cardio_04",
        "name": "CardioVascular Wellness Clinic — Dr. S. Ramanathan",
        "category": "cardiologists",
        "category_label": "Cardiology Specialist",
        "doctor_name": "Dr. S. Ramanathan, MD (Med), DM (Cardio), FSCAI",
        "qualifications": "Consultant Cardiologist & Heart Failure Specialist",
        "specialty": "CAD Management, Non-invasive Cardiac Diagnostics, Post-CABG Care",
        "is_24_7": False,
        "phone": "+91 98112 33445",
        "whatsapp": "919811233445",
        "emergency_hotline": "+91 98112 33446",
        "address": "C-15, First Floor, Hauz Khas Enclave",
        "landmark": "Opposite Deer Park Gate",
        "rating": 4.9,
        "reviews_count": 310,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹1,400",
        "timings": "11:00 AM – 07:00 PM (Tue–Sun)",
        "distance_offset_km": 3.80,
        "bearing_deg": 310.0,
        "services": ["Stress Echo", "Continuous ECG Monitoring", "Cardiac Rehabilitation"]
    },
    {
        "id": "cardio_05",
        "name": "City Heart & Chest Polyclinic",
        "category": "cardiologists",
        "category_label": "Cardiology Specialist",
        "doctor_name": "Dr. Rajiv Chopra, MBBS, MD, FCCP",
        "qualifications": "Cardio-Pulmonary Physician",
        "specialty": "Coronary Artery Disease, Asthma, COPD & Sleep Apnea",
        "is_24_7": False,
        "phone": "+91 11 2921 4477",
        "whatsapp": "919811556677",
        "emergency_hotline": "+91 11 2921 4488",
        "address": "48 Ring Road, Lajpat Nagar III",
        "landmark": "Near National Heart Institute",
        "rating": 4.7,
        "reviews_count": 275,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹900",
        "timings": "09:30 AM – 06:30 PM (Mon–Sat)",
        "distance_offset_km": 4.95,
        "bearing_deg": 95.0,
        "services": ["Spirometry", "Digital ECG", "Cardiac Biomarker Testing", "Chest X-Ray"]
    },

    # ── Category 3: Doctors & Primary Care Clinics ────────────────────────────
    {
        "id": "doc_01",
        "name": "Dr. Sneha Kulkarni Family Practice & Wellness",
        "category": "doctors",
        "category_label": "Doctor & Clinic",
        "doctor_name": "Dr. Sneha Kulkarni, MBBS, DNB (Family Medicine)",
        "qualifications": "Family Physician & Primary Care Consultant",
        "specialty": "General Medicine, Diabetes Care, Hypertension, Preventative Health",
        "is_24_7": False,
        "phone": "+91 98105 11990",
        "whatsapp": "919810511990",
        "emergency_hotline": "+91 98105 11991",
        "address": "Shop 4, Ground Floor, DDA Commercial Complex",
        "landmark": "Near Mother Dairy Booth",
        "rating": 4.9,
        "reviews_count": 390,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹600",
        "timings": "08:30 AM – 01:00 PM, 05:00 PM – 08:30 PM",
        "distance_offset_km": 0.55,
        "bearing_deg": 190.0,
        "services": ["Family Care", "Vaccinations", "Blood Glucose Testing", "Routine ECG", "Health Checkups"]
    },
    {
        "id": "doc_02",
        "name": "Dr. Rajesh Varma Diagnostic & Wellness Centre",
        "category": "doctors",
        "category_label": "Doctor & Clinic",
        "doctor_name": "Dr. Rajesh Varma, MBBS, MD (Medicine)",
        "qualifications": "Senior Consultant Physician & Diabetologist",
        "specialty": "Adult Internal Medicine, Geriatric Care, Lifestyle Diseases",
        "is_24_7": False,
        "phone": "+91 11 2618 3322",
        "whatsapp": "919810622334",
        "emergency_hotline": "+91 11 2618 3333",
        "address": "B-22, Ground Floor, Safdarjung Enclave",
        "landmark": "Near Kamal Cinema",
        "rating": 4.8,
        "reviews_count": 510,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹800",
        "timings": "10:00 AM – 08:00 PM (Mon–Sat)",
        "distance_offset_km": 1.45,
        "bearing_deg": 260.0,
        "services": ["In-House Pathology", "HbA1c Quick Testing", "ECG", "Nebulization"]
    },
    {
        "id": "doc_03",
        "name": "Pulse Point Polyclinic & Minor Procedures",
        "category": "doctors",
        "category_label": "Doctor & Clinic",
        "doctor_name": "Dr. Meera Nambiar & Associates",
        "qualifications": "Multi-Specialty Clinical Panel",
        "specialty": "Pediatrics, Gynecology, ENT, Orthopedic Consultations",
        "is_24_7": False,
        "phone": "+91 11 4160 8822",
        "whatsapp": "919810733445",
        "emergency_hotline": "+91 11 4160 8833",
        "address": "SCO 18, Commercial Belt, Malviya Nagar",
        "landmark": "Behind City Market",
        "rating": 4.6,
        "reviews_count": 340,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹700",
        "timings": "09:00 AM – 09:00 PM (Daily)",
        "distance_offset_km": 2.40,
        "bearing_deg": 140.0,
        "services": ["Minor Wound Dressing", "IV Fluid Support", "Multi-Doctor Panel", "Lab Samples"]
    },
    {
        "id": "doc_04",
        "name": "City Central Family Practice & Daycare",
        "category": "doctors",
        "category_label": "Doctor & Clinic",
        "doctor_name": "Dr. Tarun Grover, MBBS, MD (Pediatrics)",
        "qualifications": "Pediatrician & Adolescent Health Specialist",
        "specialty": "Child Healthcare, Immunization, Infant Growth Monitoring",
        "is_24_7": False,
        "phone": "+91 98114 77889",
        "whatsapp": "919811477889",
        "emergency_hotline": "+91 98114 77890",
        "address": "Flat 2A, Parkview Apartments, Saket",
        "landmark": "Opposite PVR Anupam",
        "rating": 4.9,
        "reviews_count": 480,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹800",
        "timings": "09:30 AM – 01:30 PM, 04:30 PM – 08:00 PM",
        "distance_offset_km": 3.75,
        "bearing_deg": 180.0,
        "services": ["Vaccination Depot", "Emergency Pediatric Triage", "Child Development Assessment"]
    },
    {
        "id": "doc_05",
        "name": "Dr. Neha Bhasin Skin & General Wellness Clinic",
        "category": "doctors",
        "category_label": "Doctor & Clinic",
        "doctor_name": "Dr. Neha Bhasin, MBBS, MD (Dermatology)",
        "qualifications": "Consultant Dermatologist & General Physician",
        "specialty": "Dermatology, Allergy Testing, Lifestyle Wellness",
        "is_24_7": False,
        "phone": "+91 11 2652 9900",
        "whatsapp": "919811688990",
        "emergency_hotline": "+91 11 2652 9911",
        "address": "14 Community Centre, Yusuf Sarai",
        "landmark": "Near AIIMS Flyover",
        "rating": 4.7,
        "reviews_count": 290,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "₹900",
        "timings": "10:30 AM – 07:00 PM (Mon–Fri)",
        "distance_offset_km": 1.20,
        "bearing_deg": 330.0,
        "services": ["Skin Biopsy", "Allergy Testing", "Minor Dermatosurgery"]
    },

    # ── Category 4: 24/7 Pharmacies & Medical Stores ──────────────────────────
    {
        "id": "pharm_01",
        "name": "Apollo 24x7 Medico & Emergency Chemist",
        "category": "pharmacies",
        "category_label": "24/7 Pharmacy",
        "doctor_name": "Registered Pharmacist on Duty 24/7",
        "qualifications": "B.Pharm, Certified Cold Chain Manager",
        "specialty": "Emergency Cardiac Medicines, Insulin, Oxygen Cans, Surgical Consumables",
        "is_24_7": True,
        "phone": "+91 11 2651 1122",
        "whatsapp": "919810911223",
        "emergency_hotline": "1860-500-0101",
        "address": "Shop 1-2, Apex Hospital Gate, Institutional Area",
        "landmark": "Right next to Emergency Entrance",
        "rating": 4.8,
        "reviews_count": 890,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "Free Delivery (Within 3 km)",
        "timings": "Open 24 Hours",
        "distance_offset_km": 0.40,
        "bearing_deg": 15.0,
        "services": ["Home Delivery", "Emergency Oxygen", "Cardiac Drugs", "Cold Storage", "Wheelchairs"]
    },
    {
        "id": "pharm_02",
        "name": "MedPlus 24/7 Super Pharmacy & Cold Chain Depot",
        "category": "pharmacies",
        "category_label": "24/7 Pharmacy",
        "doctor_name": "Licensed Pharmacist On-Call",
        "qualifications": "M.Pharm, Hospital Pharmacist",
        "specialty": "All Prescription Drugs, Diagnostic Kits, Nebulizers, BP Monitors",
        "is_24_7": True,
        "phone": "+91 11 4100 4455",
        "whatsapp": "919810922334",
        "emergency_hotline": "011-41004499",
        "address": "19 Main Market, Green Park Extension",
        "landmark": "Beside SBI ATM",
        "rating": 4.7,
        "reviews_count": 640,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "Free Delivery",
        "timings": "Open 24 Hours",
        "distance_offset_km": 1.60,
        "bearing_deg": 105.0,
        "services": ["24/7 Delivery", "Surgical Goods", "Vaccines", "First Aid Kits"]
    },
    {
        "id": "pharm_03",
        "name": "Wellness Forever 24/7 Day & Night Chemist",
        "category": "pharmacies",
        "category_label": "24/7 Pharmacy",
        "doctor_name": "Senior Clinical Pharmacist",
        "qualifications": "Pharm.D",
        "specialty": "Emergency Injections, ICU Consumables, Life Saving Formulations",
        "is_24_7": True,
        "phone": "+91 11 4955 8899",
        "whatsapp": "919810933445",
        "emergency_hotline": "1800-102-4247",
        "address": "Plot 8, South Ring Arcade, Greater Kailash 1",
        "landmark": "Near M-Block Market Entry",
        "rating": 4.9,
        "reviews_count": 1120,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "Free Delivery (30 min)",
        "timings": "Open 24 Hours",
        "distance_offset_km": 3.10,
        "bearing_deg": 240.0,
        "services": ["30-min Delivery", "Digital Invoicing", "Refrigerated Medicines", "Baby Care"]
    },
    {
        "id": "pharm_04",
        "name": "City Lifeline Chemist & Surgical Depot",
        "category": "pharmacies",
        "category_label": "24/7 Pharmacy",
        "doctor_name": "Dip. Pharm",
        "qualifications": "Registered Chemist & Druggist",
        "specialty": "General Allopathic Medicines, Pain Relief, Orthopedic Braces",
        "is_24_7": True,
        "phone": "+91 11 2685 4411",
        "whatsapp": "919810944556",
        "emergency_hotline": "+91 11 2685 4422",
        "address": "Shop 12, Hauz Khas Village Road",
        "landmark": "Near Sri Aurobindo Marg Crossing",
        "rating": 4.5,
        "reviews_count": 310,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "Nominal Delivery",
        "timings": "Open 24 Hours",
        "distance_offset_km": 2.20,
        "bearing_deg": 295.0,
        "services": ["Oxygen Cylinders On Rent", "Adult Diapers", "Nebulizer Kits"]
    },
    {
        "id": "pharm_05",
        "name": "HealthGuard 24/7 Discount Medical Store",
        "category": "pharmacies",
        "category_label": "24/7 Pharmacy",
        "doctor_name": "B.Pharm Staff",
        "qualifications": "State Pharmacy Council Registered",
        "specialty": "Generic & Branded Medicines, Nutritional Supplements",
        "is_24_7": True,
        "phone": "+91 11 2696 7788",
        "whatsapp": "919810955667",
        "emergency_hotline": "+91 11 2696 7799",
        "address": "UG-4, Vardhman Complex, Malviya Nagar",
        "landmark": "Corner Building",
        "rating": 4.6,
        "reviews_count": 480,
        "ambulance_available": False,
        "icu_available": False,
        "consultation_fee": "20% Discount on Rx",
        "timings": "Open 24 Hours",
        "distance_offset_km": 2.90,
        "bearing_deg": 165.0,
        "services": ["20% Flat Discount", "Emergency Antibiotics", "Blood Pressure Check"]
    },

    # ── Category 5: Ambulance Services & Emergency Response Hubs ──────────────
    {
        "id": "amb_01",
        "name": "City Red Cross Emergency Ambulance Dispatch Post",
        "category": "ambulance",
        "category_label": "Ambulance Dispatch Hub",
        "doctor_name": "Paramedic Unit Lead: Capt. Sunil Roy",
        "qualifications": "Advanced Cardiac Life Support (ACLS) Certified Paramedics",
        "specialty": "ACLS Cardiac Ambulance, ICU on Wheels, Ventilator Support, Defibrillator",
        "is_24_7": True,
        "phone": "+91 11 2686 2200",
        "whatsapp": "919810966778",
        "emergency_hotline": "108 / 112 (Priority Toll Free)",
        "address": "Station 4, Red Cross Post, Ring Road",
        "landmark": "Next to Fire Station",
        "rating": 5.0,
        "reviews_count": 780,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "Free for Emergencies",
        "timings": "Open 24 Hours (Immediate Dispatch)",
        "distance_offset_km": 0.60,
        "bearing_deg": 270.0,
        "services": ["ACLS / BLS Fleet", "Defibrillator Onboard", "Trained Paramedic Team", "GPS Tracking"]
    },
    {
        "id": "amb_02",
        "name": "Lifesaver Critical Care Ambulance Network",
        "category": "ambulance",
        "category_label": "Ambulance Dispatch Hub",
        "doctor_name": "Dr. Vikas Bahl (Emergency Medical Director)",
        "qualifications": "MD, Fellowship in Pre-Hospital Care",
        "specialty": "Inter-Hospital Patient Transfer, Neonatal Transport Incubator, Cardiac ICU",
        "is_24_7": True,
        "phone": "+91 11 4050 6070",
        "whatsapp": "919810977889",
        "emergency_hotline": "102 / 011-40506070",
        "address": "Bay 2, Metro Lifeline Complex, Sector 7",
        "landmark": "Near Metro Hospital Rear Gate",
        "rating": 4.9,
        "reviews_count": 520,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "Standard Transport Tariff",
        "timings": "Open 24 Hours",
        "distance_offset_km": 2.20,
        "bearing_deg": 130.0,
        "services": ["Ventilator Transport", "Syringe Pumps", "Telemetry to Base Hospital", "Oxygen Fleet"]
    },
    {
        "id": "amb_03",
        "name": "National Emergency 108 Central Ambulance Bay",
        "category": "ambulance",
        "category_label": "Ambulance Dispatch Hub",
        "doctor_name": "Central Emergency Operations Center",
        "qualifications": "Government Certified EMT Fleet",
        "specialty": "Accident & Trauma Response, Medical Emergencies, Rapid First Aid",
        "is_24_7": True,
        "phone": "108",
        "whatsapp": "919810988990",
        "emergency_hotline": "108 (Toll Free National Hotline)",
        "address": "Government Medical Depot, AIIMS Flyover Junction",
        "landmark": "Under Metro Line Pillar 140",
        "rating": 4.8,
        "reviews_count": 2100,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "Free Emergency Service",
        "timings": "Open 24 Hours (Average Response: 8-12 min)",
        "distance_offset_km": 1.10,
        "bearing_deg": 350.0,
        "services": ["Free Govt Service", "Emergency Resuscitation", "Immediate Hospital Transit"]
    },
    {
        "id": "amb_04",
        "name": "Rapid Response Cardiac Ambulance Service",
        "category": "ambulance",
        "category_label": "Ambulance Dispatch Hub",
        "doctor_name": "Cardiac Emergency Care Team",
        "qualifications": "Cardiology Trained Nurses & EMTs",
        "specialty": "Chest Pain Emergency, Acute STEMI Transport, Pre-Hospital Thrombolysis",
        "is_24_7": True,
        "phone": "+91 98118 99001",
        "whatsapp": "919811899001",
        "emergency_hotline": "011-26588700",
        "address": "Dedicated Parking Bay, Apex Hospital",
        "landmark": "Institutional Area Gate 1",
        "rating": 4.9,
        "reviews_count": 430,
        "ambulance_available": True,
        "icu_available": True,
        "consultation_fee": "Direct Hospital Admission Service",
        "timings": "Open 24 Hours",
        "distance_offset_km": 0.90,
        "bearing_deg": 40.0,
        "services": ["12-Lead Wireless ECG in Transit", "Defibrillator", "Direct to Cath Lab Protocol"]
    },
    {
        "id": "amb_05",
        "name": "St. John Ambulance Brigade District Station",
        "category": "ambulance",
        "category_label": "Ambulance Dispatch Hub",
        "doctor_name": "Volunteer Paramedic Staff",
        "qualifications": "St. John First Responder Certified",
        "specialty": "Basic Life Support, Community Patient Transit, Wheelchair Accessible Vans",
        "is_24_7": True,
        "phone": "+91 11 2371 6441",
        "whatsapp": "919811900112",
        "emergency_hotline": "011-23716441",
        "address": "1 Red Cross Road, Near Central Secretariat",
        "landmark": "Near Parliament Square",
        "rating": 4.7,
        "reviews_count": 310,
        "ambulance_available": True,
        "icu_available": False,
        "consultation_fee": "Charitable Rates",
        "timings": "Open 24 Hours",
        "distance_offset_km": 4.20,
        "bearing_deg": 320.0,
        "services": ["BLS Van", "Wheelchair Ramp", "Oxygen Support", "Elderly Care Transit"]
    }
]


# ── Standard National / Regional Emergency Hotlines ───────────────────────────
EMERGENCY_HOTLINES = [
    {
        "name": "National Medical Ambulance",
        "number": "108",
        "type": "ambulance",
        "description": "24/7 Government Toll-Free Emergency Ambulance & Paramedic Dispatch",
        "color": "#DC2626"
    },
    {
        "name": "National Unified Emergency",
        "number": "112",
        "type": "unified",
        "description": "All-in-One Emergency Services (Ambulance, Police, Disaster Response)",
        "color": "#EF4444"
    },
    {
        "name": "Trauma & Govt Hospital Helpline",
        "number": "102",
        "type": "hospital",
        "description": "Free Maternity & Govt Hospital Patient Transport",
        "color": "#D97706"
    },
    {
        "name": "Cardiac Emergency Hotline (Apex)",
        "number": "+91 11 2658 8700",
        "type": "cardiac",
        "description": "Direct Line to Cath Lab & 24/7 Chest Pain Evaluation Unit",
        "color": "#9333EA"
    },
    {
        "name": "Blood Bank & Plasma Central",
        "number": "104",
        "type": "blood_bank",
        "description": "State Health Information, Blood Bank Inventory & Tele-consultation",
        "color": "#2563EB"
    }
]


# ── API Endpoint: Retrieve Nearby Facilities ──────────────────────────────────
@care_bp.route("/nearby", methods=["GET"])
def get_nearby_facilities():
    """
    GET /api/care/nearby
    Query Parameters:
      - lat: float (User or Edge Gateway latitude)
      - lng: float (User or Edge Gateway longitude)
      - radius: float in km (default: 10.0)
      - category: str ('all', 'hospitals', 'doctors', 'cardiologists', 'pharmacies', 'ambulance')
      - q: str (Search query keyword)
    """
    try:
        center_lat = float(request.args.get("lat", DEFAULT_LAT))
        center_lng = float(request.args.get("lng", DEFAULT_LNG))
    except (ValueError, TypeError):
        center_lat = DEFAULT_LAT
        center_lng = DEFAULT_LNG

    try:
        radius_km = float(request.args.get("radius", 10.0))
    except (ValueError, TypeError):
        radius_km = 10.0

    category_filter = request.args.get("category", "all").strip().lower()
    search_query = request.args.get("q", "").strip().lower()

    results: List[Dict[str, Any]] = []

    for tmpl in FACILITY_TEMPLATES:
        # Check category match
        if category_filter and category_filter != "all" and tmpl["category"] != category_filter:
            continue

        # Compute dynamic coordinates based on offset from the provided center
        dist_offset = tmpl["distance_offset_km"]
        bearing = tmpl["bearing_deg"]
        fac_lat, fac_lng = compute_offset_coordinates(center_lat, center_lng, dist_offset, bearing)

        # Recalculate true haversine distance
        actual_distance = calculate_haversine_distance(center_lat, center_lng, fac_lat, fac_lng)

        # Check radius boundary
        if actual_distance > radius_km:
            continue

        # Check search query match
        if search_query:
            searchable_blob = (
                f"{tmpl['name']} {tmpl['specialty']} {tmpl['doctor_name']} "
                f"{tmpl['address']} {tmpl['category_label']}"
            ).lower()
            if search_query not in searchable_blob:
                continue

        # Calculate approximate drive time (approx. 2.2 min per km + 2 min traffic base)
        drive_time = max(2, int(round(actual_distance * 2.2 + 2)))

        facility_obj = {
            "id": tmpl["id"],
            "name": tmpl["name"],
            "category": tmpl["category"],
            "category_label": tmpl["category_label"],
            "doctor_name": tmpl["doctor_name"],
            "qualifications": tmpl["qualifications"],
            "specialty": tmpl["specialty"],
            "is_24_7": tmpl["is_24_7"],
            "phone": tmpl["phone"],
            "whatsapp": tmpl["whatsapp"],
            "emergency_hotline": tmpl["emergency_hotline"],
            "address": tmpl["address"],
            "landmark": tmpl["landmark"],
            "lat": fac_lat,
            "lng": fac_lng,
            "distance_km": actual_distance,
            "drive_time_min": drive_time,
            "rating": tmpl["rating"],
            "reviews_count": tmpl["reviews_count"],
            "ambulance_available": tmpl["ambulance_available"],
            "icu_available": tmpl["icu_available"],
            "consultation_fee": tmpl["consultation_fee"],
            "timings": tmpl["timings"],
            "services": tmpl["services"]
        }
        results.append(facility_obj)

    # Sort results by ascending distance from device
    results.sort(key=lambda x: x["distance_km"])

    return jsonify({
        "status": "ok",
        "center": {
            "lat": center_lat,
            "lng": center_lng,
            "is_default": (center_lat == DEFAULT_LAT and center_lng == DEFAULT_LNG)
        },
        "radius_km": radius_km,
        "category": category_filter,
        "total_found": len(results),
        "facilities": results
    })


# ── API Endpoint: Retrieve Emergency Hotlines ─────────────────────────────────
@care_bp.route("/emergency-contacts", methods=["GET"])
def get_emergency_contacts():
    """GET /api/care/emergency-contacts: Return standard emergency hotlines."""
    return jsonify({
        "status": "ok",
        "hotlines": EMERGENCY_HOTLINES
    })


# ── API Endpoint: Single Facility Details ─────────────────────────────────────
@care_bp.route("/facility/<facility_id>", methods=["GET"])
def get_facility_detail(facility_id: str):
    """GET /api/care/facility/<facility_id>: Return single facility details."""
    try:
        center_lat = float(request.args.get("lat", DEFAULT_LAT))
        center_lng = float(request.args.get("lng", DEFAULT_LNG))
    except (ValueError, TypeError):
        center_lat = DEFAULT_LAT
        center_lng = DEFAULT_LNG

    for tmpl in FACILITY_TEMPLATES:
        if tmpl["id"] == facility_id:
            fac_lat, fac_lng = compute_offset_coordinates(
                center_lat, center_lng, tmpl["distance_offset_km"], tmpl["bearing_deg"]
            )
            dist = calculate_haversine_distance(center_lat, center_lng, fac_lat, fac_lng)
            facility_obj = dict(tmpl)
            facility_obj["lat"] = fac_lat
            facility_obj["lng"] = fac_lng
            facility_obj["distance_km"] = dist
            facility_obj["drive_time_min"] = max(2, int(round(dist * 2.2 + 2)))
            return jsonify({"status": "ok", "facility": facility_obj})

    return jsonify({"status": "error", "message": "Facility not found"}), 404

