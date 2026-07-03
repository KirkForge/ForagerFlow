// @vitest-environment node
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import pkg from "../package.json";

const APP_VERSION: string = pkg.version;
const SHELL_CACHE = `foragerflow-shell-${APP_VERSION}`;
const MODELS_CACHE = `foragerflow-models-${APP_VERSION}`;

interface StoredListener {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listener: any;
}

const storedListeners: StoredListener[] = [];

const cacheStore = new Map<string, MockCache>();

interface MockCache {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function makeCache(): MockCache {
  return {
    match: vi.fn(),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

const mockCaches = {
  open: vi.fn((name: string) => {
    if (!cacheStore.has(name)) {
      cacheStore.set(name, makeCache());
    }
    return Promise.resolve(cacheStore.get(name)!);
  }),
  keys: vi.fn(() => Promise.resolve(Array.from(cacheStore.keys()))),
  delete: vi.fn((name: string) => Promise.resolve(cacheStore.delete(name))),
};

const mockClients = {
  claim: vi.fn(() => Promise.resolve(undefined)),
};

const mockSkipWaiting = vi.fn(() => Promise.resolve(undefined));

const mockFetch = vi.fn();

globalThis.self = {
  addEventListener: (type: string, listener: unknown) => {
    storedListeners.push({ type, listener });
  },
  skipWaiting: mockSkipWaiting,
  clients: mockClients,
  location: { origin: "https://example.com" },
} as unknown as typeof globalThis.self;

globalThis.caches = mockCaches as unknown as CacheStorage;
globalThis.fetch = mockFetch as unknown as typeof fetch;

await import("@/sw");

function getListener(type: string) {
  const entry = storedListeners.find((l) => l.type === type);
  if (!entry) throw new Error(`No ${type} listener registered`);
  return entry.listener as (e: Event) => void;
}

function findCache(prefix: string): MockCache {
  const name = Array.from(cacheStore.keys()).find((k) => k.startsWith(prefix));
  if (!name) throw new Error(`No cache found with prefix ${prefix}`);
  return cacheStore.get(name)!;
}

interface FakeExtendableEvent {
  type: string;
  waitUntil: Mock<(p: Promise<unknown>) => Promise<unknown>>;
}

function makeExtendableEvent(type: string): FakeExtendableEvent {
  return {
    type,
    waitUntil: vi.fn((p: Promise<unknown>) => p),
  };
}

interface FakeFetchEvent {
  type: "fetch";
  request: Request;
  mode: string;
  respondWith: Mock<(p: Promise<Response>) => Promise<Response>>;
  waitUntil: Mock;
}

function makeFetchEvent(request: Request, mode?: string): FakeFetchEvent {
  if (mode) {
    Object.defineProperty(request, "mode", {
      value: mode,
      configurable: true,
    });
  }
  return {
    type: "fetch",
    request,
    mode: mode ?? request.mode,
    respondWith: vi.fn((p: Promise<Response>) => p),
    waitUntil: vi.fn(),
  };
}

beforeEach(() => {
  cacheStore.clear();
  vi.clearAllMocks();
});

describe("Service Worker", () => {
  it("registers install, activate and fetch listeners", () => {
    expect(storedListeners.map((l) => l.type)).toEqual([
      "install",
      "activate",
      "fetch",
    ]);
  });

  it("install caches shell assets individually and tolerates failures", async () => {
    mockFetch.mockImplementation((url: string | Request) => {
      const u = typeof url === "string" ? url : url.url;
      if (u.includes("offline.html")) {
        return Promise.reject(new Error("network down"));
      }
      if (u.includes("index.html")) {
        return new Response("missing", { status: 404 });
      }
      return new Response("ok", { status: 200 });
    });

    const listener = getListener("install");
    const event = makeExtendableEvent("install");
    listener(event as unknown as Event);
    await event.waitUntil.mock.calls[0]![0];

    const shellCache = findCache("foragerflow-shell-");
    // / is cached; /index.html returns 404; /offline.html throws; remaining 5 succeed.
    expect(shellCache.put).toHaveBeenCalledTimes(6);
    expect(shellCache.put).toHaveBeenCalledWith("/", expect.any(Response));
  });

  it("activate purges unknown caches", async () => {
    cacheStore.set(SHELL_CACHE, makeCache());
    cacheStore.set(MODELS_CACHE, makeCache());
    cacheStore.set("foragerflow-shell-old", makeCache());

    const listener = getListener("activate");
    const event = makeExtendableEvent("activate");
    listener(event as unknown as Event);
    await event.waitUntil.mock.calls[0]![0];

    expect(mockClients.claim).toHaveBeenCalled();
    expect(mockCaches.delete).toHaveBeenCalledWith("foragerflow-shell-old");
    expect(mockCaches.delete).not.toHaveBeenCalledWith(SHELL_CACHE);
    expect(mockCaches.delete).not.toHaveBeenCalledWith(MODELS_CACHE);
  });

  it("navigation uses network-first and caches the response", async () => {
    const networkHtml = new Response("<html></html>", { status: 200 });
    mockFetch.mockResolvedValueOnce(networkHtml);

    const listener = getListener("fetch");
    const request = new Request("https://example.com/");
    const event = makeFetchEvent(request, "navigate");
    listener(event as unknown as Event);
    const response = await event.respondWith.mock.calls[0]![0];

    expect(mockFetch).toHaveBeenCalledWith(request);
    const shellCache = findCache("foragerflow-shell-");
    expect(shellCache.put).toHaveBeenCalledTimes(2);
    expect(await response.text()).toBe("<html></html>");
  });

  it("navigation falls back to cached index when offline", async () => {
    const cachedHtml = new Response("<html>cached</html>", { status: 200 });
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    const shellCache = makeCache();
    cacheStore.set(SHELL_CACHE, shellCache);
    shellCache.match
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(cachedHtml);

    const listener = getListener("fetch");
    const request = new Request("https://example.com/");
    const event = makeFetchEvent(request, "navigate");
    listener(event as unknown as Event);
    const response = await event.respondWith.mock.calls[0]![0];

    expect(mockFetch).toHaveBeenCalledWith(request);
    expect(await response.text()).toBe("<html>cached</html>");
  });

  it("navigation falls back to offline page when nothing is cached", async () => {
    mockFetch.mockRejectedValueOnce(new Error("offline"));

    cacheStore.set(SHELL_CACHE, makeCache());

    const listener = getListener("fetch");
    const request = new Request("https://example.com/");
    const event = makeFetchEvent(request, "navigate");
    listener(event as unknown as Event);
    const response = await event.respondWith.mock.calls[0]![0];

    expect(response.status).toBe(503);
    expect(await response.text()).toContain("Offline");
  });

  it("model request returns cached ranged response", async () => {
    const fullBuffer = new Uint8Array([0, 1, 2, 3, 4, 5]).buffer;
    const cached = new Response(fullBuffer, {
      status: 200,
      headers: { "content-length": "6" },
    });

    const modelsCache = makeCache();
    cacheStore.set(MODELS_CACHE, modelsCache);
    modelsCache.match.mockResolvedValueOnce(cached);

    const listener = getListener("fetch");
    const request = new Request("https://example.com/model/foo.onnx", {
      headers: { range: "bytes=1-3" },
    });

    const event = makeFetchEvent(request);
    listener(event as unknown as Event);
    const response = await event.respondWith.mock.calls[0]![0];

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-3/6");
    const body = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(body)).toEqual([1, 2, 3]);
  });

  it("static request serves cached asset and refreshes in background", async () => {
    const cached = new Response("cached-js", { status: 200 });
    const fresh = new Response("fresh-js", { status: 200 });
    mockFetch.mockResolvedValueOnce(fresh);

    const shellCache = makeCache();
    cacheStore.set(SHELL_CACHE, shellCache);
    shellCache.match.mockResolvedValueOnce(cached);

    const listener = getListener("fetch");
    const request = new Request("https://example.com/assets/main.js");

    const event = makeFetchEvent(request);
    listener(event as unknown as Event);
    const response = await event.respondWith.mock.calls[0]![0];

    expect(await response.text()).toBe("cached-js");
    await vi.waitFor(() => {
      expect(shellCache.put).toHaveBeenCalledWith(
        request,
        expect.any(Response),
      );
    });
  });

  it("static request falls back to network when cache misses", async () => {
    const fresh = new Response("fresh-js", { status: 200 });
    mockFetch.mockResolvedValueOnce(fresh);

    const shellCache = makeCache();
    cacheStore.set(SHELL_CACHE, shellCache);
    shellCache.match.mockResolvedValueOnce(undefined);

    const listener = getListener("fetch");
    const request = new Request("https://example.com/assets/main.js");

    const event = makeFetchEvent(request);
    listener(event as unknown as Event);
    const response = await event.respondWith.mock.calls[0]![0];

    expect(await response.text()).toBe("fresh-js");
  });
});
