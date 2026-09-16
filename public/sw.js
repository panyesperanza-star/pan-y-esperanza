const CACHE_NAME = "pan-y-esperanza-public-v5";
const STATIC_ASSETS = [
  "/assets/brand/logo.png",
  "/assets/photographs/hero.jpg",
  "/site.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(STATIC_ASSETS.map((asset) => cache.add(asset).catch(() => undefined))),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("pan-y-esperanza-public-") && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // The public site shares this origin with the ERP. Never intercept API,
  // authenticated, navigational, or dynamically generated requests.
  if (
    request.method !== "GET"
    || request.headers.has("authorization")
    || url.origin !== self.location.origin
    || url.search
    || !STATIC_ASSETS.includes(url.pathname)
  ) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request, { cache: "no-store" });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }),
  );
});
