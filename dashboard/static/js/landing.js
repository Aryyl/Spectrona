/**
 * landing.js
 * ==========
 * Interactive behavior for the Jeev One editorial landing page.
 */

"use strict";

document.addEventListener("DOMContentLoaded", () => {
  initMobileDrawer();
  initServiceShowcase();
  initInsightsAccordion();
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
