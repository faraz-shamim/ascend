// Cache the app shell, never coordinates, camera images, API responses, or map tiles.
const CACHE = "ascend-shell-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) =>
        c.addAll([
          "/",
          "/icon.svg",
          "/art/ascend-cover.webp",
          "/art/companions.webp",
        ]),
      ),
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (
    e.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    u.pathname.startsWith("/api/")
  )
    return;
  if (
    u.pathname.startsWith("/assets/") ||
    u.pathname.startsWith("/art/") ||
    e.request.mode === "navigate"
  )
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
          return r;
        })
        .catch(() =>
          caches
            .match(e.request)
            .then(
              (r) =>
                r ||
                (e.request.mode === "navigate"
                  ? caches.match("/")
                  : Response.error()),
            ),
        ),
    );
});
