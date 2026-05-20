const CACHE_SHELL = "foragerflow-shell-v4";
const CACHE_MODELS = "foragerflow-models-v4";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/knowledge.js",
  "/js/ort.min.js",
  "/js/ort-wasm-simd-threaded.wasm",
  "/js/worker.js",
  "/manifest.json"
];
const MODEL_ASSETS = [
  "/model/fungitastic.onnx",
  "/model/fungitastic.onnx.data",
  "/model/dima806.onnx",
  "/model/dima806.onnx.data"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_SHELL).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_SHELL && k !== CACHE_MODELS)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Lazy-cache model files; skip range requests for cache
  if (MODEL_ASSETS.some((p) => url.pathname === p)) {
    e.respondWith(
      caches.open(CACHE_MODELS).then((cache) =>
        cache.match(req).then((res) => {
          if (res) return res;
          return fetch(req).then((networkRes) => {
            if (networkRes.ok) cache.put(req, networkRes.clone());
            return networkRes;
          }).catch(() => {
            return new Response("Model unavailable offline. Connect to download.", {
              status: 503,
              statusText: "Service Unavailable",
              headers: { "Content-Type": "text/plain" }
            });
          });
        })
      )
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((res) => {
      if (res) return res;
      return fetch(req).catch(() => {
        if (req.mode === "navigate") {
          return caches.match("/index.html");
        }
        return new Response("Offline", { status: 503 });
      });
    })
  );
});
