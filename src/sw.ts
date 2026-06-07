/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

const CACHE_SHELL = "foragerflow-shell-v6";
const CACHE_MODELS = "foragerflow-models-v6";

// The shell is small: index.html, manifest, and the wasm. The main JS/CSS
// are emitted with content hashes by Vite, so we don't enumerate them —
// we cache them on first fetch (cache-on-demand for the shell too).
const SHELL_ASSETS: string[] = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/js/ort.min.js",
  "/js/ort-wasm-simd-threaded.wasm",
];

const MODEL_PATH_PREFIX = "/model/";
const WASM_PATH_PATTERNS = [".wasm", "ort-wasm"];

self.addEventListener("install", (e: ExtendableEvent) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      await cache.addAll(SHELL_ASSETS);
    })(),
  );
  void self.skipWaiting();
});

self.addEventListener("activate", (e: ExtendableEvent) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_SHELL && k !== CACHE_MODELS)
          .map((k) => caches.delete(k)),
      );
    })(),
  );
  void self.clients.claim();
});

self.addEventListener("fetch", (e: FetchEvent) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Model files (large, .onnx + .onnx.data sidecars) — cache on first load.
  if (url.pathname.startsWith(MODEL_PATH_PREFIX)) {
    e.respondWith(handleModelRequest(req));
    return;
  }

  // WASM artifacts (ort-wasm-simd-threaded.wasm etc.) — cache on first load.
  if (WASM_PATH_PATTERNS.some((p) => url.pathname.includes(p))) {
    e.respondWith(handleModelRequest(req));
    return;
  }

  e.respondWith(handleShellRequest(req));
});

async function handleModelRequest(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE_MODELS);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const networkRes = await fetch(req);
    if (networkRes.ok) {
      await cache.put(req, networkRes.clone());
    }
    return networkRes;
  } catch {
    return new Response(
      "Model unavailable offline. Connect to download.",
      {
        status: 503,
        statusText: "Service Unavailable",
        headers: { "Content-Type": "text/plain" },
      },
    );
  }
}

async function handleShellRequest(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE_SHELL);
  const cached = await cache.match(req);
  if (cached) return cached;

  try {
    const networkRes = await fetch(req);
    // Cache successful same-origin responses on demand so hashed assets
    // (/assets/main-*.js etc.) become available offline after first load.
    if (networkRes.ok && new URL(req.url).origin === self.location.origin) {
      await cache.put(req, networkRes.clone());
    }
    return networkRes;
  } catch {
    if (req.mode === "navigate") {
      const index = await cache.match("/index.html");
      if (index) return index;
    }
    return new Response("Offline", { status: 503 });
  }
}

export {};
