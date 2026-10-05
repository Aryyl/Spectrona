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
  ICONS.inject($("icon-search"), "search");
  ICONS.inject($("icon-bell"), "bell");
  ICONS.inject($("icon-user"), "user");
  ICONS.inject($("icon-share"), "share");
  ICONS.inject($("icon-download"), "download");
  ICONS.inject($("icon-filter"), "filter");

  ICONS.inject($("icon-hr"), "heart");
  ICONS.inject($("icon-spo2"), "lungs");
  ICONS.inject($("icon-btemp"), "thermometer");
  ICONS.inject($("icon-env"), "droplet");

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

function initCharts() {
  // Gauge Chart (Doughnut)
  const gaugeCtx = $("gauge-chart").getContext("2d");
  gaugeChart = new Chart(gaugeCtx, {
    type: 'doughnut',
    data: {
      labels: ['Risk', 'Remaining'],
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#059669', '#E5E7EB'],
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
        backgroundColor: '#C7D2FE', // Lighter purple
        hoverBackgroundColor: '#8B5CF6', // Primary accent
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
          grid: { color: '#F3F4F6', drawBorder: false },
          border: { display: false },
          ticks: { color: '#9CA3AF', font: { family: 'Inter' }, padding: 10 }
        }
      }
    }
  });
}

function updateCharts(latestHr, overall) {
  // Update Gauge
  let color = '#059669'; // Normal
  let percentage = 20;
  if (overall === 'WATCH') { color = '#F59E0B'; percentage = 60; }
  else if (overall === 'HIGH') { color = '#EF4444'; percentage = 95; }

  gaugeChart.data.datasets[0].data = [percentage, 100 - percentage];
  gaugeChart.data.datasets[0].backgroundColor = [color, '#E5E7EB'];
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
    const bgColors = trendData.map((_, i) => i === trendData.length - 1 ? '#8B5CF6' : '#C7D2FE');
    trendChart.data.datasets[0].backgroundColor = bgColors;
    
    trendChart.update();
  }
}

// ── Dashboard update ──────────────────────────────────────────────────────────
let _prevOverall = null;
let _prevValues = {};
const tbody = $("readings-tbody");

function applyUpdate(data) {
  const latest = data.latest || {};
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

  // ── Overall Status (Gauge)
  const overall = risk.overall_status || "NORMAL";
  const statusEl = $("overall-status");
  statusEl.textContent = overall;
  
  if (overall === "HIGH") statusEl.style.color = 'var(--risk-high)';
  else if (overall === "WATCH") statusEl.style.color = 'var(--risk-watch)';
  else statusEl.style.color = 'var(--risk-normal)';

  const recEl = $("recommendation");
  recEl.textContent = risk.recommendation || "Monitoring active...";

  // ── Charts
  updateCharts(latest.heart_rate, overall);

  // ── Table Update
  if (latest.timestamp) {
    const ts = new Date(latest.timestamp * 1000).toLocaleTimeString();
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
    if (tbody.children.length > 10) tbody.removeChild(tbody.lastChild); // keep last 10
  }

  // ── Alert toast on status change
  if (overall !== _prevOverall && _prevOverall !== null) {
    showToast(overall, risk.recommendation || "Status changed");
  }
  _prevOverall = overall;
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

// ── Toast ──────────────────────────────────────────────────────────────────────
let _toastTimer = null;

function showToast(level, message) {
  const toast    = $("alert-toast");
  const iconEl   = $("toast-icon");
  const titleEl  = $("toast-title");
  const msgEl    = $("toast-msg");

  const iconMap  = { NORMAL: "check", WATCH: "warning", HIGH: "warning" };
  const titleMap = { NORMAL: "Status Normal", WATCH: "Watch Alert", HIGH: "High Risk Alert" };

  ICONS.inject(iconEl, iconMap[level] || "shield");
  titleEl.textContent = titleMap[level] || level;
  msgEl.textContent   = message.slice(0, 160) + (message.length > 160 ? "…" : "");

  toast.className = `alert-toast show toast--${level.toLowerCase()}`;

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(dismissToast, 9000);
}

function dismissToast() {
  $("alert-toast").className = "alert-toast";
}

// ── SSE / Polling ──────────────────────────────────────────────────────────────
function startSSE() {
  const es = new EventSource("/stream");
  es.onopen = () => { $("connection-dot").className = "dot dot--connected"; };
  es.onmessage = ev => {
    try {
      const data = JSON.parse(ev.data);
      if (data.event_type === "heartbeat") return;
      if (data.reading) applyUpdate(data);
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
      if (data.latest) applyUpdate(data);
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

// ── Init ───────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  injectIcons();
  $("toast-close").addEventListener("click", dismissToast);
  
  initCharts();
  fetchBaseline();

  if (typeof EventSource !== "undefined") {
    startSSE();
  } else {
    startPolling();
  }
});
