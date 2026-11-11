/**
 * dashboard.js
 * ============
 * Connects to the SSE stream (/stream) and updates the dashboard in real time.
 * Uses Chart.js for visualization.
 */

"use strict";

const $ = id => document.getElementById(id);

// ── Icon Injection ────────────────────────────────────────────────────────────
function injectIcons() {
  ICONS.inject($("header-logo-icon"), "shield");
  ICONS.inject($("icon-bell"), "bell");
  ICONS.inject($("icon-user"), "user");
  ICONS.inject($("icon-share"), "share");
  ICONS.inject($("icon-download"), "download");
  ICONS.inject($("icon-filter"), "filter");

  ICONS.inject($("icon-hr"), "heart");
  ICONS.inject($("icon-bp"), "activity");
  ICONS.inject($("icon-spo2"), "lungs");
  ICONS.inject($("icon-btemp"), "thermometer");
  ICONS.inject($("icon-env"), "droplet");

  ICONS.inject($("icon-settings"), "settings");
  ICONS.inject($("toast-close-icon"), "close");
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt1(v) { return (v !== undefined && v !== null) ? Number(v).toFixed(1) : "—"; }
function fmt0(v) { return (v !== undefined && v !== null) ? Math.round(v) : "—"; }

function flashValue(el) {
  if (!el) return;
  el.classList.remove("flash-update");
  void el.offsetWidth; // trigger reflow
  el.classList.add("flash-update");
}

// ── Chart.js Setup ────────────────────────────────────────────────────────────
let gaugeChart, trendChart;
const trendData = [];
const trendLabels = [];
const MAX_DATA_POINTS = 15;

function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

// Soft-rounded bar track plugin for Trend Chart background rails
const pillTrackPlugin = {
  id: 'pillTrackBg',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data.length || !chartArea) return;
    const trackColor = isDarkTheme() ? "rgba(255, 255, 255, 0.06)" : "#F0EFEA";
    const topY = chartArea.top;
    const height = chartArea.bottom - topY;
    if (height <= 0) return;

    ctx.save();
    ctx.fillStyle = trackColor;
    meta.data.forEach((bar) => {
      const w = bar.width || 16;
      const x = bar.x - w / 2;
      const r = Math.min(6, w / 3);
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(x, topY, w, height, r);
      } else {
        ctx.rect(x, topY, w, height);
      }
      ctx.fill();
    });
    ctx.restore();
  }
};

function initCharts() {
  const isDark = isDarkTheme();
  const emptyTrackColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#EFEFEA";
  const defaultBarColor = isDark ? "rgba(223, 242, 98, 0.48)" : "#D6E856";
  const activeBarColor  = isDark ? "#DFF262" : "#16A34A";
  const gridColor       = isDark ? "rgba(255, 255, 255, 0.06)" : "#F0EFEA";
  const tickColor       = isDark ? "#7D8478" : "#8B9085";

  // Gauge Chart (Doughnut)
  const gaugeCanvas = $("gauge-chart");
  if (!gaugeCanvas) return;
  const gaugeCtx = gaugeCanvas.getContext("2d");
  gaugeChart = new Chart(gaugeCtx, {
    type: 'doughnut',
    data: {
      labels: ['Risk', 'Remaining'],
      datasets: [{
        data: [0, 100],
        backgroundColor: [isDark ? '#4ADE80' : '#16A34A', emptyTrackColor],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
        borderRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '76%',
      plugins: { tooltip: { enabled: false }, legend: { display: false } },
      animation: { animateRotate: true, animateScale: false }
    }
  });

  // Trend Chart (Warm Pastel Rounded Columns)
  const trendCanvas = $("trend-chart");
  if (!trendCanvas) return;
  const trendCtx = trendCanvas.getContext("2d");
  trendChart = new Chart(trendCtx, {
    type: 'bar',
    plugins: [pillTrackPlugin],
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'Heart Rate',
        data: trendData,
        backgroundColor: defaultBarColor,
        hoverBackgroundColor: activeBarColor,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.56,
        categoryPercentage: 0.85
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1B2016',
          padding: 12,
          cornerRadius: 12,
          titleFont: { size: 12, family: 'Plus Jakarta Sans' },
          bodyFont: { size: 14, family: 'Plus Jakarta Sans', weight: 'bold' },
          displayColors: false,
          callbacks: {
            label: (context) => context.raw + ' bpm'
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { display: false }, border: { display: false } },
        y: {
          grid: { color: gridColor, drawBorder: false },
          border: { display: false },
          ticks: { color: tickColor, font: { family: 'Plus Jakarta Sans', size: 11 }, padding: 10 }
        }
      }
    }
  });
}

function updateChartsTheme() {
  if (!gaugeChart || !trendChart) return;
  const isDark = isDarkTheme();
  const emptyTrackColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#EFEFEA";
  const defaultBarColor = isDark ? "rgba(223, 242, 98, 0.48)" : "#D6E856";
  const activeBarColor  = isDark ? "#DFF262" : "#16A34A";
  const gridColor       = isDark ? "rgba(255, 255, 255, 0.06)" : "#F0EFEA";
  const tickColor       = isDark ? "#7D8478" : "#8B9085";

  gaugeChart.data.datasets[0].backgroundColor[1] = emptyTrackColor;
  gaugeChart.update();

  trendChart.options.scales.y.grid.color = gridColor;
  trendChart.options.scales.y.ticks.color = tickColor;
  if (trendData.length > 0) {
    trendChart.data.datasets[0].backgroundColor = trendData.map((_, i) =>
      i === trendData.length - 1 ? activeBarColor : defaultBarColor
    );
  }
  trendChart.update();
}

function updateCharts(latestHr, overall) {
  if (!gaugeChart || !trendChart) return;
  const isDark = isDarkTheme();
  const emptyTrackColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#EFEFEA";
  const defaultBarColor = isDark ? "rgba(223, 242, 98, 0.48)" : "#D6E856";
  const activeBarColor  = isDark ? "#DFF262" : "#16A34A";

  // Update Gauge
  let color = isDark ? '#4ADE80' : '#16A34A'; // Normal
  let percentage = 20;
  if (overall === 'WATCH') { color = '#F59E0B'; percentage = 60; }
  else if (overall === 'HIGH') { color = '#EF4444'; percentage = 95; }

  gaugeChart.data.datasets[0].data = [percentage, 100 - percentage];
  gaugeChart.data.datasets[0].backgroundColor = [color, emptyTrackColor];
  gaugeChart.update();

  // Update Trend Chart
  if (latestHr) {
    const now = new Date();
    trendLabels.push(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    trendData.push(latestHr);
    if (trendData.length > MAX_DATA_POINTS) {
      trendData.shift();
      trendLabels.shift();
    }

    const bgColors = trendData.map((_, i) => i === trendData.length - 1 ? activeBarColor : defaultBarColor);
    trendChart.data.datasets[0].backgroundColor = bgColors;

    trendChart.update();
  }
}

// ── Dashboard update ──────────────────────────────────────────────────────────
let _prevOverall = null;
let _prevValues = {};
let _activeAlerts = [];
let _historyAlerts = [];
let _audioCtx = null;
let _isAudioMuted = localStorage.getItem("jeev_one_audio_muted") === "true";
let _currentNotifTab = "active";

function applyUpdate(data) {
  const latest = data.latest || data.reading || {};
  const risk   = data.risk   || {};

  // ── Vitals
  setMetricValue("val-hr",    fmt0(latest.heart_rate),       "val-hr");
  setMetricValue("val-spo2",  fmt1(latest.spo2),             "val-spo2");
  setMetricValue("val-btemp", fmt1(latest.body_temperature), "val-btemp");
  setMetricValue("val-rtemp", fmt1(latest.room_temperature), "val-rtemp");
  setMetricValue("val-hum",   fmt0(latest.humidity),         "val-hum");

  const bpSysVal = (latest.bp_sys !== undefined && latest.bp_sys !== null && Number(latest.bp_sys) > 0) ? Math.round(Number(latest.bp_sys)) : "—";
  const bpDiaVal = (latest.bp_dia !== undefined && latest.bp_dia !== null && Number(latest.bp_dia) > 0) ? Math.round(Number(latest.bp_dia)) : "—";
  setMetricValue("val-bp-sys", bpSysVal, "val-bp-sys");
  setMetricValue("val-bp-dia", bpDiaVal, "val-bp-dia");

  // ── Baseline sub-labels
  if (window._baseline) {
    const bl = window._baseline;
    if ($("sub-hr")) $("sub-hr").textContent    = `Baseline: ${fmt0(bl.heart_rate)} bpm`;
    if ($("sub-spo2")) $("sub-spo2").textContent  = `Baseline: ${fmt1(bl.spo2)}%`;
    if ($("sub-btemp")) $("sub-btemp").textContent = `Baseline: ${fmt1(bl.body_temperature)}°C`;
    if ($("sub-bp")) {
      const bSys = bl.bp_sys ? fmt0(bl.bp_sys) : "118";
      const bDia = bl.bp_dia ? fmt0(bl.bp_dia) : "76";
      $("sub-bp").textContent = `Baseline: ${bSys}/${bDia} mmHg`;
    }
  }

  const envSub = $("sub-env");
  if (envSub) envSub.textContent = "Ambient Conditions";

  // ── Overall Status (Gauge)
  const overall = risk.overall_status || "NORMAL";
  const statusEl = $("overall-status");
  if (statusEl) {
    statusEl.textContent = overall;
    if (overall === "HIGH") statusEl.style.color = 'var(--risk-high)';
    else if (overall === "WATCH") statusEl.style.color = 'var(--risk-watch)';
    else statusEl.style.color = 'var(--risk-normal)';
  }

  const recEl = $("recommendation");
  if (recEl) {
    recEl.textContent = risk.recommendation || "Monitoring active...";
  }

  const tagEl = $("risk-rec-tag");
  if (tagEl) {
    if (overall === "HIGH") {
      tagEl.textContent = "Critical Priority";
      tagEl.style.background = "var(--risk-high-soft)";
      tagEl.style.color = "var(--risk-high)";
    } else if (overall === "WATCH") {
      tagEl.textContent = "Caution";
      tagEl.style.background = "var(--risk-watch-soft)";
      tagEl.style.color = "var(--risk-watch)";
    } else {
      tagEl.textContent = "Stable";
      tagEl.style.background = "var(--risk-normal-soft)";
      tagEl.style.color = "var(--risk-normal)";
    }
  }

  // ── Charts & ECG Updates
  if (latest.heart_rate !== undefined && latest.heart_rate !== null) {
    updateCharts(latest.heart_rate, overall);
    currentEcgHR = latest.heart_rate;
    updateECGMetrics(latest.heart_rate, overall);
  }

  // ── Auto-update Health Report with every incoming reading
  window._latestReading = latest;
  window._latestRisk = risk;
  scheduleHealthReportUpdate(latest, risk);

  // ── Table Update (Recent Readings Tab)
  const tbody = $("readings-tbody");
  if (tbody && (latest.timestamp_epoch || latest.timestamp)) {
    let ts;
    if (latest.timestamp_epoch) {
      ts = new Date(latest.timestamp_epoch * 1000).toLocaleTimeString();
    } else {
      const parsed = new Date(latest.timestamp);
      ts = isNaN(parsed.getTime()) ? new Date().toLocaleTimeString() : parsed.toLocaleTimeString();
    }
    const row = document.createElement("tr");
    
    let statusClass = 'normal';
    if (overall === 'HIGH') statusClass = 'high';
    else if (overall === 'WATCH') statusClass = 'watch';

    const bpStr = (bpSysVal !== "—" && bpDiaVal !== "—") ? `${bpSysVal}/${bpDiaVal} mmHg` : "—";
    row.innerHTML = `
      <td style="font-family: var(--font-mono); color: var(--text-muted)">${ts}</td>
      <td style="font-weight: 500">${fmt0(latest.heart_rate)} bpm</td>
      <td style="font-weight: 500">${bpStr}</td>
      <td>${fmt1(latest.spo2)}%</td>
      <td>${fmt1(latest.body_temperature)}°C</td>
      <td><span class="status-badge ${statusClass}">${overall}</span></td>
    `;
    tbody.insertBefore(row, tbody.firstChild);
    if (tbody.children.length > 25) tbody.removeChild(tbody.lastChild); // keep up to 25 rows in archive
    
    const counterBadge = $("records-counter-badge");
    if (counterBadge) counterBadge.textContent = `${tbody.children.length} RECENT PACKETS`;
  }

  // ── Alarms & Notifications Handling
  if (Array.isArray(data.alerts)) {
    _activeAlerts = data.alerts;
  }
  if (Array.isArray(data.new_alerts) && data.new_alerts.length > 0) {
    data.new_alerts.forEach(newA => {
      // Prepend to history cache
      if (!_historyAlerts.some(h => h.id === newA.id)) {
        _historyAlerts.unshift(newA);
      }
      // Play distinct audio chime
      playAlarmChime(newA.severity);
      // Send desktop native push notification
      sendDesktopNotification(newA);
      // Trigger on-screen visual toast
      showToast(newA.severity, `${newA.title}: ${newA.message}`);
    });
    if (_historyAlerts.length > 60) _historyAlerts = _historyAlerts.slice(0, 60);
  } else if (overall !== _prevOverall && _prevOverall !== null) {
    showToast(overall, risk.recommendation || "Status changed");
  }
  _prevOverall = overall;

  // Update micro-visual bento meters, card alarm glowing states, and notification drawer
  updateVitalMicroVisuals(latest, overall);
  updateCardAlarms(_activeAlerts);
  renderNotificationList();
}

function updateVitalMicroVisuals(latest, overall) {
  // 1. Heart Rate 20-bar Equalizer Meter (40-150 bpm)
  const meter = $("hr-tick-meter");
  if (meter) {
    const ticks = meter.querySelectorAll(".hr-tick");
    const hr = Number(latest.heart_rate) || 0;
    const filledCount = hr > 0
      ? Math.max(1, Math.min(ticks.length, Math.round(((hr - 40) / 110) * ticks.length)))
      : 0;
    const stateClass = (hr >= 120 || (hr > 0 && hr <= 45) || overall === "HIGH")
      ? "crit"
      : ((hr >= 100 || (hr > 0 && hr <= 55) || overall === "WATCH") ? "warn" : "");
    ticks.forEach((tick, idx) => {
      tick.classList.remove("filled", "warn", "crit");
      if (idx < filledCount) {
        tick.classList.add("filled");
        if (stateClass) tick.classList.add(stateClass);
      }
    });
  }

  // 2. SpO2 Clinical Saturation Range Scale (85%–100%, Optimal band 95–100%)
  const spo2Fill = $("spo2-range-fill");
  const spo2Marker = $("spo2-range-marker");
  if (spo2Fill && spo2Marker) {
    const spo2 = Number(latest.spo2) || 0;
    if (spo2 > 0) {
      const pct = Math.max(0, Math.min(100, ((spo2 - 85) / 15) * 100));
      const pctRounded = pct.toFixed(1);
      spo2Fill.style.width = `${pctRounded}%`;
      spo2Marker.style.left = `clamp(7px, ${pctRounded}%, calc(100% - 7px))`;
      spo2Marker.style.opacity = "1";

      if (spo2 < 90) {
        spo2Fill.style.background = "linear-gradient(90deg, #FCA5A5 0%, #EF4444 100%)";
        spo2Marker.style.borderColor = "#B91C1C";
      } else if (spo2 < 95) {
        spo2Fill.style.background = "linear-gradient(90deg, #FDE68A 0%, #F59E0B 100%)";
        spo2Marker.style.borderColor = "#B45309";
      } else {
        spo2Fill.style.background = "linear-gradient(90deg, rgba(255, 255, 255, 0.82) 0%, #E2F25D 100%)";
        spo2Marker.style.borderColor = "#0E3A52";
      }
    } else {
      spo2Fill.style.width = "0%";
      spo2Marker.style.opacity = "0";
    }
  }

  // 3. Body Temp Warm Honey Progress Track (34.5 C - 40.5 C)
  const tempFill = $("btemp-scale-fill");
  if (tempFill) {
    const temp = Number(latest.body_temperature) || 0;
    if (temp > 0) {
      const ratio = Math.max(0.08, Math.min(1, (temp - 34.5) / 6.0));
      tempFill.style.width = `${Math.round(ratio * 100)}%`;
      if (temp >= 38.5 || temp <= 35.0) {
        tempFill.style.background = "linear-gradient(90deg, #F87171 0%, #DC2626 100%)";
      } else if (temp >= 37.5 || temp <= 35.8) {
        tempFill.style.background = "linear-gradient(90deg, #FBBF24 0%, #D97706 100%)";
      } else {
        tempFill.style.background = "linear-gradient(90deg, #FCD34D 0%, #F59E0B 100%)";
      }
    } else {
      tempFill.style.width = "12%";
    }
  }

  // 4. Blood Pressure Wave Highlight Dot
  const bpDot = $("bp-wave-dot");
  if (bpDot && Number(latest.bp_sys) > 0) {
    const sys = Number(latest.bp_sys);
    const clamped = Math.max(90, Math.min(160, sys));
    const cx = Math.round(55 + ((clamped - 90) / 70) * 110);
    bpDot.setAttribute("cx", String(cx));
  }
}

function setMetricValue(elId, newVal, trackKey) {
  const el = $(elId);
  if (!el) return;
  if (newVal !== _prevValues[trackKey]) {
    el.textContent = newVal;
    flashValue(el);
    _prevValues[trackKey] = newVal;
  }
}

// ── Toast Alert Helper (Unified) ───────────────────────────────────────────────
let _toastTimer = null;

function showToast(titleOrLevel, message = "") {
  const toast   = $("alert-toast");
  const iconEl  = $("toast-icon");
  const titleEl = $("toast-title");
  const msgEl   = $("toast-msg");
  if (!toast) return;

  let level = "normal";
  let title = titleOrLevel;
  let msg   = message;

  if (["NORMAL", "WATCH", "HIGH"].includes(titleOrLevel)) {
    level = titleOrLevel.toLowerCase();
    const titleMap = { NORMAL: "Status Normal", WATCH: "Watch Alert", HIGH: "High Risk Alert" };
    title = titleMap[titleOrLevel] || titleOrLevel;
  } else if (!message) {
    msg = titleOrLevel;
    title = "System Notice";
    level = "normal";
  }

  const iconMap = { normal: "check", watch: "warning", high: "warning" };
  if (iconEl) ICONS.inject(iconEl, iconMap[level] || "shield");
  if (titleEl) titleEl.textContent = title;
  if (msgEl) msgEl.textContent = msg.slice(0, 160) + (msg.length > 160 ? "…" : "");

  toast.className = `alert-toast show toast--${level}`;

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(dismissToast, 6000);
}

function dismissToast() {
  const toast = $("alert-toast");
  if (toast) toast.className = "alert-toast";
  if (_toastTimer) clearTimeout(_toastTimer);
}

// ── Firebase Cloud Firestore Live Real-Time Integration ──────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBgcq-Npao17FYoSTQjyteaJ_B9EWpgYpY",
  authDomain: "spectrona-hackathon.firebaseapp.com",
  projectId: "spectrona-hackathon",
  storageBucket: "spectrona-hackathon.firebasestorage.app",
  messagingSenderId: "165070923940",
  appId: "1:165070923940:web:da007fe1c97540922b5e31",
  measurementId: "G-Z3GN5C69T1"
};

let _firestoreDb = null;
let _firestoreUnsub = null;
let _isFirebaseConnected = false;
let _lastProcessedRecordId = null;

function initFirestoreStream() {
  if (typeof firebase === "undefined") {
    console.warn("[Firebase] SDK not loaded, using fallback SSE/polling.");
    return false;
  }
  try {
    if (!firebase.apps || !firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    _firestoreDb = firebase.firestore();
    console.log("[Firebase] Cloud Firestore initialized for spectrona-hackathon.");
    subscribeToFirestoreReadings();
    return true;
  } catch (err) {
    console.error("[Firebase] Initialization error:", err);
    return false;
  }
}

function subscribeToFirestoreReadings() {
  if (!_firestoreDb) return;
  if (_firestoreUnsub) {
    try { _firestoreUnsub(); } catch(e) {}
    _firestoreUnsub = null;
  }

  const activeDev = (typeof PROFILES !== "undefined" && PROFILES[_activeUserId])
    ? PROFILES[_activeUserId].device_id
    : "patient_01";
  const targetPatient = (activeDev === "patient_02") ? "patient_2" : "patient_1";

  try {
    const collRef = _firestoreDb.collection("patient_readings");
    _firestoreUnsub = collRef
      .orderBy("record_id", "desc")
      .limit(35)
      .onSnapshot((snapshot) => {
        if (!snapshot || snapshot.empty) {
          console.log("[Firebase] Snapshot empty in patient_readings");
          return;
        }

        _isFirebaseConnected = true;

        const rawList = [];
        snapshot.forEach(doc => {
          rawList.push({ id: doc.id, ...doc.data() });
        });

        // Defensive sort: guarantee newest reading first by record_id, timestamp_epoch, or synced_at
        rawList.sort((a, b) => {
          const recA = Number(a.record_id) || Number(a.timestamp_epoch) || (a.synced_at ? Number(a.synced_at) : 0);
          const recB = Number(b.record_id) || Number(b.timestamp_epoch) || (b.synced_at ? Number(b.synced_at) : 0);
          return recB - recA;
        });

        // Filter for active subject if multiple exist, else use latest
        const matching = rawList.filter(r => r.device_id === activeDev || r.patient_id === targetPatient);
        const candidates = matching.length > 0 ? matching : rawList;
        const latestDoc = candidates[0];

        if (latestDoc) {
          handleIncomingFirebaseReading(latestDoc, candidates);
        }
      }, (error) => {
        console.warn("[Firebase] Listener error:", error);
        _isFirebaseConnected = false;
      });
  } catch (err) {
    console.error("[Firebase] Query setup error:", err);
  }
}

function handleIncomingFirebaseReading(doc, candidateList) {
  if (!doc) return;

  const hr    = Number(doc.heart_rate) || 0;
  const spo2  = Number(doc.spo2) || 0;
  const btemp = Number(doc.body_temperature) || 0;
  const rtemp = Number(doc.room_temperature) || 0;
  const hum   = Number(doc.humidity) || 0;
  const sys   = Number(doc.bp_sys) || 0;
  const dia   = Number(doc.bp_dia) || 0;
  const dev   = doc.device_id || "patient_01";
  const patId = doc.patient_id || "patient_1";
  const recId = (doc.record_id !== undefined && doc.record_id !== null) ? doc.record_id : (doc.id || doc.timestamp_epoch || "live");
  const tsEpoch = doc.timestamp_epoch || (doc.synced_at ? Math.floor(doc.synced_at) : Math.floor(Date.now() / 1000));
  const tsIso   = doc.timestamp_iso || new Date(tsEpoch * 1000).toISOString();

  let riskObj = {};
  if (doc.risk && typeof doc.risk === "object") {
    riskObj = {
      overall_status: doc.risk.overall_status || "NORMAL",
      vital_risk: doc.risk.vital_risk || "NORMAL",
      heat_risk: doc.risk.heat_risk || "LOW",
      respiratory_risk: doc.risk.respiratory_risk || "NORMAL",
      recommendation: doc.risk.recommendation || "All monitored indicators within normal range.",
      reasons: doc.risk.reasons || []
    };
  } else {
    const isHigh = (hr > 120 || hr < 50 || (spo2 > 0 && spo2 < 90) || (btemp > 0 && btemp > 38.5));
    const isWatch = (hr > 100 || (spo2 > 0 && spo2 < 94) || (btemp > 0 && btemp > 37.8));
    riskObj = {
      overall_status: isHigh ? "HIGH" : (isWatch ? "WATCH" : "NORMAL"),
      vital_risk: isHigh ? "HIGH" : "NORMAL",
      heat_risk: "LOW",
      respiratory_risk: (spo2 > 0 && spo2 < 94) ? "WATCH" : "NORMAL",
      recommendation: isHigh ? "Immediate evaluation recommended." : (isWatch ? "Elevated vital detected. Continue monitoring." : "All monitored indicators within normal range.")
    };
  }

  const payload = {
    latest: {
      device_id: dev,
      patient_id: patId,
      heart_rate: hr,
      spo2: spo2,
      body_temperature: btemp,
      room_temperature: rtemp,
      humidity: hum,
      bp_sys: sys,
      bp_dia: dia,
      record_id: recId,
      timestamp: tsIso,
      timestamp_epoch: tsEpoch
    },
    risk: riskObj
  };

  const isNew = (_lastProcessedRecordId === null || String(_lastProcessedRecordId) !== String(recId));
  const wasAlreadyInitialized = (_lastProcessedRecordId !== null);
  _lastProcessedRecordId = recId;

  // Render to Vitals Cards, Gauge, and ECG frequency
  applyUpdate(payload);

  // If new reading arrived in real-time, pulse the cards
  if (isNew && wasAlreadyInitialized) {
    flashValue($("val-hr"));
    flashValue($("val-bp-sys"));
    flashValue($("val-bp-dia"));
    flashValue($("val-spo2"));
    flashValue($("val-btemp"));
    flashValue($("val-rtemp"));
    flashValue($("val-hum"));
    showToast("normal", `Live Packet Received (Record #${recId})`);
  }

  // Live Pill & Card Status for Blood Pressure
  const bpTag = $("tag-bp");
  const bpCard = $("card-bp");
  if (sys > 0 && dia > 0) {
    if (sys >= 140 || dia >= 90) {
      if (bpTag) { bpTag.className = "vital-status-pill critical"; bpTag.textContent = "STAGE 2"; }
      if (bpCard) { bpCard.classList.remove("card-alarm-warning"); bpCard.classList.add("card-alarm-critical"); }
    } else if (sys >= 130 || dia >= 85) {
      if (bpTag) { bpTag.className = "vital-status-pill warning"; bpTag.textContent = "ELEVATED"; }
      if (bpCard) { bpCard.classList.remove("card-alarm-critical"); bpCard.classList.add("card-alarm-warning"); }
    } else if (sys < 90 || dia < 60) {
      if (bpTag) { bpTag.className = "vital-status-pill warning"; bpTag.textContent = "LOW BP"; }
      if (bpCard) { bpCard.classList.remove("card-alarm-critical"); bpCard.classList.add("card-alarm-warning"); }
    } else {
      if (bpTag) { bpTag.className = "vital-status-pill normal"; bpTag.textContent = "NORMAL"; }
      if (bpCard) { bpCard.classList.remove("card-alarm-critical", "card-alarm-warning"); }
    }
  } else {
    if (bpTag) { bpTag.className = "vital-status-pill normal"; bpTag.textContent = "STANDBY"; }
    if (bpCard) { bpCard.classList.remove("card-alarm-critical", "card-alarm-warning"); }
  }

  // Populate Readings Table, Trend Chart, and Dynamic Baseline purely from real Firestore docs
  if (Array.isArray(candidateList) && candidateList.length > 0) {
    populateRecentReadingsFromFirebase(candidateList);
    updateTrendChartFromHistory(candidateList);
    updateDynamicBaselineFromFirestore(candidateList);
  }
}

function updateDynamicBaselineFromFirestore(readings) {
  if (!Array.isArray(readings) || readings.length === 0) return;
  const hrs = readings.map(r => Number(r.heart_rate)).filter(v => v > 30 && v < 220);
  const spo2s = readings.map(r => Number(r.spo2)).filter(v => v > 50 && v <= 100);
  const temps = readings.map(r => Number(r.body_temperature)).filter(v => v > 30 && v < 45);
  const syss = readings.map(r => Number(r.bp_sys)).filter(v => v > 40 && v < 260);
  const dias = readings.map(r => Number(r.bp_dia)).filter(v => v > 30 && v < 160);

  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b, 0) / arr.length : null;
  const avgHr = avg(hrs);
  const avgSpo2 = avg(spo2s);
  const avgTemp = avg(temps);
  const avgSys = avg(syss);
  const avgDia = avg(dias);

  window._baseline = {
    heart_rate: avgHr || 72,
    spo2: avgSpo2 || 98.0,
    body_temperature: avgTemp || 36.8,
    bp_sys: avgSys || 118,
    bp_dia: avgDia || 76
  };

  const subHr = $("sub-hr");
  const subSpo2 = $("sub-spo2");
  const subBtemp = $("sub-btemp");
  const subBp = $("sub-bp");

  if (subHr && avgHr) subHr.textContent = `Baseline: ${fmt0(avgHr)} bpm`;
  if (subSpo2 && avgSpo2) subSpo2.textContent = `Baseline: ${fmt1(avgSpo2)}%`;
  if (subBtemp && avgTemp) subBtemp.textContent = `Baseline: ${fmt1(avgTemp)}°C`;
  if (subBp && avgSys && avgDia) subBp.textContent = `Baseline: ${fmt0(avgSys)}/${fmt0(avgDia)} mmHg`;
}

function updateTrendChartFromHistory(readings) {
  if (!trendChart || !Array.isArray(readings) || readings.length === 0) return;
  
  // Readings are newest first; reverse to display chronologically (oldest to newest)
  const chronological = [...readings].reverse().slice(-MAX_DATA_POINTS);
  trendData.length = 0;
  trendLabels.length = 0;

  for (const rec of chronological) {
    const hr = Number(rec.heart_rate);
    if (!isNaN(hr) && hr > 0) {
      let label = "";
      if (rec.timestamp_iso) {
        try {
          const d = new Date(rec.timestamp_iso);
          label = isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch(e) {}
      } else if (rec.timestamp_epoch) {
        label = new Date(rec.timestamp_epoch * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      trendData.push(hr);
      trendLabels.push(label);
    }
  }

  const isDark = isDarkTheme();
  const defaultBarColor = isDark ? "rgba(223, 242, 98, 0.48)" : "#D6E856";
  const activeBarColor  = isDark ? "#DFF262" : "#16A34A";
  const bgColors = trendData.map((_, i) => i === trendData.length - 1 ? activeBarColor : defaultBarColor);
  trendChart.data.datasets[0].backgroundColor = bgColors;
  trendChart.update();
}

function populateRecentReadingsFromFirebase(readingsList) {
  const tbody = $("readings-tbody");
  if (!tbody || !Array.isArray(readingsList)) return;

  tbody.innerHTML = "";
  const recent = readingsList.slice(0, 25);
  for (const rec of recent) {
    const hr = Number(rec.heart_rate) || 0;
    const spo2 = Number(rec.spo2) || 0;
    const btemp = Number(rec.body_temperature) || 0;
    const sys = Number(rec.bp_sys) || 0;
    const dia = Number(rec.bp_dia) || 0;
    const bpStr = (sys > 0 && dia > 0) ? `${fmt0(sys)}/${fmt0(dia)} mmHg` : "—";
    const overall = (rec.risk && rec.risk.overall_status) ? rec.risk.overall_status : "NORMAL";

    let tsStr = "—";
    if (rec.timestamp_iso) {
      try {
        const d = new Date(rec.timestamp_iso);
        tsStr = isNaN(d.getTime()) ? rec.timestamp_iso : d.toLocaleTimeString();
      } catch (e) {
        tsStr = rec.timestamp_iso;
      }
    } else if (rec.timestamp_epoch) {
      tsStr = new Date(rec.timestamp_epoch * 1000).toLocaleTimeString();
    }

    let statusClass = "normal";
    if (overall === "HIGH") statusClass = "high";
    else if (overall === "WATCH") statusClass = "watch";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td style="font-family: var(--font-mono); color: var(--text-muted)">${tsStr}</td>
      <td style="font-weight: 500">${fmt0(hr)} bpm</td>
      <td style="font-weight: 500">${bpStr}</td>
      <td>${fmt1(spo2)}%</td>
      <td>${fmt1(btemp)}°C</td>
      <td><span class="status-badge ${statusClass}">${overall}</span></td>
    `;
    tbody.appendChild(row);
  }

  const counterBadge = $("records-counter-badge");
  if (counterBadge) counterBadge.textContent = `${tbody.children.length} RECENT PACKETS`;
}

// ── SSE / Polling Fallback (Only used if Firebase SDK is unavailable) ──────────
function startSSE() {
  if (_isFirebaseConnected) return; // Pure Firebase Mode: No SSE simulation
  const es = new EventSource("/stream");
  es.onopen = () => {};
  es.onmessage = ev => {
    try {
      if (_isFirebaseConnected) return;
      const data = JSON.parse(ev.data);
      if (data.event_type === "heartbeat") return;
      if (data.reading || data.latest) {
        const item = data.latest || data.reading;
        const currentDev = (typeof PROFILES !== "undefined" && PROFILES[_activeUserId]) ? PROFILES[_activeUserId].device_id : "patient_01";
        if (!item.device_id || item.device_id === currentDev) {
          applyUpdate(data);
        }
      }
    } catch (e) { console.warn("SSE parse error", e); }
  };
  es.onerror = () => {
    es.close();
  };
}

function startPolling() {
  if (_isFirebaseConnected) return; // Pure Firebase Mode: No local polling
  fetchLatest();
  setInterval(fetchLatest, 5000);
}

function fetchLatest(deviceId) {
  if (_isFirebaseConnected) return; // Pure Firebase Mode: Skip REST polling
  const dev = deviceId || (typeof PROFILES !== "undefined" && PROFILES[_activeUserId] ? PROFILES[_activeUserId].device_id : "patient_01");
  fetch(`/api/latest?device_id=${encodeURIComponent(dev)}`)
    .then(r => r.json())
    .then(data => {
      if (_isFirebaseConnected) return;
      if (data.latest || data.reading) applyUpdate(data);
    })
    .catch(() => {});
}

function fetchBaseline() {
  if (_isFirebaseConnected) return; // Pure Firebase Mode: Skip mock baseline
  fetch("/api/baseline")
    .then(r => r.json())
    .then(bl => { window._baseline = bl; })
    .catch(() => {});
}

function fetchHistory(deviceId) {
  if (_isFirebaseConnected) return; // Pure Firebase Mode: Skip local history
  const dev = deviceId || (typeof PROFILES !== "undefined" && PROFILES[_activeUserId] ? PROFILES[_activeUserId].device_id : "patient_01");
  fetch(`/api/history?device_id=${encodeURIComponent(dev)}`)
    .then(r => r.json())
    .then(records => {
      if (_isFirebaseConnected) return;
      const dataList = Array.isArray(records) ? records : (records.readings || []);
      if (!Array.isArray(dataList) || dataList.length === 0) return;
      const tbody = $("readings-tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      for (const rec of dataList.slice(0, 25)) {
        if (!rec.timestamp) continue;
        const parsed = new Date(rec.timestamp);
        const ts = isNaN(parsed.getTime()) ? rec.timestamp : parsed.toLocaleTimeString();
        const sys = Number(rec.bp_sys) || 0;
        const dia = Number(rec.bp_dia) || 0;
        const bpStr = (sys > 0 && dia > 0) ? `${fmt0(sys)}/${fmt0(dia)} mmHg` : "—";
        const row = document.createElement("tr");
        row.innerHTML = `
          <td style="font-family: var(--font-mono); color: var(--text-muted)">${ts}</td>
          <td style="font-weight: 500">${fmt0(rec.heart_rate)} bpm</td>
          <td style="font-weight: 500">${bpStr}</td>
          <td>${fmt1(rec.spo2)}%</td>
          <td>${fmt1(rec.body_temperature)}°C</td>
          <td><span class="status-badge normal">NORMAL</span></td>
        `;
        tbody.appendChild(row);
      }
    })
    .catch(() => {});
}

// ── Web Audio Chime Alarm Engine ──────────────────────────────────────────────
function getAudioContext() {
  if (!_audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) _audioCtx = new AudioContextClass();
  }
  if (_audioCtx && _audioCtx.state === "suspended") {
    _audioCtx.resume();
  }
  return _audioCtx;
}

function playAlarmChime(severity) {
  if (_isAudioMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const sev = (severity || "").toUpperCase();

    if (sev === "CRITICAL" || sev === "HIGH") {
      // 2-tone urgent clinical alarm sequence (A5 -> E5, repeated)
      const playTone = (freq, start, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration);
      };
      playTone(880, now, 0.12);
      playTone(659.25, now + 0.16, 0.16);
      playTone(880, now + 0.36, 0.12);
      playTone(659.25, now + 0.52, 0.20);
    } else if (sev === "WARNING" || sev === "WATCH") {
      // Dual-frequency cautionary chime (D5 -> G5)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.14);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.30);
    } else if (sev === "NORMAL") {
      // Soft single resolved harmonic tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  } catch (e) {
    console.warn("Audio chime playback error:", e);
  }
}

function updateSoundUI() {
  const iconState = $("icon-sound-state");
  const settingIcon = $("setting-sound-icon");
  const settingLabel = $("setting-sound-label");

  if (_isAudioMuted) {
    if (iconState) iconState.textContent = "🔇";
    if (settingIcon) settingIcon.textContent = "🔇";
    if (settingLabel) settingLabel.textContent = "Audio Alarms: OFF (Muted)";
  } else {
    if (iconState) iconState.textContent = "🔊";
    if (settingIcon) settingIcon.textContent = "🔊";
    if (settingLabel) settingLabel.textContent = "Audio Alarms: ON (Active)";
  }
}

function toggleAudioMute() {
  _isAudioMuted = !_isAudioMuted;
  localStorage.setItem("jeev_one_audio_muted", _isAudioMuted ? "true" : "false");
  updateSoundUI();
  if (!_isAudioMuted) {
    getAudioContext();
    playAlarmChime("NORMAL");
    showToast("Audio alarms unmuted", "Audio Settings");
  } else {
    showToast("Audio alarms muted", "Audio Settings");
  }
}

// ── Web Desktop Notifications Engine ──────────────────────────────────────────
function initDesktopPush() {
  const btn = $("btn-toggle-push-settings");
  const label = $("setting-push-label");
  if (!btn || !("Notification" in window)) return;

  function updatePushUI() {
    if (Notification.permission === "granted") {
      if (label) label.textContent = "Desktop Notifications: Active";
      btn.classList.add("btn-primary");
      btn.classList.remove("btn-outline");
    } else if (Notification.permission === "denied") {
      if (label) label.textContent = "Desktop Notifications: Blocked";
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-outline");
    } else {
      if (label) label.textContent = "Enable Desktop Notifications";
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-outline");
    }
  }

  updatePushUI();

  btn.addEventListener("click", () => {
    if (Notification.permission === "granted") {
      showToast("Desktop notifications are already enabled.", "Notifications");
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(permission => {
        updatePushUI();
        if (permission === "granted") {
          new Notification("Jeev One Health Monitor", {
            body: "Desktop alarm notifications enabled. You will receive immediate alerts when vitals breach safe ranges.",
            icon: "/static/images/favicon.png"
          });
          showToast("Desktop notifications enabled successfully!", "Notifications");
        }
      });
    } else {
      showToast("Notifications blocked. Please grant permissions in browser address bar.", "Notifications");
    }
  });
}

function sendDesktopNotification(alert) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const isCrit = (alert.severity === "CRITICAL" || alert.severity === "HIGH");
    const prefix = isCrit ? "🚨 CRITICAL" : "⚠️ WARNING";
    new Notification(`${prefix}: ${alert.title || "Vital Alert"}`, {
      body: `${alert.message || "Threshold breached"} | Measured: ${alert.value || "—"}`,
      icon: "/static/images/favicon.png",
      tag: alert.vital || "vital_alert"
    });
  } catch (e) {
    console.warn("Desktop notification error:", e);
  }
}

// ── Visual Card Alarm Glows & Vital Badges ────────────────────────────────────
function updateCardAlarms(activeAlerts) {
  const cards = {
    heart_rate: $("card-hr"),
    spo2: $("card-spo2"),
    body_temperature: $("card-btemp"),
    blood_pressure: $("card-bp"),
    heat_index: $("card-env")
  };
  const tags = {
    heart_rate: $("tag-hr"),
    spo2: $("tag-spo2"),
    body_temperature: $("tag-btemp"),
    blood_pressure: $("tag-bp"),
    heat_index: $("tag-env")
  };

  // Reset all cards and tags to default
  Object.values(cards).forEach(c => {
    if (c) c.classList.remove("card-alarm-critical", "card-alarm-warning");
  });
  if (tags.heart_rate) { tags.heart_rate.className = "vital-status-pill normal"; tags.heart_rate.textContent = "NORMAL"; }
  if (tags.spo2) { tags.spo2.className = "vital-status-pill normal"; tags.spo2.textContent = "NORMAL"; }
  if (tags.body_temperature) { tags.body_temperature.className = "vital-status-pill normal"; tags.body_temperature.textContent = "NORMAL"; }
  if (tags.blood_pressure) { tags.blood_pressure.className = "vital-status-pill normal"; tags.blood_pressure.textContent = "NORMAL"; }
  if (tags.heat_index) { tags.heat_index.className = "vital-status-pill normal"; tags.heat_index.textContent = "NORMAL"; }

  // Apply active alarm glows
  if (Array.isArray(activeAlerts)) {
    activeAlerts.forEach(a => {
      const v = a.vital;
      const card = cards[v];
      const tag = tags[v];
      const isCrit = (a.severity === "CRITICAL" || a.severity === "HIGH");
      const alarmClass = isCrit ? "card-alarm-critical" : "card-alarm-warning";
      const pillClass = isCrit ? "vital-status-pill critical" : "vital-status-pill warning";

      if (card) {
        card.classList.remove("card-alarm-critical", "card-alarm-warning");
        card.classList.add(alarmClass);
      }
      if (tag) {
        tag.className = pillClass;
        tag.textContent = a.direction === "HIGH" ? "HIGH" : (a.direction === "LOW" ? "LOW" : "ALERT");
      }
    });
  }

  // Update Settings tab alarm pill
  const settingsPill = $("alarm-system-status-pill");
  if (settingsPill) {
    const count = activeAlerts ? activeAlerts.length : 0;
    if (count > 0) {
      settingsPill.className = "status-badge high";
      settingsPill.textContent = `ALERT • ${count} ACTIVE ALARM${count > 1 ? "S" : ""}`;
    } else {
      settingsPill.className = "status-badge normal";
      settingsPill.textContent = "ACTIVE • 0 ALARMS";
    }
  }
}

// ── Notification Drawer & History Manager ────────────────────────────────────
function renderNotificationList() {
  const container = $("notif-list-container");
  const badge = $("notif-counter-badge");
  const headerPill = $("notif-header-pill");
  const activeCountEl = $("notif-tab-active-count");
  const histCountEl = $("notif-tab-history-count");

  const activeCount = _activeAlerts.length;
  const histCount = _historyAlerts.length;

  if (badge) {
    if (activeCount > 0) {
      badge.textContent = activeCount > 9 ? "9+" : activeCount;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  if (activeCountEl) activeCountEl.textContent = activeCount;
  if (histCountEl) histCountEl.textContent = histCount;

  if (headerPill) {
    if (activeCount > 0) {
      headerPill.textContent = `${activeCount} ACTIVE ALARM${activeCount > 1 ? "S" : ""}`;
      headerPill.className = "notif-status-pill alarms-active";
    } else {
      headerPill.textContent = "ALL CLEAR";
      headerPill.className = "notif-status-pill all-clear";
    }
  }

  if (!container) return;

  const listToRender = _currentNotifTab === "active" ? _activeAlerts : _historyAlerts;

  if (listToRender.length === 0) {
    container.innerHTML = `
      <div class="notif-empty-state">
        <div class="notif-empty-icon">🛡️</div>
        <div class="notif-empty-title">${_currentNotifTab === "active" ? "All Vitals Within Normal Limits" : "No Past Alerts Recorded"}</div>
        <div class="notif-empty-desc">${_currentNotifTab === "active" ? "Continuous edge telemetry is healthy. Threshold breach warnings will appear here instantly." : "Historical threshold alarms will be logged here."}</div>
      </div>
    `;
    return;
  }

  container.innerHTML = "";
  listToRender.forEach(a => {
    const isCrit = (a.severity === "CRITICAL" || a.severity === "HIGH");
    const isWarn = (a.severity === "WARNING" || a.severity === "WATCH");
    const sevClass = isCrit ? "critical" : (isWarn ? "warning" : "normal");
    const sevLabel = isCrit ? "CRITICAL" : (isWarn ? "WARNING" : "NORMAL");

    let timeStr = "Just now";
    if (a.timestamp) {
      const diffSec = Math.round((Date.now() / 1000) - a.timestamp);
      if (diffSec > 120) timeStr = `${Math.round(diffSec / 60)}m ago`;
      else if (diffSec > 5) timeStr = `${diffSec}s ago`;
      else timeStr = "Just now";
    }

    const card = document.createElement("div");
    card.className = `notif-card ${sevClass}`;
    card.innerHTML = `
      <div class="notif-card-header">
        <div class="notif-card-badges">
          <span class="notif-badge-pill ${sevClass}">${sevLabel}</span>
          <span class="notif-card-vital-tag">[${(a.vital || "general").replace("_", " ").toUpperCase()}]</span>
        </div>
        <span class="notif-card-time">${timeStr}</span>
      </div>
      <div class="notif-card-title">
        ${isCrit ? "🚨" : (isWarn ? "⚠️" : "✅")} ${a.title || "Health Alert"}
      </div>
      <div class="notif-card-msg">${a.message || ""}</div>
      <div class="notif-card-meta">
        <div>Measured: <span class="notif-val-highlight">${a.value || "—"}</span></div>
        <div class="notif-norm-ref">${a.normal_range ? "Ref: " + a.normal_range : ""}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

function fetchAlertsData() {
  fetch("/api/alerts")
    .then(r => r.json())
    .then(data => {
      if (Array.isArray(data.active)) _activeAlerts = data.active;
      if (Array.isArray(data.history)) _historyAlerts = data.history;
      else if (Array.isArray(data.alerts)) _historyAlerts = data.alerts;
      updateCardAlarms(_activeAlerts);
      renderNotificationList();
    })
    .catch(() => {});
}

function initNotificationCenter() {
  const btn = $("notif-btn");
  const panel = $("notif-dropdown-panel");
  const closeBtn = $("notif-close-btn");
  const soundToggleBtn = $("notif-sound-toggle-btn");
  const soundSettingBtn = $("btn-toggle-sound-settings");
  const tabActive = $("notif-tab-active");
  const tabHistory = $("notif-tab-history");
  const ackAllBtn = $("btn-ack-all");
  const clearHistoryBtn = $("btn-clear-history");

  if (!btn || !panel) return;

  function togglePanel() {
    const isOpen = panel.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (isOpen) {
      getAudioContext();
      renderNotificationList();
    }
  }

  function closePanel() {
    panel.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    togglePanel();
  });

  if (closeBtn) closeBtn.addEventListener("click", closePanel);

  if (soundToggleBtn) soundToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAudioMute();
  });

  if (soundSettingBtn) soundSettingBtn.addEventListener("click", () => {
    toggleAudioMute();
  });

  updateSoundUI();

  // Tab switching
  if (tabActive) {
    tabActive.addEventListener("click", () => {
      _currentNotifTab = "active";
      tabActive.classList.add("active");
      if (tabHistory) tabHistory.classList.remove("active");
      renderNotificationList();
    });
  }
  if (tabHistory) {
    tabHistory.addEventListener("click", () => {
      _currentNotifTab = "history";
      tabHistory.classList.add("active");
      if (tabActive) tabActive.classList.remove("active");
      renderNotificationList();
    });
  }

  // Acknowledge All
  if (ackAllBtn) {
    ackAllBtn.addEventListener("click", () => {
      fetch("/api/alerts/acknowledge", { method: "POST" })
        .then(r => r.json())
        .then(() => {
          showToast("All active alerts acknowledged", "Alerts");
          fetchAlertsData();
        })
        .catch(() => {});
    });
  }

  // Clear History
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      fetch("/api/alerts/clear", { method: "POST" })
        .then(r => r.json())
        .then(() => {
          _historyAlerts = [];
          showToast("Alert history cleared", "Alerts");
          renderNotificationList();
        })
        .catch(() => {});
    });
  }

  // Outside click & Escape
  document.addEventListener("click", (e) => {
    const wrapper = $("notif-menu-wrapper");
    if (wrapper && !wrapper.contains(e.target)) {
      closePanel();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePanel();
  });
}

// ── Interactive Alarm Simulator Hook ──────────────────────────────────────────
function initAlarmSimulator() {
  const simButtons = document.querySelectorAll(".sim-btn[data-sim-vital]");
  const clearTestBtn = $("sim-btn-clear-test");

  simButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const vital = btn.getAttribute("data-sim-vital");
      const severity = btn.getAttribute("data-sim-sev");

      fetch("/api/alerts/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vital, severity })
      })
      .then(r => r.json())
      .then(resp => {
        if (resp.alert) {
          showToast(resp.alert.severity, `${resp.alert.title}: ${resp.alert.message}`);
          playAlarmChime(resp.alert.severity);
          sendDesktopNotification(resp.alert);
          fetchAlertsData();
        }
      })
      .catch(e => console.warn("Simulate alert error:", e));
    });
  });

  if (clearTestBtn) {
    clearTestBtn.addEventListener("click", () => {
      fetch("/api/alerts/acknowledge", { method: "POST" })
        .then(() => {
          _activeAlerts = [];
          updateCardAlarms([]);
          renderNotificationList();
          playAlarmChime("NORMAL");
          showToast("NORMAL", "All vital alarms normalized & cleared.");
        })
        .catch(() => {});
    });
  }
}

// ── Multi-Patient & Account Profiles (Aryyaman & Hirok) ───────────────────────
let PROFILES = {
  user_1: {
    id: "user_1",
    device_id: "patient_01",
    name: "Aryyaman",
    role: "Subject 01",
    demographics: "24, Adult Male",
    initials: "AR",
    bgClass: "avatar-blue",
    notes: "Primary Node • Baseline Telemetry",
    welcomeSubtitle: "Viewing real-time biometric telemetry and edge risk evaluation for Aryyaman.",
    baseline: { heart_rate: 74, spo2: 98.2, body_temperature: 36.6, bp_sys: 118, bp_dia: 76 }
  },
  user_2: {
    id: "user_2",
    device_id: "patient_02",
    name: "Hirok",
    role: "Subject 02",
    demographics: "25, Adult Male",
    initials: "HK",
    bgClass: "avatar-emerald",
    notes: "Secondary Node • Dynamic Observation",
    welcomeSubtitle: "Viewing real-time biometric telemetry and edge risk evaluation for Hirok.",
    baseline: { heart_rate: 80, spo2: 97.8, body_temperature: 36.7, bp_sys: 122, bp_dia: 80 }
  }
};
let _activeUserId = "user_1";

function deriveInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function updateUserUI(userId) {
  const p = PROFILES[userId] || PROFILES.user_1;
  const p1 = PROFILES.user_1;
  const p2 = PROFILES.user_2;

  // 1. Header Profile Badge & Button (+ Avatar Portrait)
  const nameEl = $("user-name");
  const roleEl = $("user-role");
  const badgeEl = $("user-avatar-badge");
  const initialsEl = $("user-avatar-initials");
  const headerPhotoEl = $("user-avatar-photo");
  const portraitSrc = userId === "user_2"
    ? "/static/images/avatar-patient-2.jpg"
    : "/static/images/avatar-patient-1.jpg";

  if (nameEl) nameEl.textContent = p.name;
  if (roleEl) roleEl.textContent = p.role;
  if (initialsEl) initialsEl.textContent = p.initials;
  if (badgeEl) badgeEl.className = `user-avatar-badge ${p.bgClass}`;
  if (headerPhotoEl) {
    headerPhotoEl.src = portraitSrc;
    headerPhotoEl.alt = p.name;
  }

  // 2. Welcome Banner & Tab 2 Patient Header
  const welcomeH2 = document.querySelector(".bento-hero-card .welcome-text h2") || document.querySelector(".welcome-text h2");
  const welcomeP = document.querySelector(".bento-hero-card .welcome-text p") || document.querySelector(".welcome-text p");
  if (welcomeH2) welcomeH2.textContent = `Welcome back, ${p.name.split(" ")[0]}!`;
  if (welcomeP) welcomeP.textContent = p.welcomeSubtitle;

  const repPatName = $("report-patient-name");
  const repPatMeta = $("report-patient-meta");
  if (repPatName) repPatName.textContent = p.name;
  if (repPatMeta) repPatMeta.textContent = `${p.role} • ${p.device_id} • Clinical Rules Engine`;
  if (typeof _renderReportSnapshotStrip === "function") {
    _renderReportSnapshotStrip();
  }

  // 3. Dropdown Menu Items
  const items = document.querySelectorAll(".user-item");
  items.forEach(el => {
    el.classList.toggle("active", el.getAttribute("data-user-id") === userId);
  });
  const dropName1 = $("dropdown-name-1");
  const dropAvatar1 = $("dropdown-avatar-1");
  const dropMeta1 = $("dropdown-meta-1");
  if (dropName1) dropName1.textContent = p1.name;
  if (dropAvatar1) dropAvatar1.textContent = p1.initials;
  if (dropMeta1) dropMeta1.textContent = `${p1.role} • ${p1.demographics} • Primary Node`;

  const dropName2 = $("dropdown-name-2");
  const dropAvatar2 = $("dropdown-avatar-2");
  const dropMeta2 = $("dropdown-meta-2");
  if (dropName2) dropName2.textContent = p2.name;
  if (dropAvatar2) dropAvatar2.textContent = p2.initials;
  if (dropMeta2) dropMeta2.textContent = `${p2.role} • ${p2.demographics} • Secondary Node`;

  // 4. Settings Edit Boxes
  const setDispName1 = $("settings-name-display-1");
  const setDispRole1 = $("settings-role-display-1");
  const setAvatar1 = $("settings-avatar-1");
  const inputName1 = $("input-name-1");
  const inputRole1 = $("input-role-1");
  const inputAge1 = $("input-age-1");
  const inputNotes1 = $("input-notes-1");
  if (setDispName1) setDispName1.textContent = p1.name;
  if (setDispRole1) setDispRole1.textContent = `${p1.role} (Primary Node)`;
  if (setAvatar1) setAvatar1.textContent = p1.initials;
  if (inputName1 && document.activeElement !== inputName1) inputName1.value = p1.name;
  if (inputRole1 && document.activeElement !== inputRole1) inputRole1.value = p1.role;
  if (inputAge1 && document.activeElement !== inputAge1) inputAge1.value = p1.demographics;
  if (inputNotes1 && document.activeElement !== inputNotes1) inputNotes1.value = p1.notes;

  const setDispName2 = $("settings-name-display-2");
  const setDispRole2 = $("settings-role-display-2");
  const setAvatar2 = $("settings-avatar-2");
  const inputName2 = $("input-name-2");
  const inputRole2 = $("input-role-2");
  const inputAge2 = $("input-age-2");
  const inputNotes2 = $("input-notes-2");
  if (setDispName2) setDispName2.textContent = p2.name;
  if (setDispRole2) setDispRole2.textContent = `${p2.role} (Secondary Node)`;
  if (setAvatar2) setAvatar2.textContent = p2.initials;
  if (inputName2 && document.activeElement !== inputName2) inputName2.value = p2.name;
  if (inputRole2 && document.activeElement !== inputRole2) inputRole2.value = p2.role;
  if (inputAge2 && document.activeElement !== inputAge2) inputAge2.value = p2.demographics;
  if (inputNotes2 && document.activeElement !== inputNotes2) inputNotes2.value = p2.notes;

  // 6. Dual Matrix Titles
  const dualName1 = $("dual-name-1");
  const dualRole1 = $("dual-role-1");
  const dualAvatar1 = $("dual-avatar-1");
  if (dualName1) dualName1.textContent = p1.name;
  if (dualRole1) dualRole1.textContent = `${p1.role} (Primary)`;
  if (dualAvatar1) dualAvatar1.textContent = p1.initials;

  const dualName2 = $("dual-name-2");
  const dualRole2 = $("dual-role-2");
  const dualAvatar2 = $("dual-avatar-2");
  if (dualName2) dualName2.textContent = p2.name;
  if (dualRole2) dualRole2.textContent = `${p2.role} (Secondary)`;
  if (dualAvatar2) dualAvatar2.textContent = p2.initials;

  // 7. Mobile Drawer Patient Selector Pills
  const mobP1 = $("mob-patient-1");
  const mobP2 = $("mob-patient-2");
  if (mobP1) {
    mobP1.classList.toggle("active", userId === "user_1");
    const check1 = mobP1.querySelector(".mob-patient-check");
    if (check1) check1.textContent = userId === "user_1" ? "✓ Active" : "Select";
  }
  if (mobP2) {
    mobP2.classList.toggle("active", userId === "user_2");
    const check2 = mobP2.querySelector(".mob-patient-check");
    if (check2) check2.textContent = userId === "user_2" ? "✓ Active" : "Select";
  }
  const mobName1 = $("mob-patient-name-1");
  const mobName2 = $("mob-patient-name-2");
  const mobAvatar1 = $("mob-avatar-1");
  const mobAvatar2 = $("mob-avatar-2");
  if (mobName1) mobName1.textContent = p1.name;
  if (mobName2) mobName2.textContent = p2.name;
  if (mobAvatar1) mobAvatar1.textContent = p1.initials;
  if (mobAvatar2) mobAvatar2.textContent = p2.initials;
}

function selectUser(userId, notify = true) {
  if (!PROFILES[userId]) return;
  _activeUserId = userId;
  localStorage.setItem("jeev_one_user_id", userId);
  updateUserUI(userId);

  // Sync to server active user
  fetch("/api/users/active", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId })
  }).catch(() => {});

  // If Firestore is active, switch patient stream directly from real database
  if (_firestoreDb) {
    subscribeToFirestoreReadings();
  } else {
    const targetDevice = PROFILES[userId].device_id;
    fetchLatest(targetDevice);
    fetchHistory(targetDevice);
    updateDualTelemetry();
  }

  // Refresh health report if section is active or in DOM
  if (typeof fetchReport === "function") {
    fetchReport(false);
  }

  if (notify) {
    showToast("normal", `Switched active subject to ${PROFILES[userId].name} (${PROFILES[userId].role})`);
  }
}

function saveUserProfile(userId, updates) {
  if (!PROFILES[userId]) return;
  const p = PROFILES[userId];

  if (updates.name && updates.name.trim()) {
    p.name = updates.name.trim();
    p.initials = deriveInitials(p.name);
    p.welcomeSubtitle = `Viewing real-time biometric telemetry and edge risk evaluation for ${p.name.split(" ")[0]}.`;
  }
  if (updates.role) p.role = updates.role.trim();
  if (updates.demographics) p.demographics = updates.demographics.trim();
  if (updates.notes) p.notes = updates.notes.trim();

  // Save to localStorage
  localStorage.setItem("jeev_one_profiles", JSON.stringify(PROFILES));

  // Sync to backend API
  fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, ...updates })
  }).catch(e => console.warn("Failed saving profile to server:", e));

  updateUserUI(_activeUserId);
  showToast("normal", `Profile for ${p.name} updated successfully.`);
}

function updateDualTelemetry() {
  fetch("/api/users/telemetry")
    .then(r => r.json())
    .then(res => {
      if (!res.users) return;
      const u1 = res.users.user_1;
      const u2 = res.users.user_2;

      // Update User 1 (Aryyaman) Vitals
      if (u1 && u1.latest) {
        const d1 = u1.latest;
        const r1 = u1.risk ? u1.risk.overall_status : "NORMAL";
        const dhr1 = $("dual-hr-1");
        const dspo21 = $("dual-spo2-1");
        const dtemp1 = $("dual-temp-1");
        const dbp1 = $("dual-bp-1");
        const dstat1 = $("dual-status-1");
        const driskBadge1 = $("dual-risk-badge-1");
        if (dhr1) dhr1.textContent = `${fmt0(d1.heart_rate)} bpm`;
        if (dspo21) dspo21.textContent = `${fmt1(d1.spo2)}%`;
        if (dtemp1) dtemp1.textContent = `${fmt1(d1.body_temperature)} °C`;
        if (dbp1) dbp1.textContent = d1.bp_sys ? `${fmt0(d1.bp_sys)}/${fmt0(d1.bp_dia)} mmHg` : "--/-- mmHg";
        if (dstat1) dstat1.textContent = r1;
        if (driskBadge1) {
          driskBadge1.textContent = r1 === "HIGH" ? "CRITICAL RISK" : (r1 === "WATCH" ? "CAUTION" : "STABLE");
          driskBadge1.className = `status-badge ${r1.toLowerCase()}`;
        }
      }

      // Update User 2 (Hirok) Vitals
      if (u2 && u2.latest) {
        const d2 = u2.latest;
        const r2 = u2.risk ? u2.risk.overall_status : "NORMAL";
        const dhr2 = $("dual-hr-2");
        const dspo22 = $("dual-spo2-2");
        const dtemp2 = $("dual-temp-2");
        const dbp2 = $("dual-bp-2");
        const dstat2 = $("dual-status-2");
        const driskBadge2 = $("dual-risk-badge-2");
        if (dhr2) dhr2.textContent = `${fmt0(d2.heart_rate)} bpm`;
        if (dspo22) dspo22.textContent = `${fmt1(d2.spo2)}%`;
        if (dtemp2) dtemp2.textContent = `${fmt1(d2.body_temperature)} °C`;
        if (dbp2) dbp2.textContent = d2.bp_sys ? `${fmt0(d2.bp_sys)}/${fmt0(d2.bp_dia)} mmHg` : "--/-- mmHg";
        if (dstat2) dstat2.textContent = r2;
        if (driskBadge2) {
          driskBadge2.textContent = r2 === "HIGH" ? "CRITICAL RISK" : (r2 === "WATCH" ? "CAUTION" : "STABLE");
          driskBadge2.className = `status-badge ${r2.toLowerCase()}`;
        }
      }
    })
    .catch(() => {});
}

function initUserSwitcher() {
  const wrapper = $("user-menu-wrapper");
  const btn = $("user-profile-btn");
  const menu = $("user-dropdown-menu");
  const items = document.querySelectorAll(".user-item");

  if (!btn || !menu) return;

  // Restore profiles from localStorage if available
  try {
    const cached = localStorage.getItem("jeev_one_profiles");
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed.user_1 && parsed.user_2) PROFILES = parsed;
    }
  } catch (_) {}

  // Fetch server profiles
  fetch("/api/users")
    .then(r => r.json())
    .then(res => {
      if (res.users && res.users.user_1 && res.users.user_2) {
        const localCached = localStorage.getItem("jeev_one_profiles");
        if (!localCached) {
          PROFILES = res.users;
        } else {
          try {
            const parsed = JSON.parse(localCached);
            PROFILES = {
              user_1: { ...res.users.user_1, ...(parsed.user_1 || {}) },
              user_2: { ...res.users.user_2, ...(parsed.user_2 || {}) }
            };
          } catch(e) {
            PROFILES = res.users;
          }
        }
        if (res.active_user_id && !localStorage.getItem("jeev_one_user_id")) {
          _activeUserId = res.active_user_id;
        }
      }
      updateUserUI(_activeUserId);
      updateDualTelemetry();
    })
    .catch(() => {
      updateUserUI(_activeUserId);
    });

  function toggleMenu() {
    const isOpen = menu.classList.toggle("open");
    btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function closeMenu() {
    menu.classList.remove("open");
    btn.setAttribute("aria-expanded", "false");
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });

  items.forEach(item => {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-user-id");
      selectUser(id, true);
      closeMenu();
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = item.getAttribute("data-user-id");
        selectUser(id, true);
        closeMenu();
      }
    });
  });

  const dropdownSettingsBtn = $("btn-dropdown-edit-settings");
  if (dropdownSettingsBtn) {
    dropdownSettingsBtn.addEventListener("click", () => {
      closeMenu();
      const settingsBtn = $("settings-btn");
      if (settingsBtn) settingsBtn.click();
      const settingsCard = $("user-settings-card");
      if (settingsCard) {
        settingsCard.scrollIntoView({ behavior: "smooth" });
      }
    });
  }

  const btnLogout = $("btn-dropdown-logout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      sessionStorage.removeItem("jeev_one_auth");
      localStorage.removeItem("jeev_one_auth");
      window.location.href = "/login";
    });
  }

  document.addEventListener("click", (e) => {
    if (wrapper && !wrapper.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Settings Edit Form 1 (Aryyaman)
  const form1 = $("form-edit-user-1");
  if (form1) {
    form1.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("input-name-1")?.value || "Aryyaman";
      const role = $("input-role-1")?.value || "Subject 01";
      const demographics = $("input-age-1")?.value || "";
      const notes = $("input-notes-1")?.value || "";
      saveUserProfile("user_1", { name, role, demographics, notes });
    });
  }

  // Settings Edit Form 2 (Hirok)
  const form2 = $("form-edit-user-2");
  if (form2) {
    form2.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("input-name-2")?.value || "Hirok";
      const role = $("input-role-2")?.value || "Subject 02";
      const demographics = $("input-age-2")?.value || "";
      const notes = $("input-notes-2")?.value || "";
      saveUserProfile("user_2", { name, role, demographics, notes });
    });
  }

  // Switch patient buttons in Settings forms
  document.querySelectorAll(".btn-switch-patient").forEach(b => {
    b.addEventListener("click", () => {
      const uid = b.getAttribute("data-user-id");
      selectUser(uid, true);
    });
  });

  // Dual Comparison Toggle Button
  const toggleDualBtn = $("btn-toggle-dual-matrix");
  const dualContainer = $("dual-matrix-container");
  const toggleDualText = $("btn-toggle-dual-text");
  if (toggleDualBtn && dualContainer) {
    toggleDualBtn.addEventListener("click", () => {
      const isHidden = dualContainer.style.display === "none";
      dualContainer.style.display = isHidden ? "block" : "none";
      if (toggleDualText) {
        toggleDualText.textContent = isHidden ? "Hide Dual Comparison" : "Dual-Patient Comparison View";
      }
      if (isHidden) {
        updateDualTelemetry();
      }
    });
  }

  // Focus buttons in Dual Comparison
  document.querySelectorAll(".dual-focus-btn").forEach(b => {
    b.addEventListener("click", () => {
      const uid = b.getAttribute("data-user-id");
      selectUser(uid, true);
      const liveBtn = document.querySelector("[data-tab='live']");
      if (liveBtn) liveBtn.click();
    });
  });

  // Restore saved active profile
  const savedId = localStorage.getItem("jeev_one_user_id");
  if (savedId && PROFILES[savedId]) {
    selectUser(savedId, false);
  } else {
    updateUserUI(_activeUserId);
  }

  // Poll dual telemetry periodically
  setInterval(updateDualTelemetry, 5000);
}

// ── Tab Management ─────────────────────────────────────────────────────────────
function initTabs() {
  const tabButtons = document.querySelectorAll("[data-tab]");
  const tabPanes = document.querySelectorAll(".tab-pane");

  function switchTab(tabId) {
    if (!tabId) return;

    // Toggle tab panes
    tabPanes.forEach(pane => {
      pane.classList.toggle("active", pane.id === `tab-${tabId}`);
    });

    // Toggle button active classes across all tab buttons (header, drawer, bottom nav)
    document.querySelectorAll("[data-tab]").forEach(btn => {
      const targetTab = btn.getAttribute("data-tab");
      btn.classList.toggle("active", targetTab === tabId);
    });

    // Close mobile drawer if open
    if (window.closeMobileDrawer) {
      window.closeMobileDrawer();
    }

    // Immediately restore viewport scroll position to top
    window.scrollTo({ top: 0, behavior: "instant" });
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    // Resize charts and canvases when entering tabs
    if (tabId === "live") {
      setTimeout(() => {
        if (gaugeChart) gaugeChart.resize();
        if (trendChart) trendChart.resize();
        const liveCanvas = $("live-ecg-canvas");
        if (liveCanvas && liveCanvas.parentElement) {
          const w = liveCanvas.parentElement.clientWidth;
          if (w > 0) {
            liveCanvas.width = w * (window.devicePixelRatio || 1);
            liveCanvas.height = 150 * (window.devicePixelRatio || 1);
          }
        }
      }, 50);
    } else if (tabId === "ecg") {
      setTimeout(() => {
        if (typeof renderArchiveECGStrip === "function") {
          renderArchiveECGStrip();
        }
      }, 50);
    }

    try {
      localStorage.setItem("jeev_one_active_tab", tabId);
    } catch (e) {}

    // Notify other modules about the tab change
    document.dispatchEvent(new CustomEvent("tab:changed", { detail: { tab: tabId } }));
  }

  // Universal event delegation for all tab triggers (supports desktop, mobile touch, and PWA bottom nav)
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tab]");
    if (btn) {
      e.preventDefault();
      const tabId = btn.getAttribute("data-tab");
      switchTab(tabId);
    }
  });

  // Wire direct view history button from live card
  const btnViewHistory = $("btn-view-ecg-history");
  if (btnViewHistory) {
    btnViewHistory.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab("ecg");
    });
  }

  // Check URL query param (?tab=...), hash (#...), or localStorage
  const urlParams = new URLSearchParams(window.location.search);
  const paramTab = urlParams.get("tab");
  const hash = window.location.hash.replace("#", "");
  let initialTab = "live";
  if (paramTab && $(`tab-${paramTab}`)) {
    initialTab = paramTab;
  } else if (hash && $(`tab-${hash}`)) {
    initialTab = hash;
  } else {
    try {
      const savedTab = localStorage.getItem("jeev_one_active_tab");
      if (savedTab && $(`tab-${savedTab}`)) {
        initialTab = savedTab;
      }
    } catch (e) {}
  }
  switchTab(initialTab);
}

// ── Theme Management (Dark / Light) ───────────────────────────────────────────
function initTheme() {
  const themeToggleBtn = $("theme-toggle-btn");
  const themeOptionBtns = document.querySelectorAll(".theme-option-btn");

  function applyTheme(theme, notify = false) {
    const isDark = theme === "dark";
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      document.body.removeAttribute("data-theme");
    }

    // Update Header Toggle Icon (Sun in dark mode, Moon in light mode)
    const iconTheme = $("icon-theme");
    if (iconTheme) {
      ICONS.inject(iconTheme, isDark ? "sun" : "moon");
    }
    if (themeToggleBtn) {
      themeToggleBtn.setAttribute("title", isDark ? "Switch to Light Theme" : "Switch to Dark Theme");
      themeToggleBtn.setAttribute("aria-label", isDark ? "Switch to Light Theme" : "Switch to Dark Theme");
    }

    // Update settings buttons
    themeOptionBtns.forEach(btn => {
      const choice = btn.getAttribute("data-theme-choice");
      btn.classList.toggle("active", choice === theme);
    });

    try {
      localStorage.setItem("jeev_one_theme", theme);
    } catch (e) {}

    updateChartsTheme();

    if (notify) {
      showToast(`Switched to ${isDark ? 'Evening Dark' : 'Warm Light'} Theme`);
    }
  }

  // Load saved theme or default to uplifting Warm Light
  const savedTheme = localStorage.getItem("jeev_one_theme");
  const initialTheme = savedTheme ? savedTheme : "light";

  applyTheme(initialTheme, false);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next, true);
    });
  }

  themeOptionBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const choice = btn.getAttribute("data-theme-choice");
      if (choice) applyTheme(choice, true);
    });
  });
}

// ── ECG Level 1 Live Oscilloscope & Archive Management ────────────────────────
let ecgLiveAnimId = null;
let currentEcgHR = 74;

// Realistic clinical P-Q-R-S-T wave model (normalized timing & amplitude)
const ECG_BEAT_TEMPLATE = [
  { t: 0.00, y: 0.00 },
  // P wave (atrial depolarization)
  { t: 0.12, y: 0.14 },
  { t: 0.16, y: 0.22 },
  { t: 0.20, y: 0.00 },
  // PR segment
  { t: 0.28, y: 0.00 },
  // Q wave (septal depolarization)
  { t: 0.32, y: -0.15 },
  // R peak (rapid ventricular depolarization)
  { t: 0.36, y: 1.25 },
  // S dip (late ventricular depolarization)
  { t: 0.40, y: -0.35 },
  // ST segment
  { t: 0.48, y: 0.00 },
  // T wave (ventricular repolarization)
  { t: 0.58, y: 0.26 },
  { t: 0.64, y: 0.32 },
  { t: 0.70, y: 0.00 },
  // Isoelectric resting baseline until next beat
  { t: 1.00, y: 0.00 }
];

function initLiveECG() {
  const canvas = $("live-ecg-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    if (!canvas.parentElement) return;
    const w = canvas.parentElement.clientWidth;
    if (w > 0) {
      canvas.width = w * (window.devicePixelRatio || 1);
      canvas.height = 150 * (window.devicePixelRatio || 1);
      drawMedicalGrid(ctx, canvas.width, canvas.height);
    }
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  let sweepX = 0;
  const speed = 2.4 * (window.devicePixelRatio || 1); // 25 mm/s equivalent sweep
  const sweepClearWidth = 28 * (window.devicePixelRatio || 1);
  let beatPhase = 0;
  let lastTime = performance.now();
  let prevY = canvas.height * 0.56;

  function drawMedicalGrid(context, w, h) {
    const minorGrid = 16 * (window.devicePixelRatio || 1);
    const majorGrid = minorGrid * 5;

    context.fillStyle = "#0C1F17";
    context.fillRect(0, 0, w, h);

    // Minor 1mm grid
    context.strokeStyle = "rgba(74, 222, 128, 0.08)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x < w; x += minorGrid) {
      context.moveTo(x, 0);
      context.lineTo(x, h);
    }
    for (let y = 0; y < h; y += minorGrid) {
      context.moveTo(0, y);
      context.lineTo(w, y);
    }
    context.stroke();

    // Major 5mm grid
    context.strokeStyle = "rgba(74, 222, 128, 0.20)";
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x < w; x += majorGrid) {
      context.moveTo(x, 0);
      context.lineTo(x, h);
    }
    for (let y = 0; y < h; y += majorGrid) {
      context.moveTo(0, y);
      context.lineTo(w, y);
    }
    context.stroke();
  }

  function render(time) {
    const dt = Math.min(0.1, (time - lastTime) / 1000);
    lastTime = time;

    const w = canvas.width;
    const h = canvas.height;
    const centerY = h * 0.56;
    const scaleY = h * 0.35;

    // Dynamic heart rate drives beat period
    const hr = Math.max(48, Math.min(150, currentEcgHR || 74));
    const beatDuration = 60 / hr; // e.g., 0.8s for 75 bpm
    beatPhase = (beatPhase + dt / beatDuration) % 1.0;

    // Interpolate wave Y
    let waveY = 0;
    for (let i = 0; i < ECG_BEAT_TEMPLATE.length - 1; i++) {
      const p1 = ECG_BEAT_TEMPLATE[i];
      const p2 = ECG_BEAT_TEMPLATE[i + 1];
      if (beatPhase >= p1.t && beatPhase <= p2.t) {
        const factor = (beatPhase - p1.t) / (p2.t - p1.t);
        waveY = p1.y + factor * (p2.y - p1.y);
        break;
      }
    }

    // Micro-noise for authentic analog telemetry
    const noise = (Math.sin(time * 0.03) * 0.015) + ((Math.random() - 0.5) * 0.02);
    const targetY = centerY - (waveY + noise) * scaleY;

    // Advance sweep cursor
    const nextSweepX = (sweepX + speed) % w;
    if (nextSweepX < sweepX) {
      drawMedicalGrid(ctx, w, h);
      prevY = targetY;
    }

    // Clear ahead
    ctx.fillStyle = "#0C1F17";
    ctx.fillRect(sweepX, 0, sweepClearWidth, h);

    // Redraw grid slice
    const minorGrid = 16 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = "rgba(74, 222, 128, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    const startX = Math.floor(sweepX / minorGrid) * minorGrid;
    for (let gx = startX; gx < sweepX + sweepClearWidth; gx += minorGrid) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, h);
    }
    for (let gy = 0; gy < h; gy += minorGrid) {
      ctx.moveTo(sweepX, gy);
      ctx.lineTo(sweepX + sweepClearWidth, gy);
    }
    ctx.stroke();

    // Draw phosphorescent Lead I line
    ctx.beginPath();
    ctx.moveTo(sweepX, prevY);
    ctx.lineTo(nextSweepX, targetY);
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.2 * (window.devicePixelRatio || 1);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "#22c55e";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cursor tip
    ctx.fillStyle = "#86efac";
    ctx.beginPath();
    ctx.arc(nextSweepX, targetY, 2.5 * (window.devicePixelRatio || 1), 0, Math.PI * 2);
    ctx.fill();

    sweepX = nextSweepX;
    prevY = targetY;

    ecgLiveAnimId = requestAnimationFrame(render);
  }

  ecgLiveAnimId = requestAnimationFrame(render);
}

function updateECGMetrics(hr, overall = "NORMAL") {
  const hrVal = Math.round(hr || 74);
  const rrVal = Math.round(60000 / hrVal);
  const prVal = Math.round(156 + (75 - hrVal) * 0.35);
  const qrsVal = Math.round(87 + (Math.sin(hrVal) * 2));
  const rawQtc = Math.max(385, Math.min(455, 408 + (hrVal - 70) * 0.42 + (Math.sin(hrVal * 0.3) * 2)));
  const qtVal = Math.round(rawQtc * Math.sqrt(rrVal / 1000));
  const qtcVal = Math.round(qtVal / Math.sqrt(rrVal / 1000));
  const ampVal = (1.18 + (Math.sin(hrVal * 0.4) * 0.06)).toFixed(2);

  const elOverlayHR = $("ecg-overlay-hr-val");
  const elOverlayRR = $("ecg-overlay-rr-val");
  const elOverlayQRS = $("ecg-overlay-qrs-val");
  if (elOverlayHR) elOverlayHR.textContent = hrVal;
  if (elOverlayRR) elOverlayRR.textContent = `${rrVal} ms`;
  if (elOverlayQRS) elOverlayQRS.textContent = `${qrsVal} ms`;

  const elMetricRR = $("ecg-metric-rr");
  const elMetricPR = $("ecg-metric-pr");
  const elMetricQRS = $("ecg-metric-qrs");
  const elMetricQTc = $("ecg-metric-qtc");
  const elMetricAmp = $("ecg-metric-amp");
  const elMetricRhythm = $("ecg-metric-rhythm");
  const elRhythmBadge = $("ecg-live-rhythm-badge");

  if (elMetricRR) elMetricRR.textContent = rrVal;
  if (elMetricPR) elMetricPR.textContent = prVal;
  if (elMetricQRS) elMetricQRS.textContent = qrsVal;
  if (elMetricQTc) elMetricQTc.textContent = qtcVal;
  if (elMetricAmp) elMetricAmp.textContent = ampVal;

  let rhythmName = "Sinus";
  let rhythmLong = "Normal Sinus Rhythm (NSR)";
  let rhythmColor = "var(--risk-normal)";

  if (hrVal > 100) {
    rhythmName = "Tachycardia";
    rhythmLong = "Sinus Tachycardia (ST)";
    rhythmColor = "var(--risk-watch)";
  } else if (hrVal < 60) {
    rhythmName = "Bradycardia";
    rhythmLong = "Sinus Bradycardia (SB)";
    rhythmColor = "#2563EB";
  }

  if (elMetricRhythm) {
    elMetricRhythm.textContent = rhythmName;
    elMetricRhythm.style.color = rhythmColor;
  }
  if (elRhythmBadge) {
    elRhythmBadge.textContent = rhythmLong;
  }
}

// ── ECG Archive & Historical Strip Management ─────────────────────────────────
const HISTORICAL_ECG_RECORDS = [
  { id: "ECG-2041", time: "12:45:10 PM", rhythm: "Normal Sinus Rhythm", badgeClass: "normal", hr: 72, rr: 833, pr: 158, qrs: 86, qtc: 412, quality: "98% (Good)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2040", time: "12:30:00 PM", rhythm: "Normal Sinus Rhythm", badgeClass: "normal", hr: 76, rr: 789, pr: 160, qrs: 88, qtc: 415, quality: "97% (Good)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2039", time: "11:15:22 AM", rhythm: "Sinus Bradycardia", badgeClass: "watch", hr: 58, rr: 1034, pr: 164, qrs: 84, qtc: 402, quality: "99% (Optimal)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2038", time: "10:00:45 AM", rhythm: "Normal Sinus Rhythm", badgeClass: "normal", hr: 80, rr: 750, pr: 152, qrs: 88, qtc: 420, quality: "96% (Good)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2037", time: "09:20:18 AM", rhythm: "Sinus Tachycardia", badgeClass: "watch", hr: 105, rr: 571, pr: 142, qrs: 86, qtc: 428, quality: "94% (Motion)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2036", time: "08:45:00 AM", rhythm: "Normal Sinus Rhythm", badgeClass: "normal", hr: 74, rr: 810, pr: 158, qrs: 86, qtc: 412, quality: "98% (Good)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2035", time: "Yesterday 21:30", rhythm: "Resting Sinus Rhythm", badgeClass: "normal", hr: 64, rr: 937, pr: 162, qrs: 85, qtc: 406, quality: "99% (Optimal)", lead: "Lead I (LA-RA)" },
  { id: "ECG-2034", time: "Yesterday 17:15", rhythm: "Normal Sinus Rhythm", badgeClass: "normal", hr: 78, rr: 769, pr: 155, qrs: 87, qtc: 414, quality: "97% (Good)", lead: "Lead I (LA-RA)" }
];

let selectedECGRecord = HISTORICAL_ECG_RECORDS[0];

function renderArchiveECGStrip(record = selectedECGRecord) {
  const canvas = $("archive-ecg-canvas");
  if (!canvas || !canvas.parentElement) return;

  const w = canvas.parentElement.clientWidth;
  if (w > 0) {
    canvas.width = w * (window.devicePixelRatio || 1);
    canvas.height = 165 * (window.devicePixelRatio || 1);
  }

  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  const centerY = ch * 0.55;
  const scaleY = ch * 0.35;

  // Draw 1mm and 5mm medical grid
  const minorGrid = 16 * (window.devicePixelRatio || 1);
  const majorGrid = minorGrid * 5;

  ctx.fillStyle = "#0C1F17";
  ctx.fillRect(0, 0, cw, ch);

  ctx.strokeStyle = "rgba(74, 222, 128, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < cw; x += minorGrid) {
    ctx.moveTo(x, 0); ctx.lineTo(x, ch);
  }
  for (let y = 0; y < ch; y += minorGrid) {
    ctx.moveTo(0, y); ctx.lineTo(cw, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(74, 222, 128, 0.20)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < cw; x += majorGrid) {
    ctx.moveTo(x, 0); ctx.lineTo(x, ch);
  }
  for (let y = 0; y < ch; y += majorGrid) {
    ctx.moveTo(0, y); ctx.lineTo(cw, y);
  }
  ctx.stroke();

  // Draw Standard 1.0 mV square calibration pulse at the start
  ctx.strokeStyle = "#4ade80";
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.beginPath();
  const calStart = 20 * (window.devicePixelRatio || 1);
  const calWidth = 25 * (window.devicePixelRatio || 1);
  const calHeight = scaleY * 1.0; // 1 mV
  ctx.moveTo(calStart, centerY);
  ctx.lineTo(calStart + 8, centerY);
  ctx.lineTo(calStart + 8, centerY - calHeight);
  ctx.lineTo(calStart + calWidth, centerY - calHeight);
  ctx.lineTo(calStart + calWidth, centerY);
  ctx.lineTo(calStart + calWidth + 12, centerY);
  ctx.stroke();

  // Draw calibration label
  ctx.fillStyle = "#86efac";
  ctx.font = `${10 * (window.devicePixelRatio || 1)}px JetBrains Mono, monospace`;
  ctx.fillText("1 mV CAL", calStart, centerY - calHeight - 6);

  // Draw 10-second ECG waveform across the width
  const startX = calStart + calWidth + 20;
  const availableW = cw - startX - 20;
  const beatCount = Math.round((record.hr / 60) * 10); // beats in 10s
  const beatWidth = availableW / beatCount;

  ctx.beginPath();
  ctx.strokeStyle = "#22c55e";
  ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
  ctx.shadowColor = "#22c55e";
  ctx.shadowBlur = 6;

  let isFirst = true;

  for (let b = 0; b < beatCount; b++) {
    const beatStartX = startX + b * beatWidth;
    for (let i = 0; i < ECG_BEAT_TEMPLATE.length; i++) {
      const pt = ECG_BEAT_TEMPLATE[i];
      const px = beatStartX + pt.t * beatWidth;
      const py = centerY - pt.y * scaleY;
      if (isFirst) {
        ctx.moveTo(px, py);
        isFirst = false;
      } else {
        ctx.lineTo(px, py);
      }
    }
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Annotate P, Q, R, S, T on the 2nd beat
  if (beatCount > 2) {
    const annotateBeat = startX + 1.5 * beatWidth;
    ctx.fillStyle = "#a78bfa";
    ctx.font = `bold ${10 * (window.devicePixelRatio || 1)}px JetBrains Mono, monospace`;
    ctx.textAlign = "center";
    ctx.fillText("P", annotateBeat + 0.16 * beatWidth, centerY - 0.25 * scaleY - 6);
    ctx.fillText("R", annotateBeat + 0.36 * beatWidth, centerY - 1.25 * scaleY - 6);
    ctx.fillText("T", annotateBeat + 0.64 * beatWidth, centerY - 0.35 * scaleY - 6);
  }

  // Update strip header labels
  const metaEl = $("ecg-strip-meta-text");
  const badgeEl = $("ecg-strip-status-badge");
  const overlayHr = $("strip-overlay-hr");
  const overlayRr = $("strip-overlay-rr");
  const overlayPr = $("strip-overlay-pr");
  const overlayQrs = $("strip-overlay-qrs");
  const overlayQtc = $("strip-overlay-qtc");

  if (metaEl) {
    metaEl.innerHTML = `Selected Recording: <strong>#${record.id}</strong> • ${record.time} • Calibrated 25 mm/s • 10 mm/mV • ${record.lead}`;
  }
  if (badgeEl) {
    badgeEl.textContent = record.rhythm.toUpperCase();
    badgeEl.className = `status-badge ${record.badgeClass}`;
  }
  if (overlayHr) overlayHr.textContent = `${record.hr} bpm`;
  if (overlayRr) overlayRr.textContent = `${record.rr} ms`;
  if (overlayPr) overlayPr.textContent = `${record.pr} ms`;
  if (overlayQrs) overlayQrs.textContent = `${record.qrs} ms`;
  if (overlayQtc) overlayQtc.textContent = `${record.qtc} ms`;
}

function initArchiveECG() {
  const tbody = $("ecg-history-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  HISTORICAL_ECG_RECORDS.forEach((rec, idx) => {
    const tr = document.createElement("tr");
    if (idx === 0) tr.classList.add("history-strip-active-row");

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); color: var(--text-muted); font-weight: 500;">${rec.time}</td>
      <td><span class="status-badge ${rec.badgeClass}">${rec.rhythm}</span></td>
      <td style="font-weight: 600;">${rec.hr} <small style="color:var(--text-dim)">bpm</small></td>
      <td style="font-family: var(--font-mono);">${rec.rr} ms</td>
      <td style="font-family: var(--font-mono);">${rec.pr} ms</td>
      <td style="font-family: var(--font-mono);">${rec.qrs} ms</td>
      <td style="font-family: var(--font-mono);">${rec.qtc} ms</td>
      <td><span style="font-size: 0.75rem; color: var(--risk-normal);">● ${rec.quality}</span></td>
      <td>
        <button class="btn btn-sm review-strip-btn" data-record-id="${rec.id}">
          Review Strip →
        </button>
      </td>
    `;

    function onSelectRow(scroll = false) {
      selectedECGRecord = rec;
      document.querySelectorAll("#ecg-history-tbody tr").forEach(r => r.classList.remove("history-strip-active-row"));
      tr.classList.add("history-strip-active-row");
      renderArchiveECGStrip(rec);
      if (scroll) {
        const viewerCanvas = $("archive-ecg-canvas");
        if (viewerCanvas) {
          viewerCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }

    tr.addEventListener("click", () => onSelectRow(false));
    const btn = tr.querySelector(".review-strip-btn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRow(true);
      });
    }

    tbody.appendChild(tr);
  });

  // Render first strip
  renderArchiveECGStrip(HISTORICAL_ECG_RECORDS[0]);

  // Hook export CSV button
  const exportBtn = $("btn-export-ecg-csv");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      let csv = "ID,Time,Rhythm,HeartRate,RR_Interval_ms,PR_Interval_ms,QRS_Duration_ms,QTc_ms,LeadQuality\n";
      HISTORICAL_ECG_RECORDS.forEach(r => {
        csv += `${r.id},"${r.time}","${r.rhythm}",${r.hr},${r.rr},${r.pr},${r.qrs},${r.qtc},"${r.quality}"\n`;
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jeev_one_ecg_telemetry_${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("ECG telemetry records exported to CSV successfully", "ECG Export");
    });
  }
}

// ── Progressive Web App (PWA) Registration & Install Prompt ──────────────────
let deferredInstallPrompt = null;

function initPWA() {
  // 1. Register Service Worker with root scope
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          console.log("[PWA] Service Worker registered with root scope:", reg.scope);
          // Check for worker updates immediately on launch
          try { reg.update(); } catch(e) {}
          
          // Check for worker updates
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  installing.postMessage({ type: "SKIP_WAITING" });
                  showToast("normal", "Jeev One has updated to the latest live version.");
                }
              });
            }
          });
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });

      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  // 2. Standalone Mode Detection
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const pwaStatusBadge = $("pwa-status-badge");
  const installBtnNav = $("btn-install-pwa");
  const installBtnSettings = $("btn-install-settings-pwa");
  const installBtnHeader = $("header-btn-install-pwa");
  const mobilePwaBanner = $("mobile-pwa-banner");
  const btnBannerInstall = $("btn-banner-install");
  const btnBannerDismiss = $("btn-banner-dismiss");

  function hideAllInstallPrompts() {
    if (installBtnNav) installBtnNav.style.display = "none";
    if (installBtnSettings) installBtnSettings.style.display = "none";
    if (installBtnHeader) installBtnHeader.style.display = "none";
    if (mobilePwaBanner) mobilePwaBanner.style.display = "none";
    const installBtnDrawer = $("mob-btn-install-pwa");
    if (installBtnDrawer) installBtnDrawer.style.display = "none";
  }

  function maybeShowMobileBanner() {
    if (isStandalone) return;
    try {
      if (sessionStorage.getItem("jeev_pwa_banner_dismissed") === "true") return;
    } catch(e) {}
    if (mobilePwaBanner) {
      setTimeout(() => {
        if (!document.body.classList.contains("pwa-standalone")) {
          mobilePwaBanner.style.display = "flex";
        }
      }, 1200);
    }
  }

  if (isStandalone) {
    document.body.classList.add("pwa-standalone");
    if (pwaStatusBadge) {
      pwaStatusBadge.textContent = "STANDALONE ACTIVE";
      pwaStatusBadge.className = "status-badge normal";
    }
    hideAllInstallPrompts();
    console.log("[PWA] Running as installed standalone app");
  } else {
    if (pwaStatusBadge) {
      pwaStatusBadge.textContent = "STANDALONE READY";
    }
    const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobileDevice) {
      maybeShowMobileBanner();
    }
  }

  // 3. iOS detection
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // 4. Capture native install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (installBtnNav) installBtnNav.style.display = "flex";
    if (installBtnSettings) {
      installBtnSettings.style.display = "inline-flex";
    }
    if (installBtnHeader) installBtnHeader.style.display = "inline-flex";
    const installBtnDrawer = $("mob-btn-install-pwa");
    if (installBtnDrawer) installBtnDrawer.style.display = "inline-flex";
    maybeShowMobileBanner();
    console.log("[PWA] beforeinstallprompt event captured");
  });

  // Modal controls for iOS
  const iosModal = $("ios-install-modal");
  const closeIosBtn = $("btn-close-ios-modal");
  const dismissIosBtn = $("btn-dismiss-ios-modal");

  function openIosModal() {
    if (iosModal) iosModal.style.display = "flex";
  }

  function closeIosModal() {
    if (iosModal) iosModal.style.display = "none";
  }

  if (closeIosBtn) closeIosBtn.addEventListener("click", closeIosModal);
  if (dismissIosBtn) dismissIosBtn.addEventListener("click", closeIosModal);
  if (iosModal) {
    iosModal.addEventListener("click", (e) => {
      if (e.target === iosModal) closeIosModal();
    });
  }

  // Trigger installation
  function triggerInstall() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === "accepted") {
          showToast("Installing App", "Jeev One is being added to your device.", "success");
        }
        deferredInstallPrompt = null;
        hideAllInstallPrompts();
      });
    } else if (isIOS) {
      openIosModal();
    } else {
      showToast(
        "Install Jeev One",
        "To install on mobile, tap your browser's menu (⋮ or Share) and choose 'Install App' or 'Add to Home screen'.",
        "info"
      );
    }
  }

  if (installBtnNav) installBtnNav.addEventListener("click", triggerInstall);
  if (installBtnSettings) installBtnSettings.addEventListener("click", triggerInstall);
  if (installBtnHeader) installBtnHeader.addEventListener("click", triggerInstall);
  if (btnBannerInstall) btnBannerInstall.addEventListener("click", triggerInstall);
  if (btnBannerDismiss) {
    btnBannerDismiss.addEventListener("click", () => {
      if (mobilePwaBanner) mobilePwaBanner.style.display = "none";
      try {
        sessionStorage.setItem("jeev_pwa_banner_dismissed", "true");
      } catch(e) {}
    });
  }

  const installBtnDrawer = $("mob-btn-install-pwa");
  if (installBtnDrawer) {
    installBtnDrawer.addEventListener("click", () => {
      triggerInstall();
      if (window.closeMobileDrawer) window.closeMobileDrawer();
    });
  }

  // Installed event
  window.addEventListener("appinstalled", () => {
    console.log("[PWA] Jeev One was installed successfully");
    deferredInstallPrompt = null;
    document.body.classList.add("pwa-standalone");
    hideAllInstallPrompts();
    if (pwaStatusBadge) {
      pwaStatusBadge.textContent = "STANDALONE ACTIVE";
      pwaStatusBadge.className = "status-badge normal";
    }
    showToast("Jeev One App Installed", "Launch anytime directly from your mobile home screen.", "success");
  });
}

// ── Mobile Navigation Drawer Controller ─────────────────────────────────────────
function initMobileNav() {
  const menuBtn = $("mobile-menu-btn");
  const drawer = $("mobile-nav-drawer");
  const backdrop = $("mobile-drawer-backdrop");
  const iconOpen = $("icon-menu-open");
  const iconClose = $("icon-menu-close");

  if (!menuBtn || !drawer) return;

  function openDrawer() {
    drawer.classList.add("open");
    if (backdrop) backdrop.classList.add("open");
    menuBtn.setAttribute("aria-expanded", "true");
    if (iconOpen) iconOpen.style.display = "none";
    if (iconClose) iconClose.style.display = "block";
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    if (backdrop) backdrop.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
    if (iconOpen) iconOpen.style.display = "block";
    if (iconClose) iconClose.style.display = "none";
  }

  window.closeMobileDrawer = closeDrawer;

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (drawer.classList.contains("open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (backdrop) {
    backdrop.addEventListener("click", closeDrawer);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) {
      closeDrawer();
    }
  });

  // Mobile drawer tabs: close drawer on click
  const drawerTabs = drawer.querySelectorAll("[data-tab]");
  drawerTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      closeDrawer();
    });
  });

  // Mobile drawer patient buttons
  const mobPatient1 = $("mob-patient-1");
  const mobPatient2 = $("mob-patient-2");
  if (mobPatient1) {
    mobPatient1.addEventListener("click", () => {
      selectUser("user_1", true);
      closeDrawer();
    });
  }
  if (mobPatient2) {
    mobPatient2.addEventListener("click", () => {
      selectUser("user_2", true);
      closeDrawer();
    });
  }
}

// Handle window resizing and orientation changes dynamically
window.addEventListener("resize", () => {
  if (gaugeChart) gaugeChart.resize();
  if (trendChart) trendChart.resize();
  const liveCanvas = $("live-ecg-canvas");
  if (liveCanvas && liveCanvas.parentElement) {
    const w = liveCanvas.parentElement.clientWidth;
    if (w > 0) {
      liveCanvas.width = w * (window.devicePixelRatio || 1);
    }
  }
});

// ── Session Auth Verification ────────────────────────────────────────────────
function checkAuthSession() {
  try {
    const isGuest = window.location.search.includes("guest=true");
    const session = sessionStorage.getItem("jeev_one_auth") || localStorage.getItem("jeev_one_auth");
    if (!session && !isGuest) {
      window.location.href = "/login?redirect=" + encodeURIComponent(window.location.pathname + window.location.search);
      return false;
    }
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed.userId && (parsed.userId === "user_1" || parsed.userId === "user_2")) {
        _activeUserId = parsed.userId;
      }
    }
  } catch (e) {}
  return true;
}

// ── Bento Shell Utility Controls (Share, Export) ─────────────────────────────
function initBentoShellControls() {

  // Hero "Share" button: share or copy friendly summary
  const shareBtn = $("btn-share-report");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const p = PROFILES[_activeUserId] || PROFILES.user_1;
      const r = window._latestReading || {};
      const status = (window._latestRisk && window._latestRisk.overall_status) || $("overall-status")?.textContent || "NORMAL";
      const summary = [
        `Jeev One Wellness Summary — ${p.name} (${p.role})`,
        `Overall Status: ${status}`,
        `Heart Rate: ${r.heart_rate ? fmt0(r.heart_rate) + " bpm" : $("val-hr")?.textContent + " bpm"}`,
        `Blood Pressure: ${(r.bp_sys && r.bp_dia) ? fmt0(r.bp_sys) + "/" + fmt0(r.bp_dia) + " mmHg" : ($("val-bp-sys")?.textContent + "/" + $("val-bp-dia")?.textContent + " mmHg")}`,
        `SpO2: ${r.spo2 ? fmt1(r.spo2) + "%" : $("val-spo2")?.textContent + "%"}`,
        `Body Temp: ${r.body_temperature ? fmt1(r.body_temperature) + " °C" : $("val-btemp")?.textContent + " °C"}`
      ].join("\n");

      if (navigator.share) {
        try {
          await navigator.share({ title: `Jeev One — ${p.name} Vitals`, text: summary });
          showToast("normal", "Wellness summary shared.");
          return;
        } catch (err) {
          if (err && err.name === "AbortError") return;
        }
      }
      try {
        await navigator.clipboard.writeText(summary);
        showToast("normal", "Wellness summary copied to clipboard.");
      } catch (err) {
        showToast("normal", summary.replace(/\n/g, " • "));
      }
    });
  }

  // Hero "Export" button: download JSON vitals snapshot
  const exportBtn = $("btn-export-vitals");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const p = PROFILES[_activeUserId] || PROFILES.user_1;
      const payload = {
        exported_at: new Date().toISOString(),
        patient: { id: p.id, name: p.name, role: p.role, device_id: p.device_id },
        latest_reading: window._latestReading || null,
        risk_assessment: window._latestRisk || null,
        baseline: window._baseline || p.baseline || null
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jeev_one_vitals_${p.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("normal", `Exported telemetry snapshot for ${p.name}.`);
    });
  }
}

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  if (!checkAuthSession()) return;
  injectIcons();
  
  const toastCloseBtn = $("toast-close");
  if (toastCloseBtn) {
    toastCloseBtn.addEventListener("click", dismissToast);
  }

  initTheme();
  initTabs();
  initBentoShellControls();
  initMobileNav();
  initPWA();
  initNotificationCenter();
  initDesktopPush();
  initAlarmSimulator();
  initUserSwitcher();
  initCharts();
  initLiveECG();
  initArchiveECG();
  initHealthReport();          // ← Health Report
  // Initialize Cloud Firestore Live Stream (Primary)
  const fbStarted = initFirestoreStream();

  // If Firebase not available on this client, fallback to local SSE/REST polling
  if (!fbStarted) {
    fetchBaseline();
    fetchHistory();
    fetchLatest();
    if (typeof EventSource !== "undefined") {
      startSSE();
    } else {
      startPolling();
    }
  }
});


/* ═══════════════════════════════════════════════════════════════════════════════
   HEALTH REPORT & PERSONALIZED GUIDANCE (v3.5 Clinical Bento System)
   ═══════════════════════════════════════════════════════════════════════════════ */

const _REPORT_STATUS_MAP = {
  NORMAL: { cls: "normal", label: "NORMAL" },
  WATCH:  { cls: "watch",  label: "WATCH"  },
  HIGH:   { cls: "high",   label: "HIGH"   },
};

const _REPORT_OVERALL_ICONS = {
  NORMAL: `<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>`,
  WATCH:  `<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>`,
  HIGH:   `<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>`,
};

const _REPORT_SNAPSHOT_STORAGE_KEY = "jeev_one_report_snapshots_v1";
const _MAX_REPORT_SNAPSHOTS = 5;

let _reportAutoRefreshTimer = null;
let _latestLiveReport = null;
let _viewingSnapshotIdx = -1;

function _setAllText(selector, text) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = text !== undefined && text !== null ? text : "";
  });
}

function _setAllHTML(selector, html) {
  document.querySelectorAll(selector).forEach((el) => {
    el.innerHTML = html !== undefined && html !== null ? html : "";
  });
}

function _setAllClass(selector, className) {
  document.querySelectorAll(selector).forEach((el) => {
    el.className = className;
  });
}

const REPORT_OBSERVATION_DURATION_MS = 60000;
const REPORT_INACTIVITY_THRESHOLD_MS = 6000;

let _reportObservation = {
  active: false,
  startTime: null,
  lastReadingTime: null,
  lastReading: null,
  lastRisk: null,
  inactivityTimer: null,
  waitTimer: null,
  tickerInterval: null,
  readingsStopped: false,
};

function _updateSessionStatusUI(text) {
  const el = $("report-session-status");
  if (el) el.textContent = text;
}

function scheduleHealthReportUpdate(latest, risk) {
  if (!latest) return;
  const now = Date.now();

  _reportObservation.lastReading = Object.assign({}, latest);
  _reportObservation.lastRisk = risk ? Object.assign({}, risk) : null;
  _reportObservation.lastReadingTime = now;
  window._latestReading = latest;
  window._latestRisk = risk;

  if (!_reportObservation.active) {
    _reportObservation.active = true;
    _reportObservation.startTime = now;
    _reportObservation.readingsStopped = false;

    if (_reportObservation.tickerInterval) clearInterval(_reportObservation.tickerInterval);
    _reportObservation.tickerInterval = setInterval(_onObservationTick, 1000);
    _onObservationTick();
  } else if (_reportObservation.readingsStopped) {
    _reportObservation.readingsStopped = false;
    if (_reportObservation.waitTimer) {
      clearTimeout(_reportObservation.waitTimer);
      _reportObservation.waitTimer = null;
    }
  }

  if (_reportObservation.inactivityTimer) {
    clearTimeout(_reportObservation.inactivityTimer);
  }
  _reportObservation.inactivityTimer = setTimeout(() => {
    _handleReadingsStopped();
  }, REPORT_INACTIVITY_THRESHOLD_MS);
}

function _onObservationTick() {
  if (!_reportObservation.active || !_reportObservation.startTime) return;
  const elapsed = Date.now() - _reportObservation.startTime;

  if (_reportObservation.readingsStopped) {
    if (elapsed < REPORT_OBSERVATION_DURATION_MS) {
      const waitRemaining = Math.max(0, Math.ceil((REPORT_OBSERVATION_DURATION_MS - elapsed) / 1000));
      _updateSessionStatusUI(`Readings stopped. Finalizing clinical report in ${waitRemaining}s…`);
    } else {
      _updateSessionStatusUI("Finalizing clinical health report with latest telemetry…");
    }
  } else {
    const secElapsed = Math.floor(elapsed / 1000);
    if (elapsed < REPORT_OBSERVATION_DURATION_MS) {
      _updateSessionStatusUI(`Recording session telemetry (${secElapsed}s / 60s) • Report updates on completion`);
    } else {
      _updateSessionStatusUI(`Recording session telemetry (${secElapsed}s) • Ready when packet window completes`);
    }
  }
}

function _handleReadingsStopped() {
  if (!_reportObservation.active) return;
  _reportObservation.readingsStopped = true;

  const elapsed = Date.now() - _reportObservation.startTime;
  if (elapsed >= REPORT_OBSERVATION_DURATION_MS) {
    _finalizeReportSession("1-minute observation duration met and readings stopped.");
  } else {
    const remainingMs = REPORT_OBSERVATION_DURATION_MS - elapsed;
    _updateSessionStatusUI(`Readings stopped. Creating report in ${Math.ceil(remainingMs / 1000)}s…`);
    if (_reportObservation.waitTimer) clearTimeout(_reportObservation.waitTimer);
    _reportObservation.waitTimer = setTimeout(() => {
      _finalizeReportSession("1-minute wait finished; readings remained stopped.");
    }, remainingMs);
  }
}

function _finalizeReportSession(reason) {
  if (!_reportObservation.active) return;
  _reportObservation.active = false;

  if (_reportObservation.inactivityTimer) {
    clearTimeout(_reportObservation.inactivityTimer);
    _reportObservation.inactivityTimer = null;
  }
  if (_reportObservation.waitTimer) {
    clearTimeout(_reportObservation.waitTimer);
    _reportObservation.waitTimer = null;
  }
  if (_reportObservation.tickerInterval) {
    clearInterval(_reportObservation.tickerInterval);
    _reportObservation.tickerInterval = null;
  }

  const readingToUse = _reportObservation.lastReading || window._latestReading;
  const riskToUse = _reportObservation.lastRisk || window._latestRisk;

  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  _updateSessionStatusUI(`Report finalized with latest session telemetry (${timeStr})`);

  _viewingSnapshotIdx = -1;
  fetchReport(false, readingToUse, riskToUse, true);
}

function initHealthReport() {
  const refreshBtn = $("btn-refresh-report");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      _viewingSnapshotIdx = -1;
      if (_reportObservation.active) {
        _finalizeReportSession("Manual refresh requested");
      } else {
        fetchReport(true, _reportObservation.lastReading || window._latestReading, _reportObservation.lastRisk || window._latestRisk, true);
      }
    });
  }

  const exportBtn = $("btn-export-report");
  if (exportBtn) {
    exportBtn.addEventListener("click", _exportHealthReportSummary);
  }

  const liveViewBtn = $("btn-report-live-view");
  if (liveViewBtn) {
    liveViewBtn.addEventListener("click", () => {
      _viewingSnapshotIdx = -1;
      if (_latestLiveReport) {
        renderReport(_latestLiveReport, false);
      } else {
        fetchReport(false);
      }
    });
  }

  const histList = $("report-history-list");
  if (histList) {
    histList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-snap-idx]");
      if (!btn) return;
      const idx = Number(btn.getAttribute("data-snap-idx"));
      const snaps = _loadReportSnapshots();
      if (!isNaN(idx) && snaps[idx] && snaps[idx].report) {
        _viewingSnapshotIdx = idx;
        renderReport(snaps[idx].report, true, snaps[idx]);
      }
    });
  }

  document.addEventListener("tab:changed", (e) => {
    if (e.detail && (e.detail.tab === "live" || e.detail.tab === "report")) {
      if (!_reportObservation.active && _viewingSnapshotIdx < 0) {
        fetchReport(false, _reportObservation.lastReading || window._latestReading, _reportObservation.lastRisk || window._latestRisk, false);
      }
      _renderReportSnapshotStrip();
      _startReportAutoRefresh();
    } else {
      _stopReportAutoRefresh();
    }
  });

  fetchReport(false, null, null, false);
}

function _startReportAutoRefresh() {
  _stopReportAutoRefresh();
  _reportAutoRefreshTimer = setInterval(() => {
    if (!_reportObservation.active && _viewingSnapshotIdx < 0) {
      fetchReport(false, _reportObservation.lastReading || window._latestReading, _reportObservation.lastRisk || window._latestRisk, false);
    }
  }, 60000);
}

function _stopReportAutoRefresh() {
  if (_reportAutoRefreshTimer) {
    clearInterval(_reportAutoRefreshTimer);
    _reportAutoRefreshTimer = null;
  }
}

function fetchReport(showSpinner = false, readingToUse = null, riskToUse = null, saveSnapshot = false) {
  const grid = $("report-findings-grid");
  if (!grid) return;

  const reading = readingToUse || _reportObservation.lastReading || window._latestReading;
  const risk = riskToUse || _reportObservation.lastRisk || window._latestRisk;
  const activeProfile = (typeof PROFILES !== "undefined" && PROFILES[_activeUserId]) ? PROFILES[_activeUserId] : null;
  const activeBaseline = window._baseline || (activeProfile ? activeProfile.baseline : null);

  if (showSpinner) {
    grid.innerHTML = Array(5).fill('<div class="report-finding-skeleton"></div>').join("");
    _setAllText("#report-overall-headline", "Loading…");
    _setAllText("#report-overall-summary", "Evaluating latest telemetry against clinical rules…");
  }

  const prEl = $("ecg-metric-pr");
  const qrsEl = $("ecg-metric-qrs");
  const qtcEl = $("ecg-metric-qtc");
  const rhythmEl = $("ecg-live-rhythm-badge");
  const leadPill = $("ecg-lead-status-pill");

  let ecgData = null;
  const isLeadsOff = leadPill && (leadPill.textContent.toLowerCase().includes("off") || leadPill.textContent.toLowerCase().includes("detached"));
  if (isLeadsOff) {
    ecgData = { leads_off: true };
  } else if (prEl || qrsEl || rhythmEl) {
    ecgData = {
      leads_off: false,
      rhythm: rhythmEl ? rhythmEl.textContent.trim() : "Normal Sinus Rhythm",
      pr: prEl ? prEl.textContent.trim() + " ms" : "156 ms",
      qrs: qrsEl ? qrsEl.textContent.trim() + " ms" : "88 ms",
      qtc: qtcEl ? qtcEl.textContent.trim() + " ms" : "410 ms",
      lead_quality: leadPill ? leadPill.textContent.trim() : "98% (Good Signal)",
      hr: reading && reading.heart_rate ? String(reading.heart_rate) : undefined
    };
  }

  const postBody = {
    reading: reading || null,
    risk: risk || null,
    ecg_data: ecgData,
    baseline: activeBaseline || null,
    patient: activeProfile ? {
      name: activeProfile.name,
      role: activeProfile.role,
      demographics: activeProfile.demographics,
      device_id: activeProfile.device_id
    } : null
  };

  fetch("/api/report/latest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(postBody)
  })
    .then((r) => r.json())
    .then((data) => {
      if (data.status === "no_data" || !data.report) {
        if (reading) {
          _renderClientReportFromReading(reading, risk, saveSnapshot);
        } else {
          _renderReportNoData();
        }
        return;
      }
      _latestLiveReport = data.report;
      if (saveSnapshot || !_loadReportSnapshots().length) {
        _saveReportSnapshot(data.report, reading);
      }
      if (_viewingSnapshotIdx < 0) {
        renderReport(data.report, false);
      }
    })
    .catch((err) => {
      console.warn("[HealthReport] fetch error, using client fallback:", err);
      if (reading) {
        _renderClientReportFromReading(reading, risk, saveSnapshot);
      } else {
        _renderReportNoData("Unable to load report. Check server connection.");
      }
    });
}

function renderReport(report, isSnapshotPreview = false, snapMeta = null) {
  if (!report) return;
  window._activeHealthReport = report;

  const status = report.overall_status || "NORMAL";
  const statusCls = (_REPORT_STATUS_MAP[status] || _REPORT_STATUS_MAP.NORMAL).cls;
  const badgeLabel = (_REPORT_STATUS_MAP[status] || _REPORT_STATUS_MAP.NORMAL).label;
  const ws = report.wellness_score || {};
  const meta = report.report_meta || {};

  // ── Patient Hero Context ───────────────────────────────────────────────────
  const patNameEl = $("report-patient-name");
  const patMetaEl = $("report-patient-meta");
  const activeProf = (typeof PROFILES !== "undefined" && PROFILES[_activeUserId]) ? PROFILES[_activeUserId] : null;
  if (patNameEl) patNameEl.textContent = meta.patient_name || (activeProf ? activeProf.name : "Patient");
  if (patMetaEl) {
    const devLabel = meta.device_id || (activeProf ? activeProf.device_id : "patient_01");
    const roleLabel = meta.patient_role || (activeProf ? activeProf.role : "Subject");
    patMetaEl.textContent = `${roleLabel} • ${devLabel} • Clinical Rules Engine`;
  }

  // ── Overall Banner ─────────────────────────────────────────────────────────
  _setAllClass("#report-overall-banner", `report-overall-banner status-${statusCls}`);
  _setAllClass("#report-overall-indicator", `report-overall-indicator status-${statusCls}`);
  if (_REPORT_OVERALL_ICONS[status]) {
    _setAllHTML("#report-overall-icon", _REPORT_OVERALL_ICONS[status]);
  }
  _setAllText("#report-overall-headline", report.overall_headline || "");
  _setAllText("#report-overall-summary", report.overall_summary || "");
  const coverageBadge = $("report-coverage-badge");
  if (coverageBadge) {
    const act = ws.active_sensors !== undefined ? ws.active_sensors : 5;
    const tot = ws.total_sensors !== undefined ? ws.total_sensors : 6;
    coverageBadge.textContent = `${act} / ${tot} Active Sensors`;
  }
  const overallBadge = $("report-overall-badge");
  if (overallBadge) {
    overallBadge.textContent = badgeLabel;
    overallBadge.className = `status-badge ${statusCls === "normal" ? "normal" : statusCls === "watch" ? "warning" : "danger"} report-overall-badge`;
  }

  // ── Triage Box ─────────────────────────────────────────────────────────────
  const nextStep = report.next_step;
  if (nextStep) {
    const catMap = {
      ROUTINE_MONITORING: "triage-routine",
      RECHECK_OR_ADVICE:  "triage-recheck",
      URGENT_ATTENTION:   "triage-urgent",
    };
    const triageCls = catMap[nextStep.category] || "triage-routine";
    _setAllClass("#report-next-steps-card", `report-next-steps-card ${triageCls}`);
    _setAllText("#report-triage-badge", nextStep.badge_label || "ROUTINE MONITORING");
    _setAllText("#report-triage-headline", nextStep.headline || "");
    _setAllText("#report-triage-action", nextStep.action || "");
    if (nextStep.red_flags) {
      _setAllText("#report-red-flags-text", nextStep.red_flags);
    }
  }

  // ── Wellness Readiness Score Ring & Components ─────────────────────────────
  const scoreVal = typeof ws.score === "number" ? Math.max(0, Math.min(100, ws.score)) : 90;
  const scoreLabel = ws.label || (scoreVal >= 82 ? "Optimal" : scoreVal >= 60 ? "Moderate Strain" : "High Strain");
  const comp = ws.components || {};
  const cardioScore = typeof comp.cardiovascular === "number" ? comp.cardiovascular : scoreVal;
  const oxyScore = typeof comp.oxygenation === "number" ? comp.oxygenation : scoreVal;
  const thermScore = typeof comp.thermal === "number" ? comp.thermal : scoreVal;

  _setAllText("#report-score-num", String(scoreVal));
  _setAllText("#report-score-completeness", `Sensor Coverage: ${ws.completeness_pct !== undefined ? ws.completeness_pct : 83}% (${ws.active_sensors || 5}/${ws.total_sensors || 6})`);
  const tierEl = $("report-score-label");
  if (tierEl) {
    tierEl.textContent = scoreLabel;
    tierEl.className = `report-score-tier-badge ${scoreVal >= 82 ? "tier-optimal" : scoreVal >= 60 ? "tier-moderate" : "tier-strain"}`;
  }

  const ringEl = $("report-score-ring");
  if (ringEl) {
    const circumference = 301.59;
    const offset = circumference * (1 - scoreVal / 100);
    ringEl.style.strokeDashoffset = String(offset.toFixed(2));
    ringEl.style.stroke = scoreVal >= 82 ? "#16A34A" : scoreVal >= 60 ? "#D97706" : "#DC2626";
  }

  _setAllText("#report-comp-cardio-val", `${cardioScore}/100`);
  _setAllText("#report-comp-oxy-val", `${oxyScore}/100`);
  _setAllText("#report-comp-therm-val", `${thermScore}/100`);
  const cBar = $("report-comp-cardio-bar");
  const oBar = $("report-comp-oxy-bar");
  const tBar = $("report-comp-therm-bar");
  if (cBar) cBar.style.width = `${cardioScore}%`;
  if (oBar) oBar.style.width = `${oxyScore}%`;
  if (tBar) tBar.style.width = `${thermScore}%`;

  const noteList = Array.isArray(ws.standby_notes) && ws.standby_notes.length
    ? ws.standby_notes.join(" ")
    : "All active continuous and spot-check sensors contributing normally.";
  _setAllText("#report-score-standby-note", noteList);

  // ── Subsystem Analytics Row (Row 3) ────────────────────────────────────────
  const sub = report.subsystem_summary || {};
  const cardioSub = sub.cardiovascular || {};
  const respSub = sub.respiratory || {};
  const thermSub = sub.thermal || {};

  const cardioBadge = $("report-sub-cardio-badge");
  if (cardioBadge) {
    const cst = cardioSub.status || "ok";
    cardioBadge.textContent = cst === "alert" ? "HIGH RISK" : cst === "watch" ? "WATCH" : "STABLE";
    cardioBadge.className = `report-sub-badge status-${cst}`;
  }
  _setAllText("#report-sub-hr", cardioSub.hr_bpm ? `${cardioSub.hr_bpm} bpm` : "— bpm");
  _setAllText("#report-sub-hr-delta", cardioSub.hr_delta_text || "Resting pulse stability");
  _setAllText("#report-sub-bp", cardioSub.bp_text || "Cuff Standby");
  _setAllText("#report-sub-map", cardioSub.map_mmhg ? `${cardioSub.map_mmhg} mmHg` : "Standby");
  _setAllText("#report-sub-pp", cardioSub.pulse_pressure_mmhg ? `${cardioSub.pulse_pressure_mmhg} mmHg` : "Standby");
  _setAllText("#report-sub-cardio-note", cardioSub.summary || "Continuous pulse and arterial tone tracking.");

  const respBadge = $("report-sub-resp-badge");
  if (respBadge) {
    const rst = respSub.status || "ok";
    respBadge.textContent = rst === "alert" ? "LOW SPO2" : rst === "watch" ? "WATCH" : "OPTIMAL";
    respBadge.className = `report-sub-badge status-${rst}`;
  }
  _setAllText("#report-sub-spo2", respSub.spo2_pct ? `${respSub.spo2_pct.toFixed(1)}%` : "—%");
  _setAllText("#report-sub-spo2-delta", respSub.spo2_delta_text || "Steady oxygen saturation");
  _setAllText("#report-sub-resp-risk", respSub.risk_level || "NORMAL");
  _setAllText("#report-sub-margin-opt", respSub.margin_optimal !== undefined && respSub.margin_optimal !== null ? `${respSub.margin_optimal >= 0 ? "+" : ""}${respSub.margin_optimal.toFixed(1)}%` : "—");
  _setAllText("#report-sub-margin-crit", respSub.margin_critical !== undefined && respSub.margin_critical !== null ? `${respSub.margin_critical >= 0 ? "+" : ""}${respSub.margin_critical.toFixed(1)}%` : "—");
  _setAllText("#report-sub-resp-note", respSub.summary || "Safe oxygenation headroom verified.");

  const thermBadge = $("report-sub-thermal-badge");
  if (thermBadge) {
    const tst = thermSub.status || "ok";
    thermBadge.textContent = thermSub.comfort_band || (tst === "ok" ? "COMFORTABLE" : "WATCH");
    thermBadge.className = `report-sub-badge status-${tst}`;
  }
  _setAllText("#report-sub-btemp", thermSub.body_temp_c ? `${thermSub.body_temp_c.toFixed(1)} °C` : "— °C");
  _setAllText("#report-sub-btemp-delta", thermSub.temp_delta_text || "Normal thermoregulation");
  _setAllText("#report-sub-room", thermSub.room_temp_c !== undefined ? `${thermSub.room_temp_c.toFixed(1)} °C / ${thermSub.humidity_pct || 0}%` : "— °C");
  _setAllText("#report-sub-heat-index", thermSub.heat_index_c !== undefined ? `${thermSub.heat_index_c.toFixed(1)} °C` : "— °C");
  _setAllText("#report-sub-strain", thermSub.strain_score !== undefined ? `${Number(thermSub.strain_score).toFixed(0)} / 100` : "0 / 100");
  _setAllText("#report-sub-thermal-note", thermSub.summary || "Ambient heat index within comfortable threshold.");

  // ── ECG Interpretation Card (Non-Duplicated Intervals) ─────────────────────
  const ecg = report.ecg_interpretation;
  if (ecg) {
    const st = ecg.status || "ok";
    _setAllClass("#report-ecg-card", `card col-7 report-ecg-card status-${st}`);
    _setAllClass("#report-ecg-icon", `report-ecg-icon status-${st}`);
    const ecgBadge = $("report-ecg-badge");
    if (ecgBadge) {
      ecgBadge.textContent = ecg.headline || "NORMAL SINUS RHYTHM";
      ecgBadge.className = `status-badge ${st === "ok" ? "normal" : st === "watch" ? "warning" : "danger"} report-ecg-badge`;
    }
    _setAllText("#report-ecg-quality", ecg.lead_quality || "98% (Good Signal)");
    _setAllText("#report-ecg-summary", ecg.summary || "");

    const prVal = ecg.pr_value || (ecg.pr_interval ? ecg.pr_interval.split(" (")[0] : "- ms");
    const qrsVal = ecg.qrs_value || (ecg.qrs_duration ? ecg.qrs_duration.split(" (")[0] : "- ms");
    const qtcVal = ecg.qtc_value || (ecg.qtc_interval ? ecg.qtc_interval.split(" (")[0] : "- ms");
    _setAllText("#report-ecg-pr", prVal);
    _setAllText("#report-ecg-qrs", qrsVal);
    _setAllText("#report-ecg-qtc", qtcVal);
    _setAllText("#report-ecg-pr-norm", `Norm: ${ecg.pr_norm || "120–200 ms"}`);
    _setAllText("#report-ecg-qrs-norm", `Norm: ${ecg.qrs_norm || "60–100 ms"}`);
    _setAllText("#report-ecg-qtc-norm", `Norm: ${ecg.qtc_norm || "< 440 ms"}`);

    const rhyEl = $("report-ecg-rhythm");
    if (rhyEl) {
      rhyEl.textContent = ecg.rhythm || "Sinus";
      rhyEl.style.color = st === "ok" ? "#16A34A" : st === "watch" ? "#D97706" : "#DC2626";
    }
    if (ecg.clinical_limitation) {
      _setAllText("#report-ecg-limitation-text", ecg.clinical_limitation);
    }
  }

  // ── Individual Parameter Finding Cards (Row 4) ─────────────────────────────
  if (Array.isArray(report.findings)) {
    const cardsHtml = report.findings.map((f) => _buildFindingCard(f)).join("");
    _setAllHTML("#report-findings-grid", cardsHtml);
  }

  // ── Categorized Lifestyle Guidance Cards (Row 5B) ──────────────────────────
  const structuredTips = Array.isArray(report.structured_tips) && report.structured_tips.length
    ? report.structured_tips
    : (Array.isArray(report.lifestyle_tips)
        ? report.lifestyle_tips.map((t, idx) => ({
            category: idx === 0 ? "Daily Care" : "Wellness",
            icon: idx === 0 ? "shield" : "heart",
            title: "Recommended Action",
            detail: t,
            priority: "normal",
          }))
        : []);
  const tipsHtml = structuredTips.map((item) => _buildTipCard(item)).join("");
  _setAllHTML("#report-tips-list", tipsHtml);

  // ── Snapshot History Banner State & Disclaimer ─────────────────────────────
  const histBadge = $("report-history-mode-badge");
  const liveBtn = $("btn-report-live-view");
  if (isSnapshotPreview && snapMeta) {
    if (histBadge) histBadge.textContent = `Viewing Saved Snapshot (${snapMeta.timeLabel}) • Read-Only Archive`;
    if (liveBtn) liveBtn.style.display = "inline-flex";
  } else {
    if (histBadge) histBadge.textContent = "Live Telemetry Report • Last 5 finalized snapshots saved per device";
    if (liveBtn) liveBtn.style.display = "none";
  }
  _renderReportSnapshotStrip();

  if (report.disclaimer) {
    _setAllText("#report-disclaimer-text", report.disclaimer);
  }
}

function _buildFindingCard(f) {
  const st = f.status || "ok";
  const accent = f.accent ? `accent-${f.accent}` : "accent-neutral";
  const icon = ICONS.html(f.icon || "heart", "");
  const normTxt = f.normal_range ? _escapeHtml(f.normal_range) : "";

  let rangeHtml = "";
  if (f.range_pct !== null && f.range_pct !== undefined && f.safe_start_pct !== null && f.safe_end_pct !== null) {
    const safeLeft = Math.max(0, Math.min(100, Number(f.safe_start_pct)));
    const safeWidth = Math.max(5, Math.min(100 - safeLeft, Number(f.safe_end_pct) - safeLeft));
    const markerPct = Math.max(3, Math.min(97, Number(f.range_pct)));
    rangeHtml = `
      <div class="finding-range-wrap" title="Healthy zone ${normTxt}">
        <div class="finding-range-track">
          <div class="finding-range-safe" style="left:${safeLeft}%; width:${safeWidth}%;"></div>
          <div class="finding-range-marker status-${st}" style="left:${markerPct}%;"></div>
        </div>
      </div>`;
  } else {
    rangeHtml = `<div class="finding-standby-bar">Standby — Connect probe/cuff for measurement</div>`;
  }

  const deltaHtml = f.delta_text
    ? `<div class="report-finding-delta">${_escapeHtml(f.delta_text)}</div>`
    : "";

  return `
    <div class="report-finding-card status-${st} ${accent}">
      <div>
        <div class="report-finding-top">
          <div class="report-finding-icon status-${st}">${icon}</div>
          <span class="report-finding-pill status-${st}">${_escapeHtml(f.headline)}</span>
        </div>
        <div class="report-finding-meta-row" style="margin-top:0.42rem;">
          <div class="report-finding-param">${_escapeHtml(f.parameter)}</div>
          <div class="report-finding-norm">${normTxt}</div>
        </div>
        <div class="report-finding-value">${_escapeHtml(f.value)}</div>
        ${rangeHtml}
        ${deltaHtml}
      </div>
      <div class="report-finding-detail">${_escapeHtml(f.detail)}</div>
    </div>`;
}

function _buildTipCard(item) {
  const iconHtml = ICONS.html(item.icon || "heart", "");
  const priCls = item.priority === "high" ? "priority-high" : "";
  return `
    <li class="report-tip-card ${priCls}">
      <div class="report-tip-icon">${iconHtml}</div>
      <div class="report-tip-content">
        <div class="report-tip-cat-row">
          <span class="report-tip-cat">${_escapeHtml(item.category || "WELLNESS")}</span>
        </div>
        <div class="report-tip-title">${_escapeHtml(item.title || "Action Step")}</div>
        <div class="report-tip-detail">${_escapeHtml(item.detail || "")}</div>
      </div>
    </li>`;
}

function _renderReportNoData(msg) {
  _setAllText("#report-overall-headline", "Waiting for Data");
  _setAllText("#report-overall-summary", msg || "No sensor data has been received yet. Start the ESP32 device or use the simulator.");
  const placeholder = `
    <div class="report-finding-card status-inconclusive" style="grid-column:1/-1; text-align:center; padding:2rem;">
      <div class="report-finding-param" style="text-align:center;">No readings available</div>
      <div class="report-finding-detail" style="text-align:center; margin-top:0.5rem;">
        Send a telemetry packet to the backend and click Refresh.
      </div>
    </div>`;
  _setAllHTML("#report-findings-grid", placeholder);
}

function _escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _getActiveDeviceIdForReport() {
  return (typeof PROFILES !== "undefined" && PROFILES[_activeUserId])
    ? PROFILES[_activeUserId].device_id
    : "patient_01";
}

function _loadReportSnapshots() {
  try {
    const raw = localStorage.getItem(_REPORT_SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const devId = _getActiveDeviceIdForReport();
    return Array.isArray(parsed[devId]) ? parsed[devId] : [];
  } catch (_) {
    return [];
  }
}

function _saveReportSnapshot(report, reading) {
  if (!report) return;
  try {
    const raw = localStorage.getItem(_REPORT_SNAPSHOT_STORAGE_KEY);
    const store = raw ? JSON.parse(raw) : {};
    const devId = _getActiveDeviceIdForReport();
    const list = Array.isArray(store[devId]) ? store[devId] : [];
    const now = new Date();
    const timeLabel = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const score = report.wellness_score && typeof report.wellness_score.score === "number"
      ? report.wellness_score.score
      : 90;
    const hrVal = reading && reading.heart_rate ? `${Math.round(reading.heart_rate)} bpm` : "—";
    const spo2Val = reading && reading.spo2 ? `${Number(reading.spo2).toFixed(1)}%` : "—";

    list.unshift({
      timeLabel,
      savedAt: now.toISOString(),
      status: report.overall_status || "NORMAL",
      score,
      vitalsShort: `HR ${hrVal} • SpO2 ${spo2Val}`,
      report,
    });

    store[devId] = list.slice(0, _MAX_REPORT_SNAPSHOTS);
    localStorage.setItem(_REPORT_SNAPSHOT_STORAGE_KEY, JSON.stringify(store));
  } catch (_) {}
}

function _renderReportSnapshotStrip() {
  const host = $("report-history-list");
  if (!host) return;
  const snaps = _loadReportSnapshots();
  if (!snaps.length) {
    host.innerHTML = `<div class="report-history-empty">Report snapshots will appear here as evaluations finalize during your session.</div>`;
    return;
  }

  host.innerHTML = snaps.map((s, idx) => {
    const activeCls = idx === _viewingSnapshotIdx ? "active-snapshot" : "";
    const stCls = (s.status || "NORMAL").toLowerCase();
    return `
      <button type="button" class="report-history-item ${activeCls}" data-snap-idx="${idx}">
        <div class="snapshot-top-row">
          <span class="snapshot-time">${_escapeHtml(s.timeLabel)}</span>
          <span class="snapshot-score">${_escapeHtml(String(s.score))}/100</span>
        </div>
        <div class="snapshot-status-line">
          <span class="status-badge ${stCls === "high" ? "danger" : stCls === "watch" ? "warning" : "normal"}" style="font-size:0.6rem; padding:1px 6px;">${_escapeHtml(s.status)}</span>
        </div>
        <div class="snapshot-vitals-line">${_escapeHtml(s.vitalsShort || "")}</div>
      </button>`;
  }).join("");
}

function _exportHealthReportSummary() {
  const report = window._activeHealthReport;
  if (!report) {
    showToast("watch", "Report is still loading — wait a moment before exporting.");
    return;
  }
  const p = (typeof PROFILES !== "undefined" && PROFILES[_activeUserId]) ? PROFILES[_activeUserId] : { name: "Patient", role: "Subject", device_id: "patient_01" };
  const ws = report.wellness_score || {};
  const sub = report.subsystem_summary || {};
  const lines = [
    "================================================================",
    `JEEV ONE — CLINICAL WELLNESS & TELEMETRY REPORT`,
    `Generated: ${new Date().toLocaleString()}`,
    `Patient:   ${p.name} (${p.role}) | Device: ${p.device_id}`,
    "================================================================",
    "",
    `OVERALL STATUS:     ${report.overall_status} — ${report.overall_headline}`,
    `WELLNESS READINESS: ${ws.score !== undefined ? ws.score : "--"} / 100 (${ws.label || "Optimal"})`,
    `SENSOR COVERAGE:    ${ws.active_sensors || 5} / ${ws.total_sensors || 6} active sensors`,
    "",
    `Summary: ${report.overall_summary}`,
    "",
    `ACTION GUIDANCE (${report.next_step ? report.next_step.badge_label : "ROUTINE"}):`,
    `  ${report.next_step ? report.next_step.headline : ""}`,
    `  ${report.next_step ? report.next_step.action : ""}`,
    `  Precaution: ${report.next_step ? report.next_step.red_flags : ""}`,
    "",
    "SUBSYSTEM ANALYTICS:",
    `  * Cardiovascular: HR ${sub.cardiovascular ? (sub.cardiovascular.hr_bpm || "--") : "--"} bpm | BP ${sub.cardiovascular ? sub.cardiovascular.bp_text : "Standby"} | ${sub.cardiovascular ? sub.cardiovascular.summary : ""}`,
    `  * Respiratory:    SpO2 ${sub.respiratory ? (sub.respiratory.spo2_pct || "--") : "--"}% | ${sub.respiratory ? sub.respiratory.summary : ""}`,
    `  * Thermal/Heat:   ${sub.thermal ? sub.thermal.summary : ""}`,
    "",
    "VITAL PARAMETER FINDINGS:",
    ...(Array.isArray(report.findings) ? report.findings.map(f => `  - ${f.parameter}: ${f.value} [${f.headline}] (${f.delta_text || f.normal_range || ""})\n    ${f.detail}`) : []),
    "",
    "LEAD I ECG INTERPRETATION:",
    `  Rhythm:   ${report.ecg_interpretation ? report.ecg_interpretation.rhythm : "--"}`,
    `  PR / QRS / QTc: ${report.ecg_interpretation ? (report.ecg_interpretation.pr_value || report.ecg_interpretation.pr_interval) : "--"} / ${report.ecg_interpretation ? (report.ecg_interpretation.qrs_value || report.ecg_interpretation.qrs_duration) : "--"} / ${report.ecg_interpretation ? (report.ecg_interpretation.qtc_value || report.ecg_interpretation.qtc_interval) : "--"}`,
    `  Notes:    ${report.ecg_interpretation ? report.ecg_interpretation.summary : ""}`,
    "",
    "PERSONALIZED ACTION PLAN:",
    ...(Array.isArray(report.lifestyle_tips) ? report.lifestyle_tips.map((t, i) => `  ${i + 1}. ${t}`) : []),
    "",
    "DISCLAIMER:",
    report.disclaimer || ""
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jeev_one_health_report_${p.name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast("NORMAL", `Clinical health report downloaded for ${p.name}.`);
}

function _computeClientHeatIndex(tempC, hum) {
  if (tempC < 27.0) return Number(tempC.toFixed(1));
  const t = tempC;
  const r = hum;
  const hi = (
    -8.78469475556 +
    1.61139411 * t +
    2.33854883889 * r -
    0.14611605 * t * r -
    0.012308094 * t * t -
    0.016424828 * r * r +
    0.002211732 * t * t * r +
    0.00072546 * t * r * r -
    0.000003582 * t * t * r * r
  );
  return Number(hi.toFixed(1));
}

function _computeClientStrain(hr, hrBase, temp, tempBase, spo2) {
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const hrS = clamp01((hr - hrBase) / 40.0);
  const tempS = clamp01((temp - tempBase) / 2.0);
  const spo2S = clamp01((100.0 - spo2) / 10.0);
  return Math.round((hrS * 0.4 + tempS * 0.4 + spo2S * 0.2) * 100);
}

/**
 * Full client-side evaluation fallback guaranteeing visual & analytical parity
 * even in pure Firebase/offline PWA mode without a Flask server.
 */
function _renderClientReportFromReading(reading, risk, saveSnapshot = false) {
  if (!reading) return;

  const hr = Number(reading.heart_rate) || 0;
  const spo2 = Number(reading.spo2) || 0;
  const temp = Number(reading.body_temperature) || 0;
  const sys = Number(reading.bp_sys) || 0;
  const dia = Number(reading.bp_dia) || 0;
  const rtemp = Number(reading.room_temperature) || 0;
  const hum = Number(reading.humidity) || 0;

  const prof = (typeof PROFILES !== "undefined" && PROFILES[_activeUserId]) ? PROFILES[_activeUserId] : null;
  const bl = window._baseline || (prof ? prof.baseline : {}) || {};
  const hrBase = Number(bl.heart_rate) || 74;
  const spo2Base = Number(bl.spo2) || 98.0;
  const tempBase = Number(bl.body_temperature) || 36.6;

  const scalePct = (val, lo, hi) => Number(Math.max(0, Math.min(100, ((val - lo) / (hi - lo)) * 100)).toFixed(1));
  const deltaTxt = (val, base, dec, unit, tol) => {
    if (!base || base <= 0 || val <= 0) return "";
    const diff = val - base;
    if (Math.abs(diff) < tol) return "At personal baseline";
    const s = diff > 0 ? "+" : "";
    const suffix = unit === "%" ? "%" : ` ${unit}`;
    return `${s}${diff.toFixed(dec)}${suffix} vs baseline (${base.toFixed(dec)}${suffix})`;
  };

  const heatIdx = _computeClientHeatIndex(rtemp, hum);
  const strain = _computeClientStrain(hr || hrBase, hrBase, temp || tempBase, tempBase, spo2 || spo2Base);

  const findings = [];

  // 1. Heart Rate
  if (hr <= 0) {
    findings.push({ parameter: "Heart Rate", value: "- bpm", status: "inconclusive", headline: "No Signal", detail: "Heart rate sensor probe not connected.", icon: "heart", normal_range: "60–100 bpm", accent: "neutral", delta_text: "Awaiting pulse lock", range_pct: null, safe_start_pct: 25, safe_end_pct: 58.3 });
  } else {
    const hrSt = (hr >= 120 || hr <= 40) ? "alert" : ((hr >= 100 || hr <= 60) ? "watch" : "ok");
    const hrHead = hr >= 120 ? "Very Elevated" : hr >= 100 ? "Slightly Elevated" : hr <= 40 ? "Very Low" : hr <= 60 ? "Below Normal" : "Normal";
    findings.push({
      parameter: "Heart Rate", value: `${Math.round(hr)} bpm`, status: hrSt, headline: hrHead,
      detail: hrSt === "ok" ? `Heart rate is ${Math.round(hr)} bpm, within the healthy resting range of 60-100 bpm.` : `Heart rate is ${Math.round(hr)} bpm, outside typical resting limits (60-100 bpm). Rest and monitor.`,
      icon: "heart", normal_range: "60–100 bpm", accent: "coral",
      delta_text: deltaTxt(hr, hrBase, 0, "bpm", 1) || "Resting corridor",
      range_pct: scalePct(hr, 30, 150), safe_start_pct: 25, safe_end_pct: 58.3
    });
  }

  // 2. SpO2
  if (spo2 <= 0) {
    findings.push({ parameter: "Blood Oxygen (SpO2)", value: "-%", status: "inconclusive", headline: "No Signal", detail: "SpO2 sensor probe not connected.", icon: "droplet", normal_range: "95–100%", accent: "neutral", delta_text: "Awaiting probe", range_pct: null, safe_start_pct: 66.7, safe_end_pct: 100 });
  } else {
    const sSt = spo2 < 90 ? "alert" : (spo2 < 95 ? "watch" : "ok");
    findings.push({
      parameter: "Blood Oxygen (SpO2)", value: `${spo2.toFixed(1)}%`, status: sSt, headline: spo2 < 90 ? "Critically Low" : (spo2 < 95 ? "Slightly Low" : "Normal"),
      detail: sSt === "ok" ? `Blood oxygen saturation is ${spo2.toFixed(1)}%, indicating effective oxygenation.` : `SpO2 is ${spo2.toFixed(1)}%, below >=95%. Sit upright in fresh air and recheck.`,
      icon: "droplet", normal_range: "95–100%", accent: "sky",
      delta_text: deltaTxt(spo2, spo2Base, 1, "%", 0.2) || `${(spo2 - 95).toFixed(1)}% reserve`,
      range_pct: scalePct(spo2, 85, 100), safe_start_pct: 66.7, safe_end_pct: 100
    });
  }

  // 3. Body Temp
  if (temp <= 0) {
    findings.push({ parameter: "Body Temperature", value: "- °C", status: "inconclusive", headline: "No Signal", detail: "Temperature probe reading unavailable.", icon: "thermometer", normal_range: "36.0–37.4 °C", accent: "neutral", delta_text: "Awaiting probe", range_pct: null, safe_start_pct: 25, safe_end_pct: 50 });
  } else {
    const tSt = temp >= 39.0 ? "alert" : (temp >= 37.5 ? "watch" : "ok");
    findings.push({
      parameter: "Body Temperature", value: `${temp.toFixed(1)} °C`, status: tSt, headline: temp >= 39.0 ? "High Fever" : (temp >= 37.5 ? "Mild Fever" : "Normal"),
      detail: tSt === "ok" ? `Body temperature is ${temp.toFixed(1)} °C, within the afebrile normal range.` : `Body temperature is ${temp.toFixed(1)} °C. Rest, cool down, and hydrate.`,
      icon: "thermometer", normal_range: "36.0–37.4 °C", accent: "amber",
      delta_text: deltaTxt(temp, tempBase, 1, "°C", 0.15) || "Afebrile resting band",
      range_pct: scalePct(temp, 34.5, 40.5), safe_start_pct: 25, safe_end_pct: 50
    });
  }

  // 4. Blood Pressure
  const bpMeasured = sys > 0 && dia > 0;
  let mapMmhg = null;
  let ppMmhg = null;
  if (!bpMeasured) {
    findings.push({ parameter: "Blood Pressure", value: "- mmHg", status: "inconclusive", headline: "Not Measured", detail: "Blood pressure cuff was in standby during this reading.", icon: "activity", normal_range: "< 130/80 mmHg", accent: "neutral", delta_text: "Cuff in standby — optional check", range_pct: null, safe_start_pct: 10, safe_end_pct: 50 });
  } else {
    mapMmhg = Math.round((sys + 2 * dia) / 3);
    ppMmhg = Math.round(sys - dia);
    const bSt = (sys >= 140 || dia >= 90 || sys < 90) ? "alert" : ((sys >= 130 || dia >= 80) ? "watch" : "ok");
    const bHead = (sys >= 140 || dia >= 90) ? "High (Stage 2)" : (sys < 90 ? "Low (Hypotension)" : (bSt === "watch" ? "Elevated" : "Normal"));
    findings.push({
      parameter: "Blood Pressure", value: `${Math.round(sys)}/${Math.round(dia)} mmHg`, status: bSt, headline: bHead,
      detail: bSt === "ok" ? `Blood pressure is ${Math.round(sys)}/${Math.round(dia)} mmHg, well-regulated.` : `Blood pressure is ${Math.round(sys)}/${Math.round(dia)} mmHg. Sit calmly and monitor regularly.`,
      icon: "activity", normal_range: "< 130/80 mmHg", accent: "lavender",
      delta_text: `MAP ${mapMmhg} mmHg • Pulse Pressure ${ppMmhg} mmHg`,
      range_pct: scalePct(sys, 80, 180), safe_start_pct: 10, safe_end_pct: 50
    });
  }

  // 5. Environment
  const eSt = (rtemp >= 28 || hum >= 70 || hum <= 30) ? "watch" : "ok";
  findings.push({
    parameter: "Room Environment", value: `${rtemp.toFixed(1)} °C / ${Math.round(hum)}% RH`, status: eSt, headline: eSt === "ok" ? "Comfortable" : "Attention",
    detail: eSt === "ok" ? `Room temperature (${rtemp.toFixed(1)} °C) and humidity (${Math.round(hum)}%) are comfortable.` : `Ambient Heat Index is ${heatIdx} °C with ${Math.round(hum)}% humidity.`,
    icon: "cloud", normal_range: "18–28 °C • 30–70%", accent: "teal",
    delta_text: `Heat Index: ${heatIdx} °C • Humidity ${Math.round(hum)}%`,
    range_pct: scalePct(rtemp, 15, 40), safe_start_pct: 12, safe_end_pct: 52
  });

  const hasAlert = findings.some((f) => f.status === "alert");
  const hasWatch = findings.some((f) => f.status === "watch");
  const overallStatus = hasAlert ? "HIGH" : (hasWatch ? "WATCH" : "NORMAL");

  const nextStep = hasAlert ? {
    category: "URGENT_ATTENTION", badge_label: "URGENT ATTENTION", headline: "Action Required — High Risk Finding",
    action: "One or more vital parameters are in a high-risk range. Rest seated, avoid exertion, and seek medical attention if readings remain abnormal.",
    red_flags: "Seek immediate emergency medical care if you experience chest pain or pressure, shortness of breath, radiating arm/jaw pain, or severe dizziness."
  } : hasWatch ? {
    category: "RECHECK_OR_ADVICE", badge_label: "RECHECK & MONITOR", headline: "Rest & Recheck in 5–10 Minutes",
    action: "Mild variation observed in readings. Sit quietly, take slow deep breaths, hydrate, and re-test.",
    red_flags: "Seek immediate emergency medical care if chest pain or sudden shortness of breath occurs."
  } : {
    category: "ROUTINE_MONITORING", badge_label: "ROUTINE MONITORING", headline: "Maintain Healthy Baseline",
    action: "All measured biometrics are within healthy resting limits. Continue your regular daily wellness routine.",
    red_flags: "Seek immediate emergency medical care if acute symptoms arise."
  };

  const prText = ($("ecg-metric-pr") ? $("ecg-metric-pr").textContent : "156").trim();
  const qrsText = ($("ecg-metric-qrs") ? $("ecg-metric-qrs").textContent : "88").trim();
  const qtcText = ($("ecg-metric-qtc") ? $("ecg-metric-qtc").textContent : "410").trim();
  const ecgInterp = {
    status: hr >= 120 || hr <= 40 ? "alert" : (hr >= 100 || (hr > 0 && hr <= 60) ? "watch" : "ok"),
    headline: hr > 100 ? "Sinus Tachycardia" : (hr > 0 && hr <= 60 ? "Sinus Bradycardia" : "Normal Sinus Rhythm"),
    rhythm: hr > 100 ? "Sinus Tachycardia (ST)" : (hr > 0 && hr <= 60 ? "Sinus Bradycardia (SB)" : "Normal Sinus Rhythm (NSR)"),
    pr_value: `${prText} ms`, pr_norm: "120–200 ms",
    qrs_value: `${qrsText} ms`, qrs_norm: "60–100 ms",
    qtc_value: `${qtcText} ms`, qtc_norm: "< 440 ms",
    lead_quality: "98% (Good Signal)",
    summary: "Cardiac electrical activation follows a normal physiological sequence on Lead I.",
    clinical_limitation: "Single-lead Lead I ECG assesses rhythm and rate only. It cannot rule out acute ischemia, structural disease, or replace a standard 12-lead diagnostic ECG."
  };

  // Readiness component scores (never penalizing standby BP)
  const cardioScore = hasAlert && (sys >= 140 || hr >= 120) ? 44 : (hasWatch && (sys >= 130 || hr >= 100) ? 72 : 96);
  const oxyScore = spo2 <= 0 ? 0 : spo2 >= 97 ? 98 : spo2 >= 95 ? 91 : spo2 >= 90 ? 68 : 35;
  const thermScore = temp >= 39 ? 35 : temp >= 37.5 ? 72 : 96;
  let score = Math.round(cardioScore * 0.42 + (spo2 > 0 ? oxyScore : cardioScore) * 0.34 + thermScore * 0.24);
  if (hasAlert) score = Math.min(score, 58);
  else if (hasWatch) score = Math.min(score, 81);
  const activeSensors = (hr > 0 ? 1 : 0) + (spo2 > 0 ? 1 : 0) + (temp > 0 ? 1 : 0) + (bpMeasured ? 1 : 0) + (rtemp !== 0 ? 1 : 0) + (hum !== 0 ? 1 : 0);

  const structuredTips = [];
  if (sys >= 130 || dia >= 80) {
    structuredTips.push({ category: "Cardiovascular", icon: "heart", title: "Sodium & Stimulant Moderation", detail: "Reducing sodium (salt) in your diet and limiting caffeine can help manage blood pressure.", priority: "high" });
  }
  if (hr >= 100) {
    structuredTips.push({ category: "Hydration", icon: "droplet", title: "Rehydrate & Settle Pulse", detail: "Stay hydrated — even mild dehydration can elevate your resting heart rate.", priority: "watch" });
  }
  if (spo2 > 0 && spo2 < 95) {
    structuredTips.push({ category: "Oxygenation", icon: "lungs", title: "Improve Ventilation & Posture", detail: "Sit upright in a well-ventilated space and practice slow diaphragmatic breathing.", priority: "high" });
  }
  if (!structuredTips.length) {
    structuredTips.push({ category: "Routine", icon: "shield", title: "Baseline Maintained", detail: "Your vitals look great! Continue with your regular routine.", priority: "normal" });
    structuredTips.push({ category: "Activity", icon: "activity", title: "Weekly Aerobic Target", detail: "Aim for at least 150 minutes of moderate aerobic activity per week.", priority: "normal" });
    structuredTips.push({ category: "Recovery", icon: "moon", title: "Restorative Sleep Window", detail: "Quality sleep (7-9 hours) plays a key role in maintaining healthy vitals.", priority: "normal" });
  }

  const clientReport = {
    overall_status: overallStatus,
    overall_headline: hasAlert ? "Attention Required" : (hasWatch ? "Monitor Closely" : "All Clear"),
    overall_summary: hasAlert
      ? "Your monitoring data shows one or more indicators outside safe limits. Rest and re-test."
      : (hasWatch ? "Some indicators are slightly outside standard resting ranges. Continue monitoring." : "All measured indicators and cardiac rhythm timings are within normal ranges."),
    next_step: nextStep,
    ecg_interpretation: ecgInterp,
    findings,
    lifestyle_tips: structuredTips.map((t) => t.detail),
    structured_tips: structuredTips,
    wellness_score: {
      score,
      label: score >= 82 ? "Optimal" : (score >= 60 ? "Moderate Strain" : "High Strain"),
      completeness_pct: Math.round((activeSensors / 6) * 100),
      active_sensors: activeSensors,
      total_sensors: 6,
      standby_notes: bpMeasured ? [] : ["Blood pressure cuff in standby — wellness score computed without penalty."],
      components: { cardiovascular: cardioScore, oxygenation: oxyScore, thermal: thermScore }
    },
    subsystem_summary: {
      cardiovascular: {
        status: findings[0].status === "alert" || findings[3].status === "alert" ? "alert" : (findings[0].status === "watch" || findings[3].status === "watch" ? "watch" : "ok"),
        hr_bpm: hr > 0 ? Math.round(hr) : null,
        hr_delta_text: findings[0].delta_text,
        bp_text: bpMeasured ? `${Math.round(sys)}/${Math.round(dia)} mmHg` : "Cuff Standby",
        map_mmhg: mapMmhg,
        pulse_pressure_mmhg: ppMmhg,
        summary: bpMeasured ? `MAP ${mapMmhg} mmHg • Pulse Pressure ${ppMmhg} mmHg` : "HR steady; BP cuff in optional standby"
      },
      respiratory: {
        status: findings[1].status,
        spo2_pct: spo2 > 0 ? Number(spo2.toFixed(1)) : null,
        margin_optimal: spo2 > 0 ? Number((spo2 - 95).toFixed(1)) : null,
        margin_critical: spo2 > 0 ? Number((spo2 - 90).toFixed(1)) : null,
        spo2_delta_text: findings[1].delta_text,
        risk_level: (risk && risk.respiratory_risk) || (spo2 > 0 && spo2 < 95 ? "WATCH" : "NORMAL"),
        summary: spo2 > 0 ? `${(spo2 - 95 >= 0 ? "+" : "")}${(spo2 - 95).toFixed(1)}% buffer vs 95% floor` : "Awaiting pulse oximetry"
      },
      thermal: {
        status: findings[2].status === "alert" || findings[4].status === "alert" ? "alert" : (findings[2].status === "watch" || findings[4].status === "watch" ? "watch" : "ok"),
        body_temp_c: temp > 0 ? Number(temp.toFixed(1)) : null,
        temp_delta_text: findings[2].delta_text,
        room_temp_c: Number(rtemp.toFixed(1)),
        humidity_pct: Math.round(hum),
        heat_index_c: heatIdx,
        strain_score: strain,
        comfort_band: heatIdx >= 37 ? "High Heat Stress" : heatIdx >= 32 ? "Heat Watch" : heatIdx >= 28 ? "Warm Ambient" : "Optimal",
        summary: `Heat Index ${heatIdx} °C • Strain ${strain}/100`
      }
    },
    report_meta: {
      patient_name: prof ? prof.name : "Patient",
      patient_role: prof ? prof.role : "Subject",
      device_id: reading.device_id || (prof ? prof.device_id : "patient_01"),
      active_sensors_count: activeSensors,
      total_sensors_count: 6
    },
    disclaimer: "This report is for informational and wellness monitoring purposes only. It does not constitute medical advice or diagnosis. Always consult a qualified healthcare professional for medical concerns."
  };

  _latestLiveReport = clientReport;
  if (saveSnapshot || !_loadReportSnapshots().length) {
    _saveReportSnapshot(clientReport, reading);
  }
  if (_viewingSnapshotIdx < 0) {
    renderReport(clientReport, false);
  }
}





// ══════════════════════════════════════════════════════════════════════════════
// AI ECG Analysis Studio — JeevOne Demo v3.7
// ══════════════════════════════════════════════════════════════════════════════

// ── Demo Data Scenarios ───────────────────────────────────────────────────────
const ECG_DEMO_SCENARIOS = [
  {
    recording_id: "ECG-DEMO-2041", patient_id: "patient_01",
    primary_rhythm: "Normal Sinus Rhythm", rhythm_code: "NSR",
    confidence: 97.8, severity: "normal",
    icon: "❤️", summaryIcon: "✅",
    duration_sec: 30,
    metrics: { avg_hr_bpm: 72, min_hr_bpm: 68, max_hr_bpm: 78, avg_rr_ms: 833,
               pr_ms: 158, qrs_ms: 86, qt_ms: 380, qtc_ms: 412,
               r_peaks_detected: 36, abnormal_beats: 0, pct_classified: 100.0 },
    signal_quality: { sqi_score: 0.942, suitable: true, noise_level: "Low", baseline_wander: "Minimal", lead_contact: "Good" },
    timeline_episodes: [
      { start_sec: 0, end_sec: 30, rhythm: "NSR", severity: "normal", label: "Normal Sinus Rhythm" }
    ],
    summary: {
      headline: "Normal Cardiac Rhythm Detected",
      detail: "The algorithm identified a regular sinus rhythm throughout the entire 30-second recording. P waves consistently precede each QRS complex with a stable PR interval, indicating coordinated atrial and ventricular depolarization. All measured intervals fall within standard clinical reference ranges.",
      abnormal_events: 0, quality: "Excellent",
      next_steps: "Continue routine monitoring. No algorithmic flags raised."
    }
  },
  {
    recording_id: "ECG-DEMO-2042", patient_id: "patient_01",
    primary_rhythm: "Atrial Fibrillation", rhythm_code: "AFib",
    confidence: 91.3, severity: "high_priority",
    icon: "⚠️", summaryIcon: "🔴",
    duration_sec: 30,
    metrics: { avg_hr_bpm: 94, min_hr_bpm: 72, max_hr_bpm: 128, avg_rr_ms: 638,
               pr_ms: null, qrs_ms: 88, qt_ms: null, qtc_ms: null,
               r_peaks_detected: 47, abnormal_beats: 47, pct_classified: 100.0 },
    signal_quality: { sqi_score: 0.89, suitable: true, noise_level: "Low", baseline_wander: "Moderate", lead_contact: "Good" },
    timeline_episodes: [
      { start_sec: 0,  end_sec: 8,    rhythm: "NSR",  severity: "normal",       label: "Normal Sinus" },
      { start_sec: 8,  end_sec: 30,   rhythm: "AFib", severity: "high_priority",label: "Atrial Fibrillation" },
      { start_sec: 14, end_sec: 14.4, rhythm: "PVC",  severity: "attention",    label: "PVC" },
      { start_sec: 22, end_sec: 22.4, rhythm: "PVC",  severity: "attention",    label: "PVC" }
    ],
    summary: {
      headline: "Irregular Rhythm Pattern Detected",
      detail: "The algorithm detected an irregular R-R interval pattern beginning at approximately 8 seconds, consistent with the AFib pattern class. No discernible P waves are present during this segment. The ventricular rate is irregular ranging from 72–128 bpm. Two isolated premature complexes were also flagged.",
      abnormal_events: 3, quality: "Good",
      next_steps: "Consult a qualified cardiologist for clinical evaluation. This algorithmic finding requires professional medical assessment."
    }
  },
  {
    recording_id: "ECG-DEMO-2043", patient_id: "patient_02",
    primary_rhythm: "Sinus Bradycardia", rhythm_code: "Sinus Bradycardia",
    confidence: 95.1, severity: "attention",
    icon: "🫀", summaryIcon: "🟡",
    duration_sec: 30,
    metrics: { avg_hr_bpm: 48, min_hr_bpm: 44, max_hr_bpm: 52, avg_rr_ms: 1250,
               pr_ms: 172, qrs_ms: 90, qt_ms: 440, qtc_ms: 393,
               r_peaks_detected: 24, abnormal_beats: 0, pct_classified: 100.0 },
    signal_quality: { sqi_score: 0.961, suitable: true, noise_level: "Minimal", baseline_wander: "None", lead_contact: "Excellent" },
    timeline_episodes: [
      { start_sec: 0, end_sec: 30, rhythm: "Sinus Bradycardia", severity: "attention", label: "Sinus Bradycardia — 48 bpm" }
    ],
    summary: {
      headline: "Slow Heart Rate Pattern Detected",
      detail: "The algorithm classified this recording as Sinus Bradycardia — a sinus rhythm with a resting rate below 60 bpm. P wave morphology is preserved and PR interval is within normal range. This may be physiologically normal in athletes or during rest/sleep.",
      abnormal_events: 0, quality: "Excellent",
      next_steps: "No immediate algorithmic alert. Correlate with patient context and symptoms."
    }
  },
  {
    recording_id: "ECG-DEMO-2044", patient_id: "patient_01",
    primary_rhythm: "Normal Sinus with PVCs", rhythm_code: "PVC",
    confidence: 88.7, severity: "attention",
    icon: "⚡", summaryIcon: "🟡",
    duration_sec: 30,
    metrics: { avg_hr_bpm: 76, min_hr_bpm: 70, max_hr_bpm: 82, avg_rr_ms: 789,
               pr_ms: 155, qrs_ms: 148, qt_ms: 400, qtc_ms: 435,
               r_peaks_detected: 38, abnormal_beats: 5, pct_classified: 100.0 },
    signal_quality: { sqi_score: 0.912, suitable: true, noise_level: "Low", baseline_wander: "Minimal", lead_contact: "Good" },
    timeline_episodes: [
      { start_sec: 0,    end_sec: 7,    rhythm: "NSR", severity: "normal",    label: "Normal Sinus" },
      { start_sec: 7.2,  end_sec: 7.6,  rhythm: "PVC", severity: "attention", label: "PVC #1" },
      { start_sec: 7.6,  end_sec: 14,   rhythm: "NSR", severity: "normal",    label: "Normal Sinus" },
      { start_sec: 14.1, end_sec: 14.5, rhythm: "PVC", severity: "attention", label: "PVC #2" },
      { start_sec: 14.5, end_sec: 21,   rhythm: "NSR", severity: "normal",    label: "Normal Sinus" },
      { start_sec: 21.2, end_sec: 21.6, rhythm: "PVC", severity: "attention", label: "PVC #3" },
      { start_sec: 21.6, end_sec: 28,   rhythm: "NSR", severity: "normal",    label: "Normal Sinus" },
      { start_sec: 28.1, end_sec: 28.5, rhythm: "PVC", severity: "attention", label: "PVC #4" },
      { start_sec: 28.5, end_sec: 30,   rhythm: "NSR", severity: "normal",    label: "Normal Sinus" }
    ],
    summary: {
      headline: "Premature Ventricular Contractions Detected",
      detail: "The algorithm identified 5 isolated premature ventricular complexes (PVCs) against a background of normal sinus rhythm. PVCs are characterized by wide, aberrant QRS morphology and lack of a preceding P wave. The underlying sinus rhythm remains regular.",
      abnormal_events: 5, quality: "Good",
      next_steps: "Isolated PVCs are frequently benign. Clinical correlation recommended if symptomatic or frequent."
    }
  }
];

// ── ECG Archive Demo Data ─────────────────────────────────────────────────────
const ECG_ARCHIVE_RECORDS = [
  { recording_id: "ECG-DEMO-2041", ts: "Nov 11, 2026 · 10:14 AM", duration: "30s", classification: "Normal Sinus Rhythm", confidence: "97.8%", hr: "72", qtc: "412 ms", sqi: "94%", scenario: 0 },
  { recording_id: "ECG-DEMO-2042", ts: "Nov 11, 2026 · 09:52 AM", duration: "30s", classification: "Atrial Fibrillation", confidence: "91.3%", hr: "94", qtc: "—", sqi: "89%", scenario: 1 },
  { recording_id: "ECG-DEMO-2043", ts: "Nov 10, 2026 · 08:33 PM", duration: "30s", classification: "Sinus Bradycardia", confidence: "95.1%", hr: "48", qtc: "393 ms", sqi: "96%", scenario: 2 },
  { recording_id: "ECG-DEMO-2044", ts: "Nov 10, 2026 · 03:17 PM", duration: "30s", classification: "NSR with PVCs", confidence: "88.7%", hr: "76", qtc: "435 ms", sqi: "91%", scenario: 3 },
  { recording_id: "ECG-DEMO-2038", ts: "Nov 09, 2026 · 11:04 AM", duration: "30s", classification: "Normal Sinus Rhythm", confidence: "98.2%", hr: "69", qtc: "408 ms", sqi: "95%", scenario: 0 },
  { recording_id: "ECG-DEMO-2035", ts: "Nov 09, 2026 · 08:58 AM", duration: "30s", classification: "Sinus Tachycardia", confidence: "93.4%", hr: "108", qtc: "389 ms", sqi: "92%", scenario: 0 },
  { recording_id: "ECG-DEMO-2031", ts: "Nov 08, 2026 · 07:22 PM", duration: "30s", classification: "Normal Sinus Rhythm", confidence: "96.9%", hr: "74", qtc: "415 ms", sqi: "97%", scenario: 0 },
  { recording_id: "ECG-DEMO-2028", ts: "Nov 07, 2026 · 12:45 PM", duration: "30s", classification: "NSR with PVCs", confidence: "87.1%", hr: "78", qtc: "432 ms", sqi: "90%", scenario: 3 }
];

// ── ECG Waveform Morphology Templates ────────────────────────────────────────
// Normal PQRST template (normalized: t=0..1 of beat period, y=normalized mV)
const ECG_NSR_TEMPLATE = [
  { t: 0.00, y: 0.00 },
  { t: 0.10, y: 0.08 }, { t: 0.14, y: 0.20 }, { t: 0.18, y: 0.08 }, // P wave
  { t: 0.26, y: 0.00 }, // PR segment
  { t: 0.30, y: -0.12 }, // Q
  { t: 0.34, y: 1.20 },  // R peak
  { t: 0.38, y: -0.30 }, // S
  { t: 0.46, y: 0.00 }, // ST
  { t: 0.56, y: 0.22 }, { t: 0.62, y: 0.30 }, { t: 0.68, y: 0.00 }, // T
  { t: 1.00, y: 0.00 }
];

// AFib template: no P wave, irregular baseline flutter, narrow QRS
const ECG_AFIB_TEMPLATE = [
  { t: 0.00, y: 0.00 },
  // fibrillatory flutter at start
  { t: 0.05, y: 0.06 }, { t: 0.10, y: -0.04 }, { t: 0.15, y: 0.08 }, { t: 0.20, y: -0.03 },
  { t: 0.25, y: 0.05 }, { t: 0.30, y: -0.08 }, // Q
  { t: 0.33, y: 1.10 },  // R
  { t: 0.37, y: -0.25 }, // S
  { t: 0.44, y: 0.00 },
  { t: 0.52, y: 0.18 }, { t: 0.57, y: 0.22 }, { t: 0.62, y: 0.00 }, // T
  { t: 0.70, y: 0.04 }, { t: 0.78, y: -0.03 }, { t: 0.85, y: 0.05 }, { t: 0.92, y: -0.02 }, // flutter
  { t: 1.00, y: 0.00 }
];

// PVC template: wide bizarre QRS, no P, inverted T
const ECG_PVC_TEMPLATE = [
  { t: 0.00, y: 0.00 },
  { t: 0.10, y: -0.05 }, // slight dip (no P)
  { t: 0.22, y: -0.20 }, // deep Q
  { t: 0.30, y: 1.60 },  // very tall R
  { t: 0.42, y: -0.70 }, // deep S
  { t: 0.52, y: -0.10 },
  { t: 0.60, y: -0.35 }, { t: 0.68, y: -0.42 }, { t: 0.76, y: -0.15 }, // inverted T
  { t: 0.86, y: 0.00 },
  { t: 1.00, y: 0.00 }
];

// ── State ─────────────────────────────────────────────────────────────────────
let _ecgCurrentScenario = 0;
let _ecgAnimId = null;
let _ecgSweepX = 0;
let _ecgPhase = 0;
let _ecgLastTime = null;
let _ecgSpeed = 25;    // mm/s
let _ecgGain  = 10;    // mm/mV
let _ecgIsRecording = false;
let _ecgReviewStatus = "UNREVIEWED";

// ── Init on Tab Activation ────────────────────────────────────────────────────
function initAIECGTab() {
  buildECGArchiveTable();
  loadECGScenario(0);
  startECGLiveSweep();
  updateECGStepperDone();

  const exportBtn = document.getElementById("btn-ecg-export-csv");
  if (exportBtn && !exportBtn._hasListener) {
    exportBtn._hasListener = true;
    exportBtn.addEventListener("click", exportECGCSV);
  }
}

// Auto-adjust ECG canvas on window resize and mobile orientation rotation
window.addEventListener("resize", () => {
  const canvas = document.getElementById("ecg-ai-canvas");
  if (canvas && canvas.offsetParent !== null) {
    resizeECGCanvas(canvas);
  }
});
window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    const canvas = document.getElementById("ecg-ai-canvas");
    if (canvas && canvas.offsetParent !== null) {
      resizeECGCanvas(canvas);
    }
  }, 150);
});

// ── Tab switch hook: wire into existing tab-switching ─────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Hook onto existing tab switch
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.dataset.tab === "ecg") {
        setTimeout(initAIECGTab, 80);
      }
    });
  });
});

// ── Load a Demo Scenario ──────────────────────────────────────────────────────
function loadECGScenario(idx) {
  _ecgCurrentScenario = parseInt(idx, 10);
  const sc = ECG_DEMO_SCENARIOS[_ecgCurrentScenario];
  if (!sc) return;

  // Update rhythm badge
  const badge = document.getElementById("ecg-ai-rhythm-badge");
  if (badge) {
    badge.textContent = sc.rhythm_code;
    badge.className = "status-badge " + (sc.severity === "normal" ? "normal" : sc.severity === "high_priority" ? "critical" : "watch");
  }

  // Strip meta
  setText("ecg-ai-rec-id", sc.recording_id);
  setText("ecg-rec-id-bottom", sc.recording_id);
  setText("ecg-analyzed-at", new Date().toLocaleTimeString());

  // Overlay metrics
  const m = sc.metrics;
  setText("ecg-ai-overlay-hr",  m.avg_hr_bpm + " bpm");
  setText("ecg-ai-overlay-rr",  m.avg_rr_ms + " ms");
  setText("ecg-ai-overlay-pr",  m.pr_ms ? m.pr_ms + " ms" : "—");
  setText("ecg-ai-overlay-qrs", m.qrs_ms + " ms");
  setText("ecg-ai-overlay-qtc", m.qtc_ms ? m.qtc_ms + " ms" : "—");

  // Metrics bento
  setText("ecgm-avg-hr",  m.avg_hr_bpm + " bpm");
  setText("ecgm-min-hr",  m.min_hr_bpm + " bpm");
  setText("ecgm-max-hr",  m.max_hr_bpm + " bpm");
  setText("ecgm-rr",      m.avg_rr_ms + " ms");
  setText("ecgm-pr",      m.pr_ms ? m.pr_ms + " ms" : "Unavailable");
  setText("ecgm-qrs",     m.qrs_ms + " ms");
  setText("ecgm-qt",      m.qt_ms ? m.qt_ms + " ms" : "Unavailable");
  setText("ecgm-qtc",     m.qtc_ms ? m.qtc_ms + " ms" : "Unavailable");
  setText("ecgm-rpeaks",  m.r_peaks_detected);
  setText("ecgm-abnormal",m.abnormal_beats);
  setText("ecgm-classified", m.pct_classified + "%");
  setText("ecgm-duration",   sc.duration_sec + " s");

  // Classification block
  setText("ecg-rhythm-name", sc.primary_rhythm);
  setText("ecg-rhythm-code", sc.rhythm_code);
  setText("ecg-rhythm-icon", sc.icon);
  setText("ecg-confidence-pct", sc.confidence + "%");
  const sevBadge = document.getElementById("ecg-severity-badge");
  if (sevBadge) {
    sevBadge.textContent = sc.severity.replace("_", " ").toUpperCase();
    sevBadge.className = "ecg-severity-badge " + sc.severity;
  }

  // SQI
  const sqi = sc.signal_quality;
  const sqiPct = Math.round(sqi.sqi_score * 1000) / 10;
  setText("ecg-sqi-label", "SQI: " + sqiPct + "%");
  setText("ecg-ai-sqi-topbar", sqiPct + "%");
  setText("ecg-sqi-pct-big", sqiPct + "%");
  const verdict = sqiPct >= 90 ? "Excellent" : sqiPct >= 75 ? "Good" : sqiPct >= 55 ? "Acceptable" : "Poor";
  setText("ecg-sqi-verdict", verdict);
  setText("ecg-sqi-noise", sqi.noise_level);
  setText("ecg-sqi-wander", sqi.baseline_wander || "Minimal");
  setText("ecg-sqi-lead-contact", sqi.lead_contact);
  setText("ecg-sqi-suit", sqi.suitable ? "Suitable ✓" : "Unsuitable ✗");
  drawSQIGauge(sqi.sqi_score);

  // Summary
  const sum = sc.summary;
  setText("ecg-summary-icon",     sc.summaryIcon);
  setText("ecg-summary-headline", sum.headline);
  setText("ecg-summary-detail",   sum.detail);
  setText("ecg-sum-events",  sum.abnormal_events);
  setText("ecg-sum-quality", sum.quality);
  setText("ecg-next-text",   sum.next_steps);

  // Monitor frame class (highlight severity)
  const frame = document.getElementById("ecg-ai-monitor-frame");
  if (frame) {
    frame.className = "ecg-ai-monitor-frame";
    if (sc.severity === "high_priority") frame.classList.add("scenario-afib");
    else if (sc.severity === "attention") frame.classList.add("scenario-attention");
  }

  // Timeline
  buildECGTimeline(sc.timeline_episodes, sc.duration_sec);

  // Reset waveform sweep to new scenario
  restartECGSweep();
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Arrhythmia Timeline ───────────────────────────────────────────────────────
function buildECGTimeline(episodes, totalSec) {
  const track = document.getElementById("ecg-timeline-track");
  if (!track) return;
  track.innerHTML = "";
  episodes.forEach((ep, i) => {
    const pct = ((ep.end_sec - ep.start_sec) / totalSec * 100).toFixed(2);
    const seg = document.createElement("div");
    seg.className = "ecg-timeline-seg seg-" +
      (ep.severity === "normal" ? "normal" :
       ep.severity === "high_priority" ? "high" :
       ep.severity === "attention" ? "attention" : "inconclusive");
    seg.style.width = pct + "%";
    seg.title = ep.label + " — " + ep.start_sec + "s to " + ep.end_sec + "s";
    seg.innerHTML = `<span class="seg-label">${ep.label}</span>`;
    seg.onclick = () => jumpECGToTime(ep.start_sec, totalSec);
    track.appendChild(seg);
  });
}

function jumpECGToTime(startSec, totalSec) {
  // For demo: restart sweep from that proportion of beat phase
  const canvas = document.getElementById("ecg-ai-canvas");
  if (!canvas) return;
  const pct = startSec / totalSec;
  _ecgSweepX = pct * canvas.width * 0.9;
  _ecgPhase  = pct;
}

// ── ECG Live Sweep Animation ──────────────────────────────────────────────────
function startECGLiveSweep() {
  if (_ecgAnimId) cancelAnimationFrame(_ecgAnimId);
  const canvas = document.getElementById("ecg-ai-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  resizeECGCanvas(canvas);
  _ecgSweepX = 0;
  _ecgPhase  = 0;
  _ecgLastTime = null;

  function frame(ts) {
    if (!_ecgLastTime) _ecgLastTime = ts;
    const dt = (ts - _ecgLastTime) / 1000; // seconds
    _ecgLastTime = ts;
    renderECGSweepFrame(ctx, canvas, dt);
    _ecgAnimId = requestAnimationFrame(frame);
  }
  _ecgAnimId = requestAnimationFrame(frame);
}

function restartECGSweep() {
  _ecgSweepX = 0;
  _ecgPhase  = 0;
  _ecgLastTime = null;
}

function resizeECGCanvas(canvas) {
  const wrapper = canvas.parentElement;
  if (!wrapper) return;
  const dpr = window.devicePixelRatio || 1;
  const w = wrapper.clientWidth || 1200;
  canvas.width  = w * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width  = w + "px";
  canvas.style.height = "200px";
}

function renderECGSweepFrame(ctx, canvas, dt) {
  const sc = ECG_DEMO_SCENARIOS[_ecgCurrentScenario];
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width, H = canvas.height;
  const centerY = H * 0.52;
  const gainScale = (_ecgGain / 10);     // 10 mm/mV is baseline
  const speedScale = (_ecgSpeed / 25);   // 25 mm/s is baseline
  const scaleY = H * 0.33 * gainScale;

  // pixels per second based on speed; 25 mm/s at screen = ~2.5 * dpr px/frame at 60fps
  const pxPerSec = 70 * dpr * speedScale;
  const advPx = pxPerSec * dt;

  // Clear sweep ghost region (eraser ahead of cursor)
  const clearW = 36 * dpr;
  ctx.fillStyle = "#0C1F17";
  ctx.fillRect(_ecgSweepX, 0, clearW, H);

  // Draw medical grid if sweep is at start
  if (_ecgSweepX < advPx + 2) {
    drawECGGrid(ctx, W, H);
  }

  // Pick template based on scenario/phase
  const beatPeriod = 60.0 / sc.metrics.avg_hr_bpm; // seconds per beat
  const pxPerBeat  = pxPerSec * beatPeriod;

  // Choose template for current beat (if PVC scenario, every ~6th beat is PVC)
  let template = ECG_NSR_TEMPLATE;
  if (sc.rhythm_code === "AFib") template = ECG_AFIB_TEMPLATE;

  // For PVC scenario, inject PVC template at certain phase positions
  if (sc.rhythm_code === "PVC") {
    // approx PVC beats at positions matching timeline
    const beatIdx = Math.floor(_ecgPhase / beatPeriod);
    const pvcBeats = [6, 13, 20, 27, 34];
    if (pvcBeats.includes(beatIdx % 38)) template = ECG_PVC_TEMPLATE;
    else template = ECG_NSR_TEMPLATE;
  }

  // For Bradycardia — widen periods naturally via hr in beat calculation (already handled)

  // Draw one chunk of waveform
  ctx.strokeStyle = sc.severity === "high_priority" ? "#f87171" : sc.severity === "attention" ? "#fbbf24" : "#22c55e";
  ctx.lineWidth = 2 * dpr;
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 5;
  ctx.beginPath();

  const phaseInBeat = (_ecgPhase % beatPeriod) / beatPeriod; // 0..1
  let prevX = _ecgSweepX, prevY = centerY, isFirst = true;

  // Draw ~advPx + a bit more for smooth look
  const steps = Math.max(4, Math.round(advPx / dpr) + 2);
  for (let s = 0; s <= steps; s++) {
    const px = _ecgSweepX + (s / steps) * advPx;
    const beatPhaseLocal = ((_ecgPhase + (s / steps) * dt) % beatPeriod) / beatPeriod;
    const y = interpolateTemplate(template, beatPhaseLocal);
    const canvY = centerY - y * scaleY;
    if (isFirst) { ctx.moveTo(px, canvY); isFirst = false; }
    else ctx.lineTo(px, canvY);
    prevX = px; prevY = canvY;
  }
  ctx.stroke();
  ctx.shadowBlur = 0;

  // R-peak marker dot on high R
  const curY = interpolateTemplate(template, phaseInBeat);
  if (curY > 0.9) {
    ctx.fillStyle = "#a78bfa";
    ctx.beginPath();
    ctx.arc(_ecgSweepX, centerY - curY * scaleY, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Advance position and phase
  _ecgSweepX += advPx;
  _ecgPhase  += dt;
  if (_ecgSweepX >= W) {
    _ecgSweepX = 0;
    drawECGGrid(ctx, W, H);
  }
}

function drawECGGrid(ctx, W, H) {
  const dpr = window.devicePixelRatio || 1;
  ctx.fillStyle = "#0C1F17";
  ctx.fillRect(0, 0, W, H);
  const minor = 16 * dpr, major = minor * 5;
  ctx.strokeStyle = "rgba(74,222,128,0.07)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = 0; x < W; x += minor) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for (let y = 0; y < H; y += minor) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  ctx.strokeStyle = "rgba(74,222,128,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < W; x += major) { ctx.moveTo(x,0); ctx.lineTo(x,H); }
  for (let y = 0; y < H; y += major) { ctx.moveTo(0,y); ctx.lineTo(W,y); }
  ctx.stroke();
  // Cal pulse
  const dpr2 = dpr;
  ctx.strokeStyle = "#4ade80"; ctx.lineWidth = 2 * dpr2;
  const cs = 10 * dpr2, cw = 20 * dpr2, ch = H * 0.3;
  ctx.beginPath();
  ctx.moveTo(cs,H*0.52); ctx.lineTo(cs+4,H*0.52);
  ctx.lineTo(cs+4,H*0.52-ch); ctx.lineTo(cs+cw,H*0.52-ch);
  ctx.lineTo(cs+cw,H*0.52); ctx.lineTo(cs+cw+6,H*0.52);
  ctx.stroke();
  ctx.fillStyle="#86efac"; ctx.font=`${9*dpr2}px JetBrains Mono,monospace`;
  ctx.fillText("1mV",cs,H*0.52-ch-5);
}

function interpolateTemplate(template, t) {
  // t in [0,1]; return y by linear interpolation between template keyframes
  for (let i = 1; i < template.length; i++) {
    if (t <= template[i].t) {
      const seg = (t - template[i-1].t) / (template[i].t - template[i-1].t);
      return template[i-1].y + seg * (template[i].y - template[i-1].y);
    }
  }
  return 0;
}

// ── SQI Arc Gauge ─────────────────────────────────────────────────────────────
function drawSQIGauge(score) {
  const canvas = document.getElementById("ecg-sqi-gauge");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = 160 * dpr;
  canvas.height = 90  * dpr;
  canvas.style.width  = "160px";
  canvas.style.height = "90px";
  const W = canvas.width, H = canvas.height;
  const cx = W / 2, cy = H * 0.95, r = W * 0.42;
  const startA = Math.PI, endA = 0;

  ctx.clearRect(0, 0, W, H);
  // Track
  ctx.beginPath(); ctx.arc(cx, cy, r, startA, endA); 
  ctx.strokeStyle = "rgba(107,114,128,0.25)"; ctx.lineWidth = 10 * dpr; ctx.lineCap="round"; ctx.stroke();
  // Fill
  const scoreAngle = startA + score * Math.PI;
  const color = score > 0.85 ? "#22c55e" : score > 0.65 ? "#f59e0b" : "#ef4444";
  ctx.beginPath(); ctx.arc(cx, cy, r, startA, scoreAngle);
  ctx.strokeStyle = color; ctx.lineWidth = 10 * dpr; ctx.lineCap="round"; ctx.stroke();
  // Glow dot
  const dotX = cx + r * Math.cos(scoreAngle);
  const dotY = cy + r * Math.sin(scoreAngle);
  ctx.beginPath(); ctx.arc(dotX, dotY, 7*dpr, 0, Math.PI*2);
  ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 12; ctx.fill();
  ctx.shadowBlur = 0;
}

// ── Build Archive Table ───────────────────────────────────────────────────────
function buildECGArchiveTable() {
  const tbody = document.getElementById("ecg-archive-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";
  ECG_ARCHIVE_RECORDS.forEach(rec => {
    const cls = rec.classification.includes("Fibrillation") ? "critical" :
                (rec.classification.includes("PVC") || rec.classification.includes("Brady") || rec.classification.includes("Tachy")) ? "watch" : "normal";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><span style="font-family:var(--font-mono);font-size:0.76rem;font-weight:700;">${rec.recording_id}</span></td>
      <td style="font-size:0.78rem;color:var(--text-muted);">${rec.ts}</td>
      <td style="font-family:var(--font-mono);">${rec.duration}</td>
      <td><span class="status-badge ${cls}" style="font-size:0.65rem;">${rec.classification}</span></td>
      <td style="font-family:var(--font-mono);font-weight:700;">${rec.confidence}</td>
      <td style="font-family:var(--font-mono);">${rec.hr} bpm</td>
      <td style="font-family:var(--font-mono);">${rec.qtc}</td>
      <td style="font-family:var(--font-mono);">${rec.sqi}</td>
      <td><button class="btn btn-secondary" style="font-size:0.68rem;padding:4px 10px;" onclick="loadECGScenario(${rec.scenario});document.getElementById('ecg-scenario-select').value='${rec.scenario}';">Load</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Control Functions ─────────────────────────────────────────────────────────
function setEcgSpeed(val) {
  _ecgSpeed = val;
  document.querySelectorAll("[data-speed]").forEach(b => {
    b.classList.toggle("active", parseFloat(b.dataset.speed) === val);
  });
}

function setEcgGain(val) {
  _ecgGain = val;
  document.querySelectorAll("[data-gain]").forEach(b => {
    b.classList.toggle("active", parseFloat(b.dataset.gain) === val);
  });
}

function toggleECGRecording() {
  _ecgIsRecording = !_ecgIsRecording;
  const btn  = document.getElementById("btn-ecg-record");
  const lbl  = document.getElementById("ecg-record-btn-label");
  if (btn) {
    btn.style.background = _ecgIsRecording ? "#DC2626" : "";
    btn.style.borderColor = _ecgIsRecording ? "#DC2626" : "";
  }
  if (lbl) lbl.textContent = _ecgIsRecording ? "Stop Recording" : "Start Recording";
  if (_ecgIsRecording) {
    updateECGStepper(1);
    setTimeout(() => updateECGStepper(2), 800);
    setTimeout(() => updateECGStepper(3), 1600);
    setTimeout(() => updateECGStepper(4), 2600);
    setTimeout(() => { updateECGStepperDone(); if(_ecgIsRecording){toggleECGRecording();} }, 4000);
  }
}

function updateECGStepper(activeStep) {
  document.querySelectorAll(".ecg-step").forEach((el, i) => {
    el.classList.remove("done", "active");
    if (i < activeStep) el.classList.add("done");
    else if (i === activeStep) el.classList.add("active");
  });
  document.querySelectorAll(".ecg-step-line").forEach((el, i) => {
    el.classList.toggle("done", i < activeStep);
  });
}
function updateECGStepperDone() {
  document.querySelectorAll(".ecg-step").forEach(el => { el.classList.remove("active"); el.classList.add("done"); });
  document.querySelectorAll(".ecg-step-line").forEach(el => el.classList.add("done"));
}

function toggleEcgFullscreen() {
  const frame = document.getElementById("ecg-ai-monitor-frame");
  if (!frame) return;
  if (!document.fullscreenElement) {
    frame.requestFullscreen && frame.requestFullscreen();
  } else {
    document.exitFullscreen && document.exitFullscreen();
  }
}

function markECGReviewed() {
  _ecgReviewStatus = "REVIEWED";
  const badge = document.getElementById("ecg-review-status-badge");
  if (badge) {
    badge.textContent = "REVIEWED ✓";
    badge.className = "status-badge normal";
  }
}

function printECGReport() {
  const sc = ECG_DEMO_SCENARIOS[_ecgCurrentScenario];
  const m  = sc.metrics;
  const win = window.open("", "_blank", "width=850,height=1100");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>ECG Report — ${sc.recording_id}</title>
  <style>
    body{font-family:'Inter',sans-serif;margin:32px;color:#1B2016;background:#fff;}
    h1{font-size:1.4rem;margin:0 0 4px;}h2{font-size:1rem;margin:1rem 0 0.4rem;color:#374151;}
    .sub{color:#6B7280;font-size:0.85rem;}.badge{display:inline-block;padding:3px 10px;border-radius:6px;font-size:0.75rem;font-weight:700;}
    .normal{background:#DCFCE7;color:#166534;}.attention{background:#FEF9C3;color:#854D0E;}.high_priority{background:#FEE2E2;color:#991B1B;}
    table{width:100%;border-collapse:collapse;margin-top:0.5rem;}td,th{padding:7px 10px;border:1px solid #E5E7EB;font-size:0.82rem;}
    th{background:#F3F4F6;font-weight:700;}
    .disclaimer{font-size:0.72rem;color:#9CA3AF;margin-top:1.5rem;padding-top:0.75rem;border-top:1px solid #E5E7EB;}
    @media print{body{margin:16px;}}
  </style></head><body>
  <h1>JeevOne — ECG Analysis Report</h1>
  <div class="sub">Recording: ${sc.recording_id} &nbsp;|&nbsp; Analyzed: ${new Date().toLocaleString()} &nbsp;|&nbsp; Model: JeevECG-Demo-v1.0</div>
  <div style="margin-top:12px;"><span class="badge ${sc.severity}">${sc.primary_rhythm}</span> &nbsp; Confidence: <strong>${sc.confidence}%</strong></div>
  <h2>Summary</h2><p>${sc.summary.detail}</p>
  <p><strong>Next Steps:</strong> ${sc.summary.next_steps}</p>
  <h2>Cardiac Metrics</h2>
  <table><tr><th>Parameter</th><th>Value</th><th>Reference</th></tr>
  <tr><td>Average HR</td><td>${m.avg_hr_bpm} bpm</td><td>60–100 bpm</td></tr>
  <tr><td>Min / Max HR</td><td>${m.min_hr_bpm} / ${m.max_hr_bpm} bpm</td><td>—</td></tr>
  <tr><td>Average RR</td><td>${m.avg_rr_ms} ms</td><td>600–1000 ms</td></tr>
  <tr><td>PR Interval</td><td>${m.pr_ms ? m.pr_ms + " ms" : "Unavailable"}</td><td>120–200 ms</td></tr>
  <tr><td>QRS Duration</td><td>${m.qrs_ms} ms</td><td>60–100 ms</td></tr>
  <tr><td>QTc Interval</td><td>${m.qtc_ms ? m.qtc_ms + " ms" : "Unavailable"}</td><td>&lt; 440 ms</td></tr>
  <tr><td>R-Peaks Detected</td><td>${m.r_peaks_detected}</td><td>—</td></tr>
  <tr><td>Abnormal Beats</td><td>${m.abnormal_beats}</td><td>—</td></tr>
  </table>
  <h2>Signal Quality</h2>
  <p>SQI Score: <strong>${Math.round(sc.signal_quality.sqi_score * 1000) / 10}%</strong> — ${sc.summary.quality} &nbsp;|&nbsp; Lead Contact: ${sc.signal_quality.lead_contact}</p>
  <div class="disclaimer">This report is generated by a demonstration AI model for informational and wellness monitoring purposes only. It does not constitute medical advice or diagnosis. Always consult a qualified healthcare professional for clinical concerns.</div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

// ── Export ECG CSV ─────────────────────────────────────────────────────────────
function exportECGCSV() {
  const sc = ECG_DEMO_SCENARIOS[_ecgCurrentScenario];
  if (!sc) return;
  const now = new Date().toISOString();
  let csv = "JeevOne AI-Powered ECG Analysis Studio Export\n";
  csv += `Export Timestamp,${now}\n`;
  csv += `Recording ID,${sc.recording_id}\n`;
  csv += `Patient ID,patient_01\n`;
  csv += `Primary Rhythm Classification,${sc.primary_rhythm}\n`;
  csv += `Rhythm Code,${sc.rhythm_code}\n`;
  csv += `Confidence Pct,${sc.confidence}%\n`;
  csv += `Severity,${sc.severity}\n`;
  csv += `Sampling Frequency,250 Hz\n`;
  csv += `Recording Duration,${sc.duration_sec} seconds\n`;
  csv += `Signal Quality Score (SQI),${Math.round(sc.signal_quality.sqi_score * 1000) / 10}%\n`;
  const m = sc.metrics;
  csv += `Average Heart Rate,${m.avg_hr_bpm} BPM\n`;
  csv += `Min Heart Rate,${m.min_hr_bpm} BPM\n`;
  csv += `Max Heart Rate,${m.max_hr_bpm} BPM\n`;
  csv += `Average RR Interval,${m.avg_rr_ms} ms\n`;
  csv += `PR Interval,${m.pr_ms ? m.pr_ms + " ms" : "Unavailable"}\n`;
  csv += `QRS Duration,${m.qrs_ms} ms\n`;
  csv += `QT Interval,${m.qt_ms ? m.qt_ms + " ms" : "Unavailable"}\n`;
  csv += `QTc Bazett,${m.qtc_ms ? m.qtc_ms + " ms" : "Unavailable"}\n`;
  csv += `Detected R-Peaks,${m.r_peaks_detected}\n`;
  csv += `Abnormal Beats,${m.abnormal_beats}\n`;
  csv += `Classified Beats Pct,${m.pct_classified}%\n`;
  csv += `\nTimeline Episodes\n`;
  csv += `Start (s),End (s),Rhythm,Severity,Description\n`;
  (sc.timeline_episodes || []).forEach(ep => {
    csv += `${ep.start_sec},${ep.end_sec},${ep.rhythm},${ep.severity},"${ep.label}"\n`;
  });
  csv += `\nDisclaimer,"This data is generated by an algorithmic model for demonstration and clinical monitoring decision-support only. Not a medical diagnosis."\n`;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jeev_ecg_${sc.recording_id}_${sc.rhythm_code}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("ECG CSV Exported", `Downloaded analysis for ${sc.recording_id}`, "success");
}
