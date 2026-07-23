/* eslint-disable @typescript-eslint/no-unsafe-return -- vi.fn() mocks need any-return allowances */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ModelKey, Edibility } from "@/core/types";
import type { HistoryEntry, FeedbackEntry } from "@/services/history";

const mockEntries: HistoryEntry[] = [
  {
    id: "entry-1",
    timestamp: "2026-07-22T10:00:00.000Z",
    modelKey: ModelKey.BVRA,
    top1Species: "Amanita muscaria",
    top1Probability: 0.95,
    top1Edibility: Edibility.Poisonous,
    predictions: [{ label: "Amanita muscaria", probability: 0.95 }],
    thumbnail: "",
    notes: "",
  },
];

const mockFeedbackEntry: HistoryEntry = {
  ...mockEntries[0]!,
  feedback: {
    correctSpecies: "Amanita gemmata",
    notes: "Likely a lookalike",
    timestamp: "2026-07-22T11:00:00.000Z",
  },
};

const mockGetHistory = vi.fn();
const mockGetMeta = vi.fn();
const mockSetMeta = vi.fn();
const mockOpenDB = vi.fn();
let mockSyncUrl = "";
let mockSyncToken = "";

vi.mock("@/core/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  },
}));

vi.mock("@/core/config", () => ({
  get config() {
    return {
      syncUrl: mockSyncUrl,
      syncToken: mockSyncToken,
    };
  },
}));

vi.mock("@/services/history", () => ({
  getHistory: (...args: unknown[]) => mockGetHistory(...args),
  saveFeedback: vi.fn(),
  isDataUrlThumbnail: (v: unknown) =>
    typeof v === "string" && (v === "" || v.startsWith("data:image/")),
  isValidLocation: () => false,
}));

vi.mock("@/services/history/db", () => ({
  getMeta: (...args: unknown[]) => mockGetMeta(...args),
  setMeta: (...args: unknown[]) => mockSetMeta(...args),
  openDB: (...args: unknown[]) => mockOpenDB(...args),
  STORE_NAME: "identifications",
}));

describe("SyncService", () => {
  beforeEach(() => {
    vi.resetModules();
    mockSyncUrl = "";
    mockSyncToken = "";
    mockGetHistory.mockResolvedValue([]);
    mockGetMeta.mockResolvedValue(undefined);
    mockSetMeta.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is a no-op when VITE_SYNC_URL is unset", async () => {
    mockSyncUrl = "";
    mockSyncToken = "";

    const { push, pull } = await import("@/services/sync");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await push();
    await pull();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs entries with Authorization Bearer token", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetHistory.mockResolvedValueOnce(mockEntries);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { push } = await import("@/services/sync");
    await push();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0]!;
    expect(call[1]!.headers).toHaveProperty(
      "Authorization",
      "Bearer test-token",
    );
  });

  it("updates lastSyncAt on successful push", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetHistory.mockResolvedValueOnce(mockEntries);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { push } = await import("@/services/sync");
    await push();

    expect(mockSetMeta).toHaveBeenCalledWith("lastSyncAt", expect.any(String));
  });

  it("retries on 5xx responses", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetHistory.mockResolvedValueOnce(mockEntries);

    let callCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: "internal" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, count: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);

    const { push } = await import("@/services/sync");
    await push();

    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it("pulls server entries and merges into IDB", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";

    const serverEntry = {
      id: "server-1",
      timestamp: "2026-07-22T12:00:00.000Z",
      modelKey: ModelKey.BVRA,
      top1Species: "Cantharellus cibarius",
      top1Probability: 0.88,
      top1Edibility: Edibility.Edible,
      predictions: [{ label: "Cantharellus cibarius", probability: 0.88 }],
      thumbnail: "",
      notes: "",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ entries: [serverEntry] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { pull } = await import("@/services/sync");
    await pull();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("does not throw on network error (logs and returns)", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetHistory.mockResolvedValueOnce(mockEntries);

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);

    const { push } = await import("@/services/sync");
    await expect(push()).resolves.toBeUndefined();
  });

  it("strips thumbnails from push payload", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";

    const entryWithThumb: HistoryEntry = {
      ...mockEntries[0]!,
      thumbnail: "data:image/png;base64,abc123",
    };
    mockGetHistory.mockResolvedValueOnce([entryWithThumb]);

    let capturedBody: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = init?.body;
      capturedBody = typeof body === "string" ? body : undefined;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, count: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const { push } = await import("@/services/sync");
    await push();

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!) as {
      entries: HistoryEntry[];
    };
    expect(parsed.entries[0]!.thumbnail).toBe("");
  });

  it("includes entries with feedback newer than lastSyncAt in push", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetMeta.mockImplementation((key: string) => {
      if (key === "lastSyncAt")
        return Promise.resolve("2026-07-22T09:00:00.000Z");
      if (key === "lastFeedbackSyncAt") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    mockGetHistory.mockResolvedValueOnce([mockFeedbackEntry]);

    let capturedBody: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      const body = init?.body;
      capturedBody = typeof body === "string" ? body : undefined;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, count: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const { push } = await import("@/services/sync");
    await push();

    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!) as {
      entries: HistoryEntry[];
    };
    expect(parsed.entries).toHaveLength(1);
  });

  it("pushFeedback POSTs feedback entries to /feedback endpoint", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetMeta.mockImplementation((key: string) => {
      if (key === "lastFeedbackSyncAt") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    mockGetHistory.mockResolvedValueOnce([mockFeedbackEntry]);

    let capturedUrl: string | undefined;
    let capturedBody: string | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      capturedUrl = typeof url === "string" ? url : "";
      const body = init?.body;
      capturedBody = typeof body === "string" ? body : undefined;
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, count: 1 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const { pushFeedback } = await import("@/services/sync");
    await pushFeedback();

    expect(capturedUrl).toBe("https://sync.example.com/feedback");
    expect(capturedBody).toBeDefined();
    const parsed = JSON.parse(capturedBody!) as {
      feedback: { id: string; feedback: FeedbackEntry }[];
    };
    expect(parsed.feedback).toHaveLength(1);
    expect(parsed.feedback[0]!.id).toBe("entry-1");
    expect(parsed.feedback[0]!.feedback.correctSpecies).toBe("Amanita gemmata");
  });

  it("pushFeedback is a no-op when no feedback entries are new", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetMeta.mockImplementation((key: string) => {
      if (key === "lastFeedbackSyncAt")
        return Promise.resolve("2026-07-22T12:00:00.000Z");
      return Promise.resolve(undefined);
    });
    mockGetHistory.mockResolvedValueOnce([mockFeedbackEntry]);

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const { pushFeedback } = await import("@/services/sync");
    await pushFeedback();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pushFeedback updates lastFeedbackSyncAt on success", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetMeta.mockImplementation((key: string) => {
      if (key === "lastFeedbackSyncAt") return Promise.resolve(undefined);
      return Promise.resolve(undefined);
    });
    mockGetHistory.mockResolvedValueOnce([mockFeedbackEntry]);

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, count: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { pushFeedback } = await import("@/services/sync");
    await pushFeedback();

    expect(mockSetMeta).toHaveBeenCalledWith(
      "lastFeedbackSyncAt",
      expect.any(String),
    );
  });

  it("sync calls push, pushFeedback, and pull in order", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";
    mockGetHistory.mockResolvedValue([mockFeedbackEntry]);
    mockGetMeta.mockResolvedValue(undefined);

    const callOrder: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const path = typeof url === "string" ? new URL(url).pathname : "/";
      callOrder.push(path);
      if (
        path === "/sync" &&
        callOrder.filter((p) => p === "/sync").length === 1
      ) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, count: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      if (path === "/feedback") {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, count: 1 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    const { sync } = await import("@/services/sync");
    await sync();

    expect(callOrder).toEqual(["/sync", "/feedback", "/sync"]);
  });

  it("pull fetches entries that may include feedback", async () => {
    mockSyncUrl = "https://sync.example.com";
    mockSyncToken = "test-token";

    const entryWithFeedback = {
      ...mockEntries[0]!,
      feedback: {
        correctSpecies: "Amanita gemmata",
        notes: "Lookalike",
        timestamp: "2026-07-22T11:00:00.000Z",
      },
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ entries: [entryWithFeedback] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { pull } = await import("@/services/sync");
    await pull();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callUrl = fetchSpy.mock.calls[0]![0] as string;
    expect(callUrl).toContain("/sync");
  });
});
