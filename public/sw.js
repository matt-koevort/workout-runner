// Bump this whenever the shell/bootstrap behavior changes. Existing installed
// PWAs otherwise keep serving an old cached index and JS bundle indefinitely.
const CACHE = "workout-runner-shell-v3";
const BASE = new URL("./", self.registration.scope);
const shell = [new URL("./", BASE).href, new URL("./index.html", BASE).href, new URL("./manifest.webmanifest", BASE).href, new URL("./icon.svg", BASE).href];
self.addEventListener("install", (event) => { event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(shell))); self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (event) => { if (event.request.method !== "GET") return; event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(new URL("./index.html", BASE).href)))); });
