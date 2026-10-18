/**
 * landing.js
 * ==========
 * Interactivity and real-time ECG simulation for the Jeev_one landing page.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initNavbarScroll();
  initHeroAboutTransition();
  initDemoVideoPlayer();
  initGalleryLightbox();
  initECGWaveform();
  fetchLivePreviewData();
});

// ── Smooth Hero-to-About Scroll Transition ───────────────────────────────────
function initHeroAboutTransition() {
  const heroSection = document.querySelector(".hero-section");
  const heroBgImage = document.getElementById("hero-bg-image");
  const aboutSection = document.getElementById("about");
  const aboutContainer = aboutSection ? aboutSection.querySelector(".container") : null;

  if (!heroSection || !aboutSection) return;

  let ticking = false;

  function updateTransition() {
    const scrollY = window.pageYOffset || document.documentElement.scrollTop;
    const heroH = heroSection.offsetHeight || window.innerHeight;
    const winH = window.innerHeight;

    // 1. Hero background image slowly fades out as user scrolls down
    if (heroBgImage) {
      const imgFadeEnd = heroH * 0.85;
      const imgFadeProgress = Math.min(1, Math.max(0, scrollY / imgFadeEnd));
      heroBgImage.style.opacity = (1 - imgFadeProgress).toFixed(3);
    }

    // 2. About section scrolls up into view and slowly fades in
    const rect = aboutSection.getBoundingClientRect();
    const fadeInStart = winH * 1.02; // starts fading in just as it enters from screen bottom
    const fadeInEnd = winH * 0.35;   // reaches 100% opacity as it settles into view
    let aboutProgress = (fadeInStart - rect.top) / (fadeInStart - fadeInEnd);
    aboutProgress = Math.max(0, Math.min(1, aboutProgress));

    if (aboutContainer) {
      aboutContainer.style.opacity = aboutProgress.toFixed(3);
      const translateY = (1 - aboutProgress) * 40;
      aboutContainer.style.transform = `translateY(${translateY.toFixed(1)}px)`;
    }

    ticking = false;
  }

  window.addEventListener("scroll", () => {
    if (!ticking) {
      requestAnimationFrame(updateTransition);
      ticking = true;
    }
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (!ticking) {
      requestAnimationFrame(updateTransition);
      ticking = true;
    }
  }, { passive: true });

  // Initial calculation
  updateTransition();
}

// ── Floating Navbar Scroll Reaction ──────────────────────────────────────────
function initNavbarScroll() {
  const nav = document.getElementById("floating-nav");
  if (!nav) return;

  window.addEventListener("scroll", () => {
    if (window.scrollY > 40) {
      nav.style.background = "rgba(7, 7, 8, 0.94)";
      nav.style.boxShadow = "0 20px 40px -15px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.1)";
    } else {
      nav.style.background = "rgba(10, 10, 10, 0.82)";
      nav.style.boxShadow = "0 16px 40px -10px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.05)";
    }
  });
}

// ── Animated Real-Time ECG Waveform Canvas ────────────────────────────────────
function initECGWaveform() {
  const canvas = document.getElementById("ecg-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let width = (canvas.width = canvas.parentElement.clientWidth);
  let height = (canvas.height = 80);

  window.addEventListener("resize", () => {
    width = canvas.width = canvas.parentElement.clientWidth;
    height = canvas.height = 80;
  });

  // Typical ECG baseline + P-Q-R-S-T spike pattern
  const ecgPattern = [
    0, 0, 0.05, 0.1, 0.05, 0, -0.05, 0, // P wave
    -0.1, 0.9, -0.3, 0,                // Q-R-S complex
    0, 0.1, 0.2, 0.15, 0.05, 0, 0, 0,  // T wave
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 // baseline pause
  ];

  const points = [];
  const maxPoints = Math.floor(width / 3);
  let patternIdx = 0;

  for (let i = 0; i < maxPoints; i++) {
    points.push(0);
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Subtle background grid
    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Add new ECG point
    const val = ecgPattern[patternIdx % ecgPattern.length];
    patternIdx++;
    points.push(val);
    if (points.length > maxPoints) {
      points.shift();
    }

    // Draw waveform
    ctx.beginPath();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.75;
    ctx.shadowBlur = 8;
    ctx.shadowColor = "rgba(255, 255, 255, 0.5)";

    const centerY = height / 2;
    const step = width / (points.length - 1);

    for (let i = 0; i < points.length; i++) {
      const x = i * step;
      const y = centerY - points[i] * (height * 0.42);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    requestAnimationFrame(render);
  }

  render();
}

// ── Fetch Live Telemetry to preview on landing page ───────────────────────────
function fetchLivePreviewData() {
  fetch("/api/latest")
    .then(r => r.json())
    .then(data => {
      const r = data.latest || data.reading;
      if (!r) return;

      const hrEl = document.getElementById("preview-hr");
      const spo2El = document.getElementById("preview-spo2");
      const tempEl = document.getElementById("preview-temp");
      const envEl = document.getElementById("preview-env");
      const bpEl = document.getElementById("preview-bp");

      if (hrEl && r.heart_rate) hrEl.innerHTML = `${Math.round(r.heart_rate)} <span class="unit">bpm</span>`;
      if (spo2El && r.spo2) spo2El.innerHTML = `${Number(r.spo2).toFixed(1)} <span class="unit">%</span>`;
      if (tempEl && r.body_temperature) tempEl.innerHTML = `${Number(r.body_temperature).toFixed(1)} <span class="unit">°C</span>`;
      if (envEl && r.room_temperature && r.humidity) {
        envEl.innerHTML = `${Number(r.room_temperature).toFixed(1)}° <span class="unit">| ${Math.round(r.humidity)}%</span>`;
      }
      if (bpEl && r.bp_sys > 0) {
        bpEl.innerHTML = `${Math.round(r.bp_sys)}/${Math.round(r.bp_dia)} <span class="unit">mmHg</span>`;
      }
    })
    .catch(() => {
      // Backend offline or no reading yet — keeps clean defaults
    });
}

// ── Demo Video Player Interactivity ──────────────────────────────────────────
function initDemoVideoPlayer() {
  const overlay = document.getElementById("video-overlay");
  const video = document.getElementById("demo-video");

  if (!overlay || !video) return;

  function handlePlay() {
    overlay.classList.add("playing");
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.controls = true;
      });
    }
  }

  overlay.addEventListener("click", handlePlay);

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handlePlay();
    }
  });

  video.addEventListener("play", () => {
    overlay.classList.add("playing");
  });

  video.addEventListener("ended", () => {
    overlay.classList.remove("playing");
  });
}

// ── Interactive Hardware Gallery Lightbox ─────────────────────────────────────
function initGalleryLightbox() {
  const lightbox = document.getElementById("gallery-lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxTitle = document.getElementById("lightbox-title");
  const lightboxDesc = document.getElementById("lightbox-desc");
  const closeBtn = document.getElementById("lightbox-close-btn");
  const backdrop = document.getElementById("lightbox-backdrop");
  const cards = document.querySelectorAll(".gallery-card");

  if (!lightbox || !lightboxImg || !cards.length) return;

  function openLightbox(card) {
    const fullSrc = card.getAttribute("data-full");
    const title = card.getAttribute("data-title") || "";
    const desc = card.getAttribute("data-desc") || "";

    lightboxImg.src = fullSrc;
    lightboxImg.alt = title;
    if (lightboxTitle) lightboxTitle.textContent = title;
    if (lightboxDesc) lightboxDesc.textContent = desc;

    lightbox.classList.add("active");
    lightbox.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (closeBtn) closeBtn.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("active");
    lightbox.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    setTimeout(() => {
      lightboxImg.src = "";
    }, 250);
  }

  cards.forEach(card => {
    card.addEventListener("click", () => openLightbox(card));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openLightbox(card);
      }
    });
  });

  if (closeBtn) closeBtn.addEventListener("click", closeLightbox);
  if (backdrop) backdrop.addEventListener("click", closeLightbox);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && lightbox.classList.contains("active")) {
      closeLightbox();
    }
  });
}

