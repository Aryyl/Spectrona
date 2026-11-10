/**
 * landing.js
 * ==========
 * Interactive behavior for the JEEV_ONE editorial landing page.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initMobileDrawer();
  initServiceShowcase();
  initInsightsAccordion();
  initGalleryLightbox();
  initPWA();
});

// ── Mobile Navigation Drawer Toggle ──────────────────────────────────────────
function initMobileDrawer() {
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  const drawer = document.getElementById("mobile-drawer");
  const backdrop = document.getElementById("mobile-drawer-backdrop");
  const closeBtn = document.getElementById("drawer-close-btn");

  if (!toggleBtn || !drawer || !backdrop) return;

  function openDrawer() {
    drawer.classList.add("open");
    backdrop.classList.add("active");
    toggleBtn.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawer.classList.remove("open");
    backdrop.classList.remove("active");
    toggleBtn.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  toggleBtn.addEventListener("click", () => {
    if (drawer.classList.contains("open")) {
      closeDrawer();
    } else {
      openDrawer();
    }
  });

  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer.classList.contains("open")) {
      closeDrawer();
    }
  });

  const drawerLinks = drawer.querySelectorAll(".drawer-link, .drawer-cta-btn");
  drawerLinks.forEach((link) => {
    link.addEventListener("click", () => {
      closeDrawer();
    });
  });
}

// ── Interactive Services & Capabilities Selector ─────────────────────────────
function initServiceShowcase() {
  const tabs = Array.from(document.querySelectorAll(".service-index-item"));
  const panes = Array.from(document.querySelectorAll(".service-pane"));

  if (!tabs.length || !panes.length) return;

  function activateService(index) {
    tabs.forEach((tab, idx) => {
      const isSelected = idx === index;
      tab.classList.toggle("active", isSelected);
      tab.setAttribute("aria-selected", String(isSelected));
    });

    panes.forEach((pane, idx) => {
      const isSelected = idx === index;
      pane.classList.toggle("active", isSelected);
      pane.hidden = !isSelected;
    });
  }

  tabs.forEach((tab, idx) => {
    tab.addEventListener("click", () => {
      activateService(idx);
    });

    tab.addEventListener("keydown", (e) => {
      let nextIdx = null;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        nextIdx = (idx + 1) % tabs.length;
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        nextIdx = (idx - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        nextIdx = 0;
      } else if (e.key === "End") {
        nextIdx = tabs.length - 1;
      }

      if (nextIdx !== null) {
        e.preventDefault();
        activateService(nextIdx);
        tabs[nextIdx].focus();
      }
    });
  });
}

// ── Deployment Insights Accordion ────────────────────────────────────────────
function initInsightsAccordion() {
  const accordion = document.getElementById("platform-accordion");
  if (!accordion) return;

  const items = accordion.querySelectorAll(".editorial-accordion-item");

  items.forEach((item) => {
    const trigger = item.querySelector(".accordion-trigger");
    if (!trigger) return;

    trigger.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");

      // Close all other items for clean single-open accordion behavior
      items.forEach((other) => {
        other.classList.remove("open");
        const t = other.querySelector(".accordion-trigger");
        if (t) t.setAttribute("aria-expanded", "false");
      });

      if (!isOpen) {
        item.classList.add("open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });

  // Open first item by default for discovery
  if (items.length > 0) {
    items[0].classList.add("open");
    const firstTrigger = items[0].querySelector(".accordion-trigger");
    if (firstTrigger) firstTrigger.setAttribute("aria-expanded", "true");
  }
}

// ── Interactive Hardware Gallery Lightbox ─────────────────────────────────────
function initGalleryLightbox() {
  const lightbox = document.getElementById("gallery-lightbox");
  const lightboxImg = document.getElementById("lightbox-img");
  const lightboxTitle = document.getElementById("lightbox-title");
  const lightboxDesc = document.getElementById("lightbox-desc");
  const closeBtn = document.getElementById("lightbox-close-btn");
  const backdrop = document.getElementById("lightbox-backdrop");
  const cards = document.querySelectorAll(".gallery-editorial-card");

  if (!lightbox || !lightboxImg || !cards.length) return;

  let lastTrigger = null;

  function openLightbox(card) {
    lastTrigger = card;
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
    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  }

  cards.forEach((card) => {
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

// ── Progressive Web App (PWA) Registration ──────────────────────────────────
function initPWA() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          try { reg.update(); } catch(e) {}
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    });
  }
}
