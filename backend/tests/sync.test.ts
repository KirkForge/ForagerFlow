import { describe, it, expect, vi, beforeEach } from "vitest";

function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    put: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: vi.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    list: vi.fn(() => Promise.resolve({ keys: [], list_complete: true })),
  } as unknown as KVNamespace;
}

function createEnv(kv: KVNamespace): Env {
  return { FORAGERFLOW_KV: kv, SYNC_TOKEN: "test-token" };
}

function createRequest(
  path: string,
  method: string,
  body?: unknown,
  token?: string,
): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
}

interface Env {
  FORAGERFLOW_KV: KVNamespace;
  SYNC_TOKEN: string;
}

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
}

const handler = await import("../src/index");

describe("Sync Worker", () => {
  let kv: KVNamespace;
  let env: Env;

  beforeEach(() => {
    kv = createMockKV();
    env = createEnv(kv);
  });

  it("returns 401 when no Bearer token is provided on POST /sync", async () => {
    const req = createRequest("/sync", "POST", { entries: [] });
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("returns 401 when wrong token is provided on POST /sync", async () => {
    const req = createRequest("/sync", "POST", { entries: [] }, "wrong-token");
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("returns 200 with merged count on POST /sync with entries", async () => {
    const entries: HistoryEntry[] = [
      {
        id: "entry-1",
        timestamp: "2026-07-22T10:00:00Z",
        modelKey: "bvra",
        top1Species: "Agaricus bisporus",
        top1Probability: 0.95,
        top1Edibility: "Edible",
        predictions: [
          { label: "Agaricus bisporus", probability: 0.95 },
        ],
        thumbnail: "",
        notes: "",
      },
    ];
    const req = createRequest("/sync", "POST", { entries }, "test-token");
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; count: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(1);
  });

  it("returns 400 for malformed payload (non-array entries)", async () => {
    const req = createRequest(
      "/sync",
      "POST",
      { entries: "not-an-array" },
      "test-token",
    );
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("returns merged entries on GET /sync", async () => {
    const entries: HistoryEntry[] = [
      {
        id: "entry-1",
        timestamp: "2026-07-22T10:00:00Z",
        modelKey: "bvra",
        top1Species: "Agaricus bisporus",
        top1Probability: 0.95,
        top1Edibility: "Edible",
        predictions: [],
        thumbnail: "",
        notes: "",
      },
    ];
    const postReq = createRequest("/sync", "POST", { entries }, "test-token");
    await handler.default.fetch(postReq, env);

    const getReq = createRequest("/sync", "GET", undefined, "test-token");
    const res = await handler.default.fetch(getReq, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { entries: HistoryEntry[] };
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0]!.id).toBe("entry-1");
  });

  it("merges entries by id, sorting by timestamp desc", async () => {
    const entries1: HistoryEntry[] = [
      {
        id: "entry-1",
        timestamp: "2026-07-22T10:00:00Z",
        modelKey: "bvra",
        top1Species: "A",
        top1Probability: 0.9,
        top1Edibility: "Edible",
        predictions: [],
        thumbnail: "",
        notes: "",
      },
    ];
    const entries2: HistoryEntry[] = [
      {
        id: "entry-1",
        timestamp: "2026-07-22T11:00:00Z",
        modelKey: "bvra",
        top1Species: "A-updated",
        top1Probability: 0.95,
        top1Edibility: "Edible",
        predictions: [],
        thumbnail: "",
        notes: "",
      },
      {
        id: "entry-2",
        timestamp: "2026-07-22T09:00:00Z",
        modelKey: "bvra",
        top1Species: "B",
        top1Probability: 0.8,
        top1Edibility: "Unknown",
        predictions: [],
        thumbnail: "",
        notes: "",
      },
    ];
    const postReq1 = createRequest(
      "/sync",
      "POST",
      { entries: entries1 },
      "test-token",
    );
    await handler.default.fetch(postReq1, env);

    const postReq2 = createRequest(
      "/sync",
      "POST",
      { entries: entries2 },
      "test-token",
    );
    await handler.default.fetch(postReq2, env);

    const getReq = createRequest("/sync", "GET", undefined, "test-token");
    const res = await handler.default.fetch(getReq, env);
    const body = (await res.json()) as { entries: HistoryEntry[] };
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0]!.id).toBe("entry-1");
    expect(body.entries[0]!.top1Species).toBe("A-updated");
    expect(body.entries[1]!.id).toBe("entry-2");
  });

  it("returns {status: ok} on GET /health", async () => {
    const req = createRequest("/health", "GET");
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("ok");
  });

  it("returns 404 for unknown paths", async () => {
    const req = createRequest("/unknown", "GET");
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(404);
  });

  it("returns 401 when no Bearer token is provided on POST /feedback", async () => {
    const req = createRequest("/feedback", "POST", {
      feedback: [],
    });
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(401);
  });

  it("returns 400 for malformed feedback payload (non-array)", async () => {
    const req = createRequest(
      "/feedback",
      "POST",
      { feedback: "not-an-array" },
      "test-token",
    );
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(400);
  });

  it("stores and retrieves feedback entries on POST/GET /feedback", async () => {
    const feedback = [
      {
        id: "entry-1",
        feedback: {
          correctSpecies: "Agaricus bisporus",
          notes: "Looked similar",
          timestamp: "2026-07-22T12:00:00Z",
        },
      },
    ];
    const postReq = createRequest(
      "/feedback",
      "POST",
      { feedback },
      "test-token",
    );
    const postRes = await handler.default.fetch(postReq, env);
    expect(postRes.status).toBe(200);
    const postBody = (await postRes.json()) as { ok: boolean; count: number };
    expect(postBody.ok).toBe(true);
    expect(postBody.count).toBe(1);

    const getReq = createRequest("/feedback", "GET", undefined, "test-token");
    const getRes = await handler.default.fetch(getReq, env);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      feedback: Array<{ id: string; feedback: { correctSpecies: string } }>;
    };
    expect(getBody.feedback).toHaveLength(1);
    expect(getBody.feedback[0]!.id).toBe("entry-1");
    expect(getBody.feedback[0]!.feedback.correctSpecies).toBe(
      "Agaricus bisporus",
    );
  });

  it("merges feedback by id on POST /feedback", async () => {
    const feedback1 = [
      {
        id: "entry-1",
        feedback: {
          correctSpecies: "A",
          notes: "",
          timestamp: "2026-07-22T10:00:00Z",
        },
      },
    ];
    const feedback2 = [
      {
        id: "entry-1",
        feedback: {
          correctSpecies: "A-updated",
          notes: "updated",
          timestamp: "2026-07-22T11:00:00Z",
        },
      },
      {
        id: "entry-2",
        feedback: {
          correctSpecies: "B",
          notes: "",
          timestamp: "2026-07-22T09:00:00Z",
        },
      },
    ];

    const postReq1 = createRequest(
      "/feedback",
      "POST",
      { feedback: feedback1 },
      "test-token",
    );
    await handler.default.fetch(postReq1, env);

    const postReq2 = createRequest(
      "/feedback",
      "POST",
      { feedback: feedback2 },
      "test-token",
    );
    await handler.default.fetch(postReq2, env);

    const getReq = createRequest("/feedback", "GET", undefined, "test-token");
    const res = await handler.default.fetch(getReq, env);
    const body = (await res.json()) as {
      feedback: Array<{ id: string; feedback: { correctSpecies: string } }>;
    };
    expect(body.feedback).toHaveLength(2);
    expect(body.feedback[0]!.feedback.correctSpecies).toBe("A-updated");
  });

  it("returns 401 when no Bearer token on GET /feedback", async () => {
    const req = createRequest("/feedback", "GET");
    const res = await handler.default.fetch(req, env);
    expect(res.status).toBe(401);
  });
});