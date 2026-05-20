/// <reference lib="webworker" />

const CACHE_SHELL = "foragerflow-shell-v5";
const CACHE_MODELS = "foragerflow-models-v5";
const SHELL_ASSETS: string[] = [
  "/",
  "/index.html",
  "/main.ts",
  "/css/style.css",
  "/manifest.webmanifest",
];

const MODEL_PATH_PREFIX = "/model/";

declare const self: ServiceWorkerGlobalScope;

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
  const url = new URL(req.url);

  if (url.pathname.startsWith(MODEL_PATH_PREFIX)) {
    e.respondWith(handleModelRequest(req));
    return;
  }

  if (url.pathname.includes("onnx") || url.pathname.includes(".wasm")) {
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
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    return await fetch(req);
  } catch {
    if (req.mode === "navigate") {
      return caches.match("/index.html") as Promise<Response>;
    }
    return new Response("Offline", { status: 503 });
  }
}

export {};
