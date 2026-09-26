// Cache the complete shell during installation before replacing the previous worker.
const CACHE = "workout-runner-shell-v10";
const BASE = new URL("./", self.registration.scope);
const indexUrl = new URL("./index.html", BASE).href;
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const response = await fetch(indexUrl, {cache: "reload"});
    if (!response.ok) throw new Error("Shell unavailable");
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^\"]+\.(?:js|css))"/g)].map(match => new URL(match[1], BASE).href);
    const cache = await caches.open(CACHE);
    await cache.addAll([BASE.href, indexUrl, new URL("manifest.webmanifest", BASE).href, new URL("icon.svg", BASE).href, ...assets]);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("workout-runner-shell-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Keep documents fresh so a new deployment never points at removed assets.
    if (event.request.mode === "navigate") {
      try { const response = await fetch(event.request); if (response.ok) { await cache.put(event.request, response.clone()); return response; } } catch { /* use the installed offline shell */ }
      return await cache.match(indexUrl, {ignoreVary: true});
    }
    // Static same-origin shell responses can vary by Origin in Vite previews.
    // Module requests carry different Origin headers than precache requests.
    const cached = await cache.match(event.request, {ignoreVary: true});
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok) await cache.put(event.request, response.clone());
    return response;
  })());
});
