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

function initCharts() {
  const isDark = isDarkTheme();
  const emptyTrackColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#E5E7EB";
  const defaultBarColor = isDark ? "rgba(167, 139, 250, 0.35)" : "#C7D2FE";
  const activeBarColor  = isDark ? "#a78bfa" : "#8B5CF6";
  const gridColor       = isDark ? "rgba(255, 255, 255, 0.06)" : "#F3F4F6";
  const tickColor       = isDark ? "#71717a" : "#9CA3AF";

  // Gauge Chart (Doughnut)
  const gaugeCtx = $("gauge-chart").getContext("2d");
  gaugeChart = new Chart(gaugeCtx, {
    type: 'doughnut',
    data: {
      labels: ['Risk', 'Remaining'],
      datasets: [{
        data: [0, 100],
        backgroundColor: [isDark ? '#22c55e' : '#059669', emptyTrackColor],
        borderWidth: 0,
        circumference: 180,
        rotation: 270,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '75%',
      plugins: { tooltip: { enabled: false }, legend: { display: false } },
      animation: { animateRotate: true, animateScale: false }
    }
  });

  // Trend Chart (Bar Chart styled like Fundio)
  const trendCtx = $("trend-chart").getContext("2d");
  trendChart = new Chart(trendCtx, {
    type: 'bar',
    data: {
      labels: trendLabels,
      datasets: [{
        label: 'Heart Rate',
        data: trendData,
        backgroundColor: defaultBarColor,
        hoverBackgroundColor: activeBarColor,
        borderRadius: 4,
        barPercentage: 0.8,
        categoryPercentage: 0.9
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#111827',
          padding: 12,
          titleFont: { size: 13, family: 'Inter' },
          bodyFont: { size: 14, family: 'Inter', weight: 'bold' },
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
          ticks: { color: tickColor, font: { family: 'Inter' }, padding: 10 }
        }
      }
    }
  });
}

function updateChartsTheme() {
  if (!gaugeChart || !trendChart) return;
  const isDark = isDarkTheme();
  const emptyTrackColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#E5E7EB";
  const defaultBarColor = isDark ? "rgba(167, 139, 250, 0.35)" : "#C7D2FE";
  const activeBarColor  = isDark ? "#a78bfa" : "#8B5CF6";
  const gridColor       = isDark ? "rgba(255, 255, 255, 0.06)" : "#F3F4F6";
  const tickColor       = isDark ? "#71717a" : "#9CA3AF";

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
  const isDark = isDarkTheme();
  const emptyTrackColor = isDark ? "rgba(255, 255, 255, 0.08)" : "#E5E7EB";
  const defaultBarColor = isDark ? "rgba(167, 139, 250, 0.35)" : "#C7D2FE";
  const activeBarColor  = isDark ? "#a78bfa" : "#8B5CF6";

  // Update Gauge
  let color = isDark ? '#22c55e' : '#059669'; // Normal
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
    
    // Highlight the latest bar with the primary accent color
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

  // ── Baseline sub-labels
  if (window._baseline) {
    const bl = window._baseline;
    $("sub-hr").textContent    = `Baseline: ${fmt0(bl.heart_rate)} bpm`;
    $("sub-spo2").textContent  = `Baseline: ${fmt1(bl.spo2)}%`;
    $("sub-btemp").textContent = `Baseline: ${fmt1(bl.body_temperature)}°C`;
  }

  // ── Blood Pressure Sub-label
  const bpSub = $("sub-bp-display");
  if (bpSub) {
    if (latest.bp_sys && latest.bp_dia && latest.bp_sys > 0) {
      bpSub.textContent = `BP: ${fmt0(latest.bp_sys)}/${fmt0(latest.bp_dia)} mmHg`;
      bpSub.style.background = "var(--accent-soft)";
      bpSub.style.color = "var(--accent)";
    } else {
      bpSub.textContent = "Room Conditions";
    }
  }

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

    row.innerHTML = `
      <td style="font-family: var(--font-mono); color: var(--text-muted)">${ts}</td>
      <td style="font-weight: 500">${fmt0(latest.heart_rate)} bpm</td>
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

  // Update card alarm glowing states and notification drawer
  updateCardAlarms(_activeAlerts);
  renderNotificationList();
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

// ── SSE / Polling ──────────────────────────────────────────────────────────────
function startSSE() {
  const es = new EventSource("/stream");
  es.onopen = () => { $("connection-dot").className = "dot dot--connected"; };
  es.onmessage = ev => {
    try {
      const data = JSON.parse(ev.data);
      if (data.event_type === "heartbeat") return;
      if (data.reading || data.latest) applyUpdate(data);
      fetchBaseline();
    } catch (e) { console.warn("SSE parse error", e); }
  };
  es.onerror = () => {
    $("connection-dot").className = "dot dot--error";
    es.close();
    setTimeout(startPolling, 2000);
  };
}

function startPolling() {
  $("connection-dot").className = "dot dot--connecting";
  fetchLatest();
  setInterval(fetchLatest, 5000);
}

function fetchLatest() {
  fetch("/api/latest")
    .then(r => r.json())
    .then(data => {
      if (data.latest || data.reading) applyUpdate(data);
      fetchBaseline();
      $("connection-dot").className = "dot dot--connected";
    })
    .catch(e => {
      $("connection-dot").className = "dot dot--error";
    });
}

function fetchBaseline() {
  fetch("/api/baseline")
    .then(r => r.json())
    .then(bl => { window._baseline = bl; })
    .catch(() => {});
}

function fetchHistory() {
  fetch("/api/history")
    .then(r => r.json())
    .then(records => {
      if (!Array.isArray(records) || records.length === 0) return;
      const tbody = $("readings-tbody");
      if (!tbody) return;
      tbody.innerHTML = "";
      // Populate table with existing records (newest to oldest)
      const recent = records.slice(0, 25);
      for (const rec of recent) {
        if (!rec.timestamp) continue;
        const parsed = new Date(rec.timestamp);
        const ts = isNaN(parsed.getTime()) ? rec.timestamp : parsed.toLocaleTimeString();
        const row = document.createElement("tr");
        row.innerHTML = `
          <td style="font-family: var(--font-mono); color: var(--text-muted)">${ts}</td>
          <td style="font-weight: 500">${fmt0(rec.heart_rate)} bpm</td>
          <td>${fmt1(rec.spo2)}%</td>
          <td>${fmt1(rec.body_temperature)}°C</td>
          <td><span class="status-badge normal">NORMAL</span></td>
        `;
        tbody.appendChild(row);
      }
      const counterBadge = $("records-counter-badge");
      if (counterBadge) counterBadge.textContent = `${tbody.children.length} RECENT PACKETS`;
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
          new Notification("JEEV_ONE Health Monitor", {
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
    blood_pressure: $("card-env"),
    heat_index: $("card-env")
  };
  const tags = {
    heart_rate: $("tag-hr"),
    spo2: $("tag-spo2"),
    body_temperature: $("tag-btemp"),
    blood_pressure: $("tag-bp"),
    heat_index: $("tag-bp")
  };

  // Reset all cards and tags to default
  Object.values(cards).forEach(c => {
    if (c) c.classList.remove("card-alarm-critical", "card-alarm-warning");
  });
  if (tags.heart_rate) { tags.heart_rate.className = "vital-status-pill normal"; tags.heart_rate.textContent = "NORMAL"; }
  if (tags.spo2) { tags.spo2.className = "vital-status-pill normal"; tags.spo2.textContent = "NORMAL"; }
  if (tags.body_temperature) { tags.body_temperature.className = "vital-status-pill normal"; tags.body_temperature.textContent = "NORMAL"; }
  if (tags.blood_pressure) { tags.blood_pressure.className = "vital-status-pill normal"; tags.blood_pressure.textContent = "NORMAL"; }

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

// ── Slide Down User Profile Switcher (Demo) ───────────────────────────────────
function initUserSwitcher() {
  const wrapper = $("user-menu-wrapper");
  const btn = $("user-profile-btn");
  const menu = $("user-dropdown-menu");
  const items = document.querySelectorAll(".user-item");

  if (!btn || !menu) return;

  const PROFILES = {
    user_1: {
      name: "Alex Mercer",
      role: "Subject 01",
      initials: "AM",
      bgClass: "avatar-blue",
      welcomeSubtitle: "Viewing real-time biometric telemetry and edge risk evaluation for Subject 01."
    },
    user_2: {
      name: "Elena Vance",
      role: "Subject 02",
      initials: "EV",
      bgClass: "avatar-amber",
      welcomeSubtitle: "Viewing heat strain trial telemetry and core biometrics for Subject 02."
    },
    user_3: {
      name: "David Chen",
      role: "Subject 03",
      initials: "DC",
      bgClass: "avatar-purple",
      welcomeSubtitle: "Viewing continuous SpO2 and hemodynamic stability for Subject 03."
    },
    user_4: {
      name: "Dr. Marcus Thorne",
      role: "Field Physician",
      initials: "MT",
      bgClass: "avatar-green",
      welcomeSubtitle: "Administrator triage mode • Field node live monitor active."
    }
  };

  function selectUser(userId, notify = true) {
    const p = PROFILES[userId];
    if (!p) return;

    items.forEach(el => {
      el.classList.toggle("active", el.getAttribute("data-user-id") === userId);
    });

    const nameEl = $("user-name");
    const roleEl = $("user-role");
    const badgeEl = $("user-avatar-badge");
    const welcomeH2 = document.querySelector(".welcome-text h2");
    const welcomeP = document.querySelector(".welcome-text p");

    if (nameEl) nameEl.textContent = p.name;
    if (roleEl) roleEl.textContent = p.role;
    if (badgeEl) {
      badgeEl.innerHTML = `<span>${p.initials}</span>`;
      badgeEl.className = `user-avatar-badge ${p.bgClass}`;
    }
    if (welcomeH2) welcomeH2.textContent = `Welcome back, ${p.name.split(" ")[0]}!`;
    if (welcomeP) welcomeP.textContent = p.welcomeSubtitle;

    localStorage.setItem("jeev_one_user_id", userId);
    closeMenu();
    if (notify) {
      showToast(`Active profile switched to ${p.name} (${p.role})`);
    }
  }

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
    });
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        const id = item.getAttribute("data-user-id");
        selectUser(id, true);
      }
    });
  });

  document.addEventListener("click", (e) => {
    if (wrapper && !wrapper.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  // Restore saved profile
  const saved = localStorage.getItem("jeev_one_user_id");
  if (saved && PROFILES[saved]) {
    selectUser(saved, false);
  }
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

    // Toggle button active classes
    tabButtons.forEach(btn => {
      const targetTab = btn.getAttribute("data-tab");
      btn.classList.toggle("active", targetTab === tabId);
    });

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
            liveCanvas.height = 190 * (window.devicePixelRatio || 1);
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
  }

  // Wire direct view history button from live card
  const btnViewHistory = $("btn-view-ecg-history");
  if (btnViewHistory) {
    btnViewHistory.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab("ecg");
    });
  }

  tabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const tabId = btn.getAttribute("data-tab");
      switchTab(tabId);
    });
  });

  // Check URL hash or localStorage
  const hash = window.location.hash.replace("#", "");
  let initialTab = "live";
  if (hash && $(`tab-${hash}`)) {
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
      showToast(`Switched to ${isDark ? 'Dark OLED' : 'Light'} Theme`);
    }
  }

  // Load saved theme or default to dark
  const savedTheme = localStorage.getItem("jeev_one_theme");
  const systemPrefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  const initialTheme = savedTheme ? savedTheme : (systemPrefersDark ? "dark" : "dark"); // Default to dark

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
      canvas.height = 190 * (window.devicePixelRatio || 1);
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

    context.fillStyle = "#020704";
    context.fillRect(0, 0, w, h);

    // Minor 1mm grid
    context.strokeStyle = "rgba(34, 197, 94, 0.07)";
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
    context.strokeStyle = "rgba(34, 197, 94, 0.18)";
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
    ctx.fillStyle = "#020704";
    ctx.fillRect(sweepX, 0, sweepClearWidth, h);

    // Redraw grid slice
    const minorGrid = 16 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = "rgba(34, 197, 94, 0.07)";
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
  const qtVal = Math.round(392 * Math.sqrt(rrVal / 1000));
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
  let rhythmColor = "#22c55e";

  if (hrVal > 100) {
    rhythmName = "Tachycardia";
    rhythmLong = "Sinus Tachycardia (ST)";
    rhythmColor = "#f59e0b";
  } else if (hrVal < 60) {
    rhythmName = "Bradycardia";
    rhythmLong = "Sinus Bradycardia (SB)";
    rhythmColor = "#3b82f6";
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
    canvas.height = 210 * (window.devicePixelRatio || 1);
  }

  const ctx = canvas.getContext("2d");
  const cw = canvas.width;
  const ch = canvas.height;
  const centerY = ch * 0.55;
  const scaleY = ch * 0.35;

  // Draw 1mm and 5mm medical grid
  const minorGrid = 16 * (window.devicePixelRatio || 1);
  const majorGrid = minorGrid * 5;

  ctx.fillStyle = "#020704";
  ctx.fillRect(0, 0, cw, ch);

  ctx.strokeStyle = "rgba(34, 197, 94, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x < cw; x += minorGrid) {
    ctx.moveTo(x, 0); ctx.lineTo(x, ch);
  }
  for (let y = 0; y < ch; y += minorGrid) {
    ctx.moveTo(0, y); ctx.lineTo(cw, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(34, 197, 94, 0.20)";
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
      <td><span style="font-size: 0.75rem; color: #22c55e;">● ${rec.quality}</span></td>
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

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  injectIcons();
  
  const toastCloseBtn = $("toast-close");
  if (toastCloseBtn) {
    toastCloseBtn.addEventListener("click", dismissToast);
  }

  initTheme();
  initTabs();
  initNotificationCenter();
  initDesktopPush();
  initAlarmSimulator();
  initUserSwitcher();
  initCharts();
  initLiveECG();
  initArchiveECG();
  fetchBaseline();
  fetchHistory();
  fetchAlertsData();
  fetchLatest();

  if (typeof EventSource !== "undefined") {
    startSSE();
  } else {
    startPolling();
  }
});

