/**
 * Jeev One – Progressive Web App Service Worker
 * Version: 2.6.0
 * 
 * Provides offline caching, instantaneous launch, network-first live code delivery,
 * and reliable edge node operation on mobile devices and desktop.
 */

const CACHE_NAME = "jeevone-dashboard-v2.6.0";
const PRECACHE_ASSETS = [
  "/dashboard",
  "/manifest.json",
  "/static/manifest.json",
  "/static/css/dashboard.css?v=2.5",
  "/static/js/dashboard.js?v=2.5",
  "/static/js/icons.js",
  "/static/images/jeev_one_logo.webp",
  "/static/images/favicon.png",
  "/static/icons/icon-192x192.png",
  "/static/icons/icon-512x512.png",
  "/static/icons/icon-maskable-192x192.png",
  "/static/icons/icon-maskable-512x512.png",
  "/static/icons/apple-touch-icon.png",
  "https://cdn.jsdelivr.net/npm/chart.js",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
];

// ── Install: Precache Dashboard App Shell ────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[PWA Service Worker] Pre-caching offline dashboard shell v2.5.0");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[PWA Service Worker] Some assets failed to precache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: Clean Stale Caches & Claim Clients Immediately ─────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[PWA Service Worker] Purging legacy cache:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Message Listener (e.g. SKIP_WAITING from client) ─────────────────────────
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ── Fetch: Strategic Asset Routing ───────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Completely bypass external or cross-origin requests
  // Crucial: Firestore long-polling, Google APIs, and auth must never be intercepted
  if (url.origin !== self.location.origin) {
    if (url.hostname.includes("googleapis.com") || url.hostname.includes("firebase") || url.hostname.includes("gstatic.com")) {
      return; // Direct native network bypass for real-time Firebase WebChannel & REST
    }
    // Precached CDN assets (Chart.js, Google Fonts): cache with network fallback
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
    );
    return;
  }

  // 2. Never cache Server-Sent Events (SSE) or WebSockets
  if (url.pathname === "/stream" || url.pathname.startsWith("/ws")) {
    return;
  }

  // 3. Navigation requests: Network-First strictly for /dashboard
  if (event.request.mode === "navigate") {
    if (url.pathname.startsWith("/dashboard")) {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            const dashboardFallback = await caches.match("/dashboard");
            if (dashboardFallback) return dashboardFallback;
            return new Response("Offline - Please reconnect to Edge Node", { status: 503 });
          })
      );
      return;
    }
    return;
  }

  // 4. API endpoints: Network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    if (event.request.method === "GET") {
      event.respondWith(
        fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkResponse;
          })
          .catch(async () => {
            const cached = await caches.match(event.request);
            if (cached) return cached;
            return new Response(JSON.stringify({ status: "offline", offline: true }), {
              headers: { "Content-Type": "application/json" }
            });
          })
      );
    }
    return;
  }

  // 5. Static scripts and styles: Network-First with cache fallback
  // Ensures mobile phone PWAs always receive fresh code when online
  if (url.pathname.endsWith(".js") || url.pathname.endsWith(".css")) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return new Response("", { status: 404 });
        })
    );
    return;
  }

  // 6. Other static assets (Images, Icons, Fonts): Cache-First
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {/* Offline fallback */});
    })
  );
});

// ── Push Notification Hooks ──────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || "Jeev One Health Alert";
    const options = {
      body: payload.message || "Vital parameter threshold breach detected.",
      icon: "/static/icons/icon-192x192.png",
      badge: "/static/icons/icon-192x192.png",
      vibrate: [200, 100, 200, 100, 200],
      tag: payload.tag || "vital-alert",
      data: { url: "/dashboard" }
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("[PWA Service Worker] Push notification parse error:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/dashboard") && "focus" in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow("/dashboard");
      }
    })
  );
});
