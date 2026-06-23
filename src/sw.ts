/// <reference lib="webworker" />

import { config } from "@/core/config";
import {
  createRangedResponse,
  hasEnoughStorageToCache,
} from "@/sw-utils";

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
      await cache.put("/index.html", networkRes.clone());
    }
    return networkRes;
  } catch {
    const cached = await cache.match("/index.html");
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
    if (networkRes.ok) {
      const estimate = await navigator.storage.estimate();
      const canCache = hasEnoughStorageToCache(
        networkRes,
        estimate,
        config.swModelCacheQuotaFraction,
        config.swMinFreeBytes,
      );
      if (canCache) {
        await cache.put(req, networkRes.clone());
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
