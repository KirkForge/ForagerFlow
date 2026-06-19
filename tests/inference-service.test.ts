import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InferenceService } from "@/inference/service";
import {
  ModelKey,
  InferenceWorkerMessageType,
  WorkerCommandType,
} from "@/core/types";
import { modelRegistry } from "@/data/model-registry";
import { config } from "@/core/config";

describe("InferenceService", () => {
  interface WorkerMock {
    postMessage: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    onmessage: ((e: MessageEvent) => void) | null;
    onerror: ((e: ErrorEvent) => void) | null;
  }

  let service: InferenceService;
  let workerMock: WorkerMock;
  let originalWorker: typeof globalThis.Worker;
  let originalNavigatorStorage: StorageManager | undefined;

  function sendWorkerMessage(message: unknown) {
    if (workerMock.onmessage) {
      workerMock.onmessage(new MessageEvent("message", { data: message }));
    }
  }

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    originalNavigatorStorage = globalThis.navigator.storage;

    class MockWorker {
      postMessage = vi.fn();
      terminate = vi.fn();
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: ErrorEvent) => void) | null = null;
      constructor() {
        workerMock = this as unknown as WorkerMock;
      }
    }

    globalThis.Worker = MockWorker as unknown as typeof globalThis.Worker;

    service = new InferenceService();
  });

  afterEach(() => {
    service.terminate();
    globalThis.Worker = originalWorker;
    Object.defineProperty(globalThis.navigator, "storage", {
      value: originalNavigatorStorage,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  it("initializes a worker and switches to the default model", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });

    expect(workerMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.BVRA,
        modelPath: modelRegistry[ModelKey.BVRA].path,
      }),
    );
  });

  it("emits ready status and processes queued inferences", () => {
    const statusEvents: string[] = [];
    const resultEvents: unknown[] = [];
    service.onStatus((s) => statusEvents.push(s));
    service.onResult((r) => resultEvents.push(r));

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });

    const pixels = new ArrayBuffer(224 * 224 * 4);
    service.infer(pixels, 224, 224);
    expect(statusEvents).toContain("Model still loading — request queued");

    sendWorkerMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    expect(service.isReady()).toBe(true);
    expect(workerMock.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Infer,
        modelKey: ModelKey.BVRA,
        width: 224,
        height: 224,
      }),
      [pixels],
    );
  });

  it("emits result with valid logits", () => {
    const results: unknown[] = [];
    service.onResult((r) => results.push(r));

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    const logits = new Float32Array(modelRegistry[ModelKey.BVRA].labels.length);
    logits[0] = 1;
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Result,
      logits: Array.from(logits),
      modelKey: ModelKey.BVRA,
    });

    expect(results).toHaveLength(1);
  });

  it("emits label mismatch error when logit count is wrong", () => {
    const errors: unknown[] = [];
    service.onError((e) => errors.push(e));

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    sendWorkerMessage({
      type: InferenceWorkerMessageType.Result,
      logits: [0.5, 0.5],
      modelKey: ModelKey.BVRA,
    });

    expect(errors).toHaveLength(1);
  });

  it("emits error on worker error message after retries exhaust", () => {
    const originalRetries = config.maxInferenceRetries;
    (config as { maxInferenceRetries: number }).maxInferenceRetries = 0;

    const errors: unknown[] = [];
    service.onError((e) => errors.push(e));

    service.initialize();
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Error,
      message: "model failed",
    });

    (config as { maxInferenceRetries: number }).maxInferenceRetries =
      originalRetries;
    expect(errors).toHaveLength(1);
  });

  it("terminates the worker and resets state", () => {
    service.initialize();
    service.terminate();
    expect(workerMock.terminate).toHaveBeenCalled();
    expect(service.isReady()).toBe(false);
  });

  it("getActiveModel returns the current model", () => {
    service.initialize();
    service.switchModel(ModelKey.Dima806, { skipStorageCheck: true });
    expect(service.getActiveModelKey()).toBe(ModelKey.Dima806);
    expect(service.getActiveModel().key).toBe(ModelKey.Dima806);
  });

  it("skips storage check when requested", () => {
    service.initialize();
    service.switchModel(ModelKey.Dima806, { skipStorageCheck: true });
    expect(workerMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("performs storage check before loading a model", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 2e9, usage: 1e9 });
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { estimate },
      configurable: true,
      writable: true,
    });

    service.initialize();
    service.switchModel(ModelKey.Dima806);

    await flushPromises();
    expect(estimate).toHaveBeenCalled();
    expect(workerMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("emits storageConfirm when free space is below threshold", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 1e9, usage: 9e8 });
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { estimate },
      configurable: true,
      writable: true,
    });

    const confirmations: unknown[] = [];
    service.onStorageConfirm((c) => confirmations.push(c));

    service.initialize();
    service.switchModel(ModelKey.Dima806);

    await flushPromises();
    expect(confirmations).toHaveLength(1);
  });

  it("resumes model load after storage confirmation", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 1e9, usage: 9e8 });
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { estimate },
      configurable: true,
      writable: true,
    });

    let confirmed = false;
    service.onStorageConfirm(() => {
      confirmed = true;
    });

    service.initialize();
    service.switchModel(ModelKey.Dima806);
    await flushPromises();
    expect(confirmed).toBe(true);

    service.resumeStorageConfirm();
    expect(workerMock.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("ignores resumeStorageConfirm when no confirmation is pending", () => {
    service.initialize();
    service.resumeStorageConfirm();
    expect(workerMock.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkerCommandType.Switch }),
    );
  });

  it("retries recoverable worker errors", async () => {
    const originalRetries = config.maxInferenceRetries;
    (config as { maxInferenceRetries: number }).maxInferenceRetries = 2;

    const statuses: string[] = [];
    service.onStatus((s) => statuses.push(s));

    service.initialize();
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Error,
      message: "recoverable",
    });

    await sleep(config.retryDelayMs * 3);
    (config as { maxInferenceRetries: number }).maxInferenceRetries =
      originalRetries;
    expect(statuses.some((s) => s.startsWith("Retrying"))).toBe(true);
  });

  it("emits error on worker runtime error", () => {
    const originalRetries = config.maxInferenceRetries;
    (config as { maxInferenceRetries: number }).maxInferenceRetries = 0;

    const errors: unknown[] = [];
    service.onError((e) => errors.push(e));

    service.initialize();
    workerMock.onerror?.(new ErrorEvent("error", { message: "runtime crash" }));

    (config as { maxInferenceRetries: number }).maxInferenceRetries =
      originalRetries;
    expect(errors).toHaveLength(1);
  });

  it("drops queued inferences for stale models", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    const pixels = new ArrayBuffer(224 * 224 * 4);
    service.infer(pixels, 224, 224);
    service.switchModel(ModelKey.Dima806, { skipStorageCheck: true });

    sendWorkerMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.Dima806,
    });

    expect(workerMock.postMessage).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ modelKey: ModelKey.BVRA }),
    );
  });

  it("skips storage check when navigator.storage is unavailable", () => {
    Object.defineProperty(globalThis.navigator, "storage", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    service.initialize();
    service.switchModel(ModelKey.Dima806);

    expect(workerMock.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("skips storage check after it has been checked once", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 2e9, usage: 1e9 });
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { estimate },
      configurable: true,
      writable: true,
    });

    service.initialize();
    service.switchModel(ModelKey.Dima806);
    await flushPromises();
    expect(estimate).toHaveBeenCalledTimes(1);

    service.switchModel(ModelKey.Dima806);
    expect(estimate).toHaveBeenCalledTimes(1);
  });

  it("does not mark ready when status Ready has wrong modelKey", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.Dima806,
    });

    expect(service.isReady()).toBe(false);
  });

  it("queues inference when not ready", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });

    const pixels = new ArrayBuffer(224 * 224 * 4);
    service.infer(pixels, 224, 224);

    expect(workerMock.postMessage).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ type: WorkerCommandType.Infer }),
    );
  });

  it("cancels pending retry on terminate", () => {
    const originalRetries = config.maxInferenceRetries;
    (config as { maxInferenceRetries: number }).maxInferenceRetries = 2;

    service.initialize();
    sendWorkerMessage({
      type: InferenceWorkerMessageType.Error,
      message: "recoverable",
    });

    service.terminate();
    expect(service.isReady()).toBe(false);
    expect(workerMock.terminate).toHaveBeenCalled();

    (config as { maxInferenceRetries: number }).maxInferenceRetries =
      originalRetries;
  });
});

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
