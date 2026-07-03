import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createWorker,
  type OrtSession,
  type OrtStatic,
  type OrtTensor,
} from "@/inference/worker-logic";
import { InferenceWorkerMessageType, ModelKey } from "@/core/types";

function createMockContext() {
  const target = new EventTarget();
  return {
    postMessage: vi.fn(),
    addEventListener: target.addEventListener.bind(target) as unknown as (
      type: "message",
      listener: (event: MessageEvent) => void,
    ) => void,
    removeEventListener: target.removeEventListener.bind(target) as unknown as (
      type: "message",
      listener: EventListener,
    ) => void,
    dispatch(data: unknown) {
      target.dispatchEvent(new MessageEvent("message", { data }));
    },
  };
}

class FakeTensor implements OrtTensor {
  data: Float32Array;
  dims: number[];
  buffer: ArrayBuffer;
  dispose: () => void;

  constructor(_type: string, data: Float32Array, dims: number[]) {
    this.data = data;
    this.dims = dims;
    this.buffer = data.buffer;
    this.dispose = vi.fn();
  }
}

describe("createWorker", () => {
  let ctx: ReturnType<typeof createMockContext>;
  let mockSession: OrtSession;
  let mockOrt: OrtStatic;
  let cleanup: () => void;
  const fetchMock = vi.fn();

  beforeEach(() => {
    ctx = createMockContext();
    mockSession = {
      run: vi.fn(),
      dispose: vi.fn().mockResolvedValue(undefined),
    };
    mockOrt = {
      InferenceSession: {
        create: vi.fn().mockResolvedValue(mockSession),
      },
      Tensor: FakeTensor as unknown as OrtStatic["Tensor"],
    };
    const createTensor = vi.fn(function Tensor(
      _type: string,
      data: Float32Array,
      dims: number[],
    ) {
      return {
        data,
        dims,
        buffer: data.buffer,
        dispose: vi.fn(),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    cleanup = createWorker(ctx, mockOrt, createTensor);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function lastMessage(): Record<string, unknown> | undefined {
    const calls = ctx.postMessage.mock.calls as [unknown][];
    return calls[calls.length - 1]?.[0] as Record<string, unknown> | undefined;
  }

  it("loads a model and reports Ready when switched", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/test.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Status);
      expect(msg?.["text"]).toBe("Ready");
      expect(msg?.["modelKey"]).toBe(ModelKey.BVRA);
    });
  });

  it("reports download progress when content-length and body are available", async () => {
    const total = 100;
    const chunk1 = new Uint8Array(25).fill(1);
    const chunk2 = new Uint8Array(25).fill(2);
    const chunk3 = new Uint8Array(50).fill(3);
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: chunk1 })
        .mockResolvedValueOnce({ done: false, value: chunk2 })
        .mockResolvedValueOnce({ done: false, value: chunk3 })
        .mockResolvedValueOnce({ done: true }),
      releaseLock: vi.fn(),
    };
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(String(total)) },
      body: { getReader: () => reader },
    } as unknown as Response);

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/streamed.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });

    await vi.waitFor(() => {
      const progressMessages = (ctx.postMessage.mock.calls as [unknown][])
        .map(([m]) => m as Record<string, unknown>)
        .filter((m) => m["type"] === InferenceWorkerMessageType.Progress);
      expect(progressMessages.length).toBeGreaterThanOrEqual(2);
      expect(progressMessages.some((m) => m["phase"] === "download")).toBe(
        true,
      );
      expect(progressMessages.some((m) => m["phase"] === "compile")).toBe(true);
    });

    const lastMsg = lastMessage();
    expect(lastMsg?.["type"]).toBe(InferenceWorkerMessageType.Status);
    expect(lastMsg?.["text"]).toBe("Ready");
  });

  it("reports an error when the model fetch fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/missing.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toContain("Failed to fetch model");
    });
  });

  it("resumes a dropped download with a Range request on retry", async () => {
    const total = 100;
    const firstChunk = new Uint8Array(40).fill(7);
    const restChunk = new Uint8Array(60).fill(9);

    const callsBefore = fetchMock.mock.calls.length;

    // Key the response on the Range header: first attempt is a plain GET and
    // streams 40 bytes before the connection drops; the retry (Range) gets a
    // 206 with the remaining 60 bytes. Using a single mockImplementation keeps
    // the mock queue clean across tests (no leftover mockResolvedValueOnce).
    fetchMock.mockImplementation((url: string, opts?: { headers?: Record<string, string> }) => {
      if (opts?.headers?.["Range"]) {
        return Promise.resolve({
          ok: true,
          status: 206,
          headers: { get: vi.fn().mockReturnValue(String(60)) },
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: false, value: restChunk })
                .mockResolvedValueOnce({ done: true }),
              releaseLock: vi.fn(),
            }),
          },
        } as unknown as Response);
      }
      void url;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(String(total)) },
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: firstChunk })
              .mockRejectedValueOnce(new Error("network dropped")),
            releaseLock: vi.fn(),
          }),
        },
      } as unknown as Response);
    });

    const cmd = {
      type: "switch" as const,
      modelPath: "/model/resume.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0] as [number, number, number],
      std: [1, 1, 1] as [number, number, number],
    };

    ctx.dispatch(cmd);

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(String(msg?.["message"])).toContain("network dropped");
    });

    // Retry — same model, same worker instance → resumes from byte 40.
    ctx.dispatch(cmd);

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Status);
      expect(msg?.["text"]).toBe("Ready");
      expect(msg?.["modelKey"]).toBe(ModelKey.BVRA);
    });

    const calls = fetchMock.mock.calls as unknown[][] as [string, { headers?: { Range?: string } }][];
    const firstCall = calls[callsBefore]!;
    const retryCall = calls[callsBefore + 1]!;
    // First attempt: plain GET, no Range header.
    expect(firstCall[0]).toBe("/model/resume.onnx");
    expect(firstCall[1]).toBeUndefined();
    // Retry: requested the remainder via Range, not the whole file.
    expect(retryCall[0]).toBe("/model/resume.onnx");
    expect(retryCall[1].headers?.Range).toBe("bytes=40-");

    // The assembled buffer is the full 100 bytes: 40 of 7 then 60 of 9.
    const createCalls = (
      mockOrt.InferenceSession.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const passed = createCalls[createCalls.length - 1]![0] as Uint8Array;
    expect(passed.length).toBe(100);
    expect(passed[0]).toBe(7);
    expect(passed[40]).toBe(9);
  });

  it("restarts from zero when the server ignores the range request", async () => {
    const total = 100;
    const firstChunk = new Uint8Array(40).fill(7);
    const fullBody = new Uint8Array(100);
    fullBody.set(firstChunk, 0);
    for (let i = 40; i < 100; i++) fullBody[i] = 9;

    fetchMock.mockImplementation((url: string, opts?: { headers?: Record<string, string> }) => {
      if (opts?.headers?.["Range"]) {
        // Server ignores the range and returns the full 200 body.
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: vi.fn().mockReturnValue(String(total)) },
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: false, value: fullBody })
                .mockResolvedValueOnce({ done: true }),
              releaseLock: vi.fn(),
            }),
          },
        } as unknown as Response);
      }
      void url;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(String(total)) },
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: firstChunk })
              .mockRejectedValueOnce(new Error("network dropped")),
            releaseLock: vi.fn(),
          }),
        },
      } as unknown as Response);
    });

    const cmd = {
      type: "switch" as const,
      modelPath: "/model/no-range.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0] as [number, number, number],
      std: [1, 1, 1] as [number, number, number],
    };

    ctx.dispatch(cmd);
    await vi.waitFor(() => {
      expect(lastMessage()?.["type"]).toBe(InferenceWorkerMessageType.Error);
    });

    ctx.dispatch(cmd);
    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Status);
      expect(msg?.["text"]).toBe("Ready");
    });

    // The assembled buffer is the fresh full body (100 bytes), not the stale
    // 40-byte partial prepended onto a duplicate (which would be 140).
    const createCalls = (
      mockOrt.InferenceSession.create as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const passed = createCalls[createCalls.length - 1]![0] as Uint8Array;
    expect(passed.length).toBe(100);
    expect(passed[0]).toBe(7);
    expect(passed[40]).toBe(9);
  });

  it("disposes the previous session when switching models", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/first.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });
    await vi.waitFor(() => {
      expect(lastMessage()?.["text"]).toBe("Ready");
    });

    const firstSession = mockSession;

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/second.onnx",
      modelKey: ModelKey.Dima806,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });
    await vi.waitFor(() => {
      expect(lastMessage()?.["modelKey"]).toBe(ModelKey.Dima806);
    });

    expect(firstSession.dispose).toHaveBeenCalled();
  });

  it("reports an error when inferring before a model is loaded", async () => {
    ctx.dispatch({
      type: "infer",
      pixels: new ArrayBuffer(4),
      width: 1,
      height: 1,
      modelKey: ModelKey.BVRA,
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toBe("No model loaded");
    });
  });

  it("runs inference and posts logits for the loaded model", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    const logits = new Float32Array([0.1, 0.9, 0.0]);
    const outputTensor = {
      data: logits,
      buffer: logits.buffer,
      dispose: vi.fn(),
    };
    vi.mocked(mockSession.run).mockResolvedValue({ logits: outputTensor });

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/test.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });
    await vi.waitFor(() => {
      expect(lastMessage()?.["text"]).toBe("Ready");
    });

    const pixels = new Uint8ClampedArray([255, 255, 255, 255]).buffer;
    ctx.dispatch({
      type: "infer",
      pixels,
      width: 1,
      height: 1,
      modelKey: ModelKey.BVRA,
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Result);
      expect(msg?.["modelKey"]).toBe(ModelKey.BVRA);
      expect(msg?.["logits"]).toEqual([
        expect.closeTo(0.1, 5),
        expect.closeTo(0.9, 5),
        0,
      ]);
    });

    expect(mockSession.run).toHaveBeenCalled();
    expect(outputTensor.dispose).toHaveBeenCalled();
  });

  it("posts an error when inference throws", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue(null) },
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as Response);

    vi.mocked(mockSession.run).mockRejectedValue(new Error("session exploded"));

    ctx.dispatch({
      type: "switch",
      modelPath: "/model/test.onnx",
      modelKey: ModelKey.BVRA,
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });
    await vi.waitFor(() => {
      expect(lastMessage()?.["text"]).toBe("Ready");
    });

    ctx.dispatch({
      type: "infer",
      pixels: new Uint8ClampedArray([255, 255, 255, 255]).buffer,
      width: 1,
      height: 1,
      modelKey: ModelKey.BVRA,
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toBe("session exploded");
    });
  });

  it("reports an error for unknown commands", async () => {
    ctx.dispatch({ type: "unknown-cmd" });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toContain("Unknown worker command");
    });
  });

  it("rejects a switch command with an invalid modelKey", async () => {
    ctx.dispatch({
      type: "switch",
      modelPath: "/model/test.onnx",
      modelKey: "invalid",
      mean: [0, 0, 0],
      std: [1, 1, 1],
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toContain("valid modelKey");
    });
  });

  it("rejects a switch command with a non-finite mean tuple", async () => {
    ctx.dispatch({
      type: "switch",
      modelPath: "/model/test.onnx",
      modelKey: ModelKey.BVRA,
      mean: ["not", "a", "number"],
      std: [1, 1, 1],
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toContain("mean must be a [R,G,B] tuple");
    });
  });

  it("rejects an infer command with missing pixels", async () => {
    ctx.dispatch({
      type: "infer",
      width: 1,
      height: 1,
      modelKey: ModelKey.BVRA,
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toContain("ArrayBuffer pixels");
    });
  });

  it("rejects an infer command with non-positive dimensions", async () => {
    ctx.dispatch({
      type: "infer",
      pixels: new ArrayBuffer(4),
      width: -1,
      height: 0,
      modelKey: ModelKey.BVRA,
    });

    await vi.waitFor(() => {
      const msg = lastMessage();
      expect(msg?.["type"]).toBe(InferenceWorkerMessageType.Error);
      expect(msg?.["message"]).toContain("positive width");
    });
  });
});
