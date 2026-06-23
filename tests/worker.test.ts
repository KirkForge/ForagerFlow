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
      expect(progressMessages.some((m) => m["phase"] === "download")).toBe(true);
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
});
