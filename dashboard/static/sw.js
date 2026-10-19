/**
 * Spectrona / Jeev One – Progressive Web App Service Worker
 * Version: 1.0.0
 * 
 * Provides offline caching, instantaneous launch, stale-while-revalidate asset delivery,
 * and reliable edge node operation on mobile devices and desktop.
 */

const CACHE_NAME = "spectrona-dashboard-v1.0.0";
const PRECACHE_ASSETS = [
  "/dashboard",
  "/manifest.json",
  "/static/manifest.json",
  "/static/css/dashboard.css",
  "/static/js/dashboard.js",
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
      console.log("[PWA Service Worker] Pre-caching offline dashboard shell");
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn("[PWA Service Worker] Some assets failed to precache:", err);
      });
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: Clean Stale Caches ─────────────────────────────────────────────
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

// ── Fetch: Strategic Asset Routing ───────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Never cache Server-Sent Events (SSE) or WebSockets
  if (url.pathname === "/stream" || url.pathname.startsWith("/ws")) {
    return;
  }

  // 2. Navigation requests: Network-First strictly for /dashboard
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
    // Landing page and other navigation bypasses service worker
    return;
  }

  // 3. API endpoints: Network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    // Only cache GET queries (latest, history, baseline, users)
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

  // 4. Static assets (JS, CSS, Images, Fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => {/* Offline fallback */});

      return cachedResponse || fetchPromise;
    })
  );
});

// ── Background Sync / Push Notification Hook ─────────────────────────────────
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
