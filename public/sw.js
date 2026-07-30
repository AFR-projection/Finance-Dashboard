/* Ledgerly service worker. Plain JS — served as-is from /sw.js. */

const VERSION = "v1";
const SHELL_CACHE = `ledgerly-shell-${VERSION}`;
const STATIC_CACHE = `ledgerly-static-${VERSION}`;

const SHELL_ASSETS = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.webmanifest",
];

// Financial data must never come from a stale cache, and /access drives a
// realtime approval handshake that caching would break.
const NEVER_CACHE = ["/api/", "/socket.io/", "/access", "/setup"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isBypassed(url) {
  return NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/offline").then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Ledgerly", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Ledgerly";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || "ledgerly-heartbeat",
      renotify: true,
      data: { url: payload.url || "/dashboard/insights" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(target).then((navigated) => navigated && navigated.focus());
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
