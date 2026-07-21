/**
 * ForagerFlow Sync Worker — Cloudflare Worker
 *
 * Provides optional account sync for identification history.
 * Deploy with `wrangler deploy`.
 *
 * Endpoints:
 *   POST /sync   — upsert history entries (authenticated)
 *   GET  /sync   — fetch all history entries for the user
 *   GET  /health — health check
 */

interface HistoryEntry {
  id: string;
  timestamp: string;
  modelKey: string;
  top1Species: string;
  top1Probability: number;
  top1Edibility: string;
  predictions: { label: string; probability: number }[];
  thumbnail: string;
  notes: string;
  location?: { lat: number; lng: number; accuracy?: number };
  feedback?: { correctSpecies: string; notes: string; timestamp: string };
  provenance?: {
    modelSourceHash: string;
    onnxChecksum: string;
    labelMapVersion: string;
  };
}

interface SyncRequest {
  entries: HistoryEntry[];
}

interface SyncResponse {
  ok: boolean;
  count: number;
}

interface ErrorResponse {
  error: string;
}

async function verifyAuth(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  if (token !== env.SYNC_TOKEN) return null;
  const userId = "default";
  return userId;
}

async function handleSyncPost(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await verifyAuth(request, env);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json()) as SyncRequest;
  if (!body.entries || !Array.isArray(body.entries)) {
    return new Response(JSON.stringify({ error: "Invalid payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = `sync:${userId}:entries`;
  const existing: HistoryEntry[] = JSON.parse(
    (await env.FORAGERFLOW_KV.get(key)) ?? "[]",
  );

  const incoming = new Map<string, HistoryEntry>();
  for (const entry of body.entries) {
    incoming.set(entry.id, entry);
  }

  for (const entry of existing) {
    if (!incoming.has(entry.id)) {
      incoming.set(entry.id, entry);
    }
  }

  const merged = [...incoming.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  await env.FORAGERFLOW_KV.put(key, JSON.stringify(merged));

  return new Response(
    JSON.stringify({ ok: true, count: merged.length } satisfies SyncResponse),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function handleSyncGet(
  request: Request,
  env: Env,
): Promise<Response> {
  const userId = await verifyAuth(request, env);
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const key = `sync:${userId}:entries`;
  const data = await env.FORAGERFLOW_KV.get(key);
  const entries: HistoryEntry[] = data ? JSON.parse(data) : [];

  return new Response(JSON.stringify({ entries }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleHealth(): Promise<Response> {
  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "POST" && path === "/sync") {
      return handleSyncPost(request, env);
    }
    if (request.method === "GET" && path === "/sync") {
      return handleSyncGet(request, env);
    }
    if (request.method === "GET" && path === "/health") {
      return handleHealth();
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },
};

interface Env {
  FORAGERFLOW_KV: KVNamespace;
  SYNC_TOKEN: string;
}
