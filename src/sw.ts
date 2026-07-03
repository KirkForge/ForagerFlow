/// <reference lib="webworker" />

import { config } from "@/core/config";
import { createRangedResponse, hasEnoughStorageToCache } from "@/sw-utils";

declare const self: ServiceWorkerGlobalScope;

// Injected by Vite at build time.
declare const __APP_VERSION__: string;

const CACHE_SHELL = `foragerflow-shell-${__APP_VERSION__}`;
const CACHE_MODELS = `foragerflow-models-${__APP_VERSION__}`;

const SHELL_ASSETS: string[] = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/js/ort.min.js",
  "/js/ort-wasm-simd-threaded.wasm",
  "/js/ort-wasm-simd-threaded.jsep.mjs",
  "/js/ort-wasm-simd-threaded.jsep.wasm",
];

const MODEL_PATH_PREFIX = "/model/";
const WASM_PATH_PATTERNS = [".wasm", "ort-wasm"];

self.addEventListener("install", (e: ExtendableEvent) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      // Cache shell assets individually so a single 404 does not abort the
      // whole install. Non-critical assets missing degrades offline experience
      // but keeps the service worker active.
      await Promise.all(
        SHELL_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              await cache.put(url, response);
            } else {
              console.warn(
                `[FORAGERFLOW SW] Shell asset ${url} returned ${String(response.status)}`,
              );
            }
          } catch (err) {
            console.warn(`[FORAGERFLOW SW] Failed to cache ${url}:`, err);
          }
        }),
      );
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

  // Navigation requests: network-first so a new deployment's index.html
  // is served immediately, with cached fallback for offline.
  if (req.mode === "navigate" || url.pathname === "/index.html") {
    e.respondWith(handleNavigation(req));
    return;
  }

  // Model files (large, .onnx + .onnx.data sidecars) — cache on first load.
  if (url.pathname.startsWith(MODEL_PATH_PREFIX)) {
    e.respondWith(handleModelRequest(req));
    return;
  }

  // WASM artifacts (ort-wasm-*.wasm etc.) — cache on first load.
  if (WASM_PATH_PATTERNS.some((p) => url.pathname.includes(p))) {
    e.respondWith(handleModelRequest(req));
    return;
  }

  // Hashed assets and other same-origin static files:
  // stale-while-revalidate so updates propagate without blocking first paint.
  e.respondWith(handleStaticRequest(req));
});

async function handleOfflineFallback(): Promise<Response> {
  const cache = await caches.open(CACHE_SHELL);
  const cached = await cache.match("/offline.html");
  if (cached) return cached;
  return new Response("Offline — no cached app shell", { status: 503 });
}

async function handleNavigation(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE_SHELL);
  try {
    const networkRes = await fetch(req);
    if (networkRes.ok) {
      // Store both keys so requests to / and /index.html both resolve offline.
      await cache.put("/index.html", networkRes.clone());
      await cache.put("/", networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached =
      (await cache.match(req.url)) ??
      (await cache.match("/index.html")) ??
      (await cache.match("/"));
    if (cached) return cached;
    return handleOfflineFallback();
  }
}

async function handleModelRequest(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE_MODELS);
  const cached = await cache.match(req);
  const rangeHeader = req.headers.get("range");
  if (cached) {
    if (rangeHeader) {
      return createRangedResponse(cached.clone(), rangeHeader);
    }
    return cached;
  }

  try {
    const networkRes = await fetch(req);
    // Only cache complete (200) responses — a 206 partial from a resumed
    // download must never be stored under the model URL or a later non-range
    // request would read back a truncated body.
    if (networkRes.ok && networkRes.status === 200) {
      const estimate = await navigator.storage.estimate();
      const canCache = hasEnoughStorageToCache(
        networkRes,
        estimate,
        config.swModelCacheQuotaFraction,
        config.swMinFreeBytes,
      );
      if (canCache) {
        // ponytail: cache in the background so the client streams the live body
        // and can resume a dropped download with a Range request. Awaiting the
        // full cache write before returning would block the client until the
        // model is fully buffered, defeating resume on a flaky connection.
        void cache.put(req, networkRes.clone()).catch(() => {
          // Best-effort: a quota or network failure here must not fail the
          // in-flight model load the client is already streaming.
        });
      }
    }
    return networkRes;
  } catch {
    return new Response("Model unavailable offline. Connect to download.", {
      status: 503,
      statusText: "Service Unavailable",
      headers: { "Content-Type": "text/plain" },
    });
  }
}

async function handleStaticRequest(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE_SHELL);
  const cached = await cache.match(req);

  const networkFetch = fetch(req).then(async (networkRes) => {
    if (networkRes.ok && new URL(req.url).origin === self.location.origin) {
      await cache.put(req, networkRes.clone());
    }
    return networkRes;
  });

  return cached ?? (await networkFetch);
}

export {};
