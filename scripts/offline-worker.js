// Vite injects the version and file list from the production build.
const scope = self.registration.scope;
const prefix = "word-atlas:" + new URL(scope).pathname + ":";
const shell = prefix + "shell:" + BUILD_VERSION;
const media = prefix + "media";
const absolute = (file) => new URL(file, scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(shell)
      .then((cache) => cache.addAll(SHELL_FILES.map((file) => new Request(absolute(file), { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(prefix + "shell:") && key !== shell).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function cachedFetch(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    await cache.put(request, response.clone()).catch(() => null);
    if (name === media) {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 1500)).map((key) => cache.delete(key)));
    }
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range") || !request.url.startsWith(scope)) return;
  const relative = new URL(request.url).pathname.slice(new URL(scope).pathname.length);
  if (request.mode === "navigate" && (relative === "" || relative === "index.html")) {
    // Match the document and its hashed assets to the same installed build.
    event.respondWith(caches.open(shell).then(async (cache) => (await cache.match(scope)) || fetch(request)));
    return;
  }
  if (!/^(assets\/|atlas\/|brand\/|sfx\/)/.test(relative)) return;
  const name = /^atlas\/(img|thumb|audio)\//.test(relative) ? media : shell;
  event.respondWith(cachedFetch(request, name));
});
