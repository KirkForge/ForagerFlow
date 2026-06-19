import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InferenceService } from "@/inference/service";
import {
  ModelKey,
  InferenceWorkerMessageType,
  WorkerCommandType,
} from "@/core/types";
import { modelRegistry } from "@/data/model-registry";
import { config } from "@/core/config";
import {
  installMockWorker,
  sendWorkerMessage,
  type MockWorker,
} from "./helpers/worker";
import { flushPromises, sleep } from "./helpers/promises";

describe("InferenceService", () => {
  let service: InferenceService;
  let worker: MockWorker;
  let workerEnv: ReturnType<typeof installMockWorker>;
  let originalNavigatorStorage: StorageManager | undefined;

  beforeEach(() => {
    originalNavigatorStorage = globalThis.navigator.storage;
    workerEnv = installMockWorker((instance) => {
      worker = instance;
    });
    service = new InferenceService();
  });

  afterEach(() => {
    service.terminate();
    workerEnv.restore();
    Object.defineProperty(globalThis.navigator, "storage", {
      value: originalNavigatorStorage,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  function installStorageEstimate(
    estimate: () => Promise<{ quota: number; usage: number }>,
  ): void {
    Object.defineProperty(globalThis.navigator, "storage", {
      value: { estimate },
      configurable: true,
      writable: true,
    });
  }

  it("initializes a worker and switches to the default model", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });

    expect(worker.postMessage).toHaveBeenCalledWith(
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

    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    expect(service.isReady()).toBe(true);
    expect(worker.postMessage).toHaveBeenLastCalledWith(
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
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    const logits = new Float32Array(modelRegistry[ModelKey.BVRA].labels.length);
    logits[0] = 1;
    sendWorkerMessage(worker, {
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
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    sendWorkerMessage(worker, {
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
    sendWorkerMessage(worker, {
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
    expect(worker.terminate).toHaveBeenCalled();
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
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("performs storage check before loading a model", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 2e9, usage: 1e9 });
    installStorageEstimate(estimate);

    service.initialize();
    service.switchModel(ModelKey.Dima806);

    await flushPromises();
    expect(estimate).toHaveBeenCalled();
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("emits storageConfirm when free space is below threshold", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 1e9, usage: 9e8 });
    installStorageEstimate(estimate);

    const confirmations: unknown[] = [];
    service.onStorageConfirm((c) => confirmations.push(c));

    service.initialize();
    service.switchModel(ModelKey.Dima806);

    await flushPromises();
    expect(confirmations).toHaveLength(1);
  });

  it("resumes model load after storage confirmation", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 1e9, usage: 9e8 });
    installStorageEstimate(estimate);

    let confirmed = false;
    service.onStorageConfirm(() => {
      confirmed = true;
    });

    service.initialize();
    service.switchModel(ModelKey.Dima806);
    await flushPromises();
    expect(confirmed).toBe(true);

    service.resumeStorageConfirm();
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("ignores resumeStorageConfirm when no confirmation is pending", () => {
    service.initialize();
    service.resumeStorageConfirm();
    expect(worker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: WorkerCommandType.Switch }),
    );
  });

  it("retries recoverable worker errors", async () => {
    const originalRetries = config.maxInferenceRetries;
    (config as { maxInferenceRetries: number }).maxInferenceRetries = 2;

    const statuses: string[] = [];
    service.onStatus((s) => statuses.push(s));

    service.initialize();
    sendWorkerMessage(worker, {
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
    worker.onerror?.(new ErrorEvent("error", { message: "runtime crash" }));

    (config as { maxInferenceRetries: number }).maxInferenceRetries =
      originalRetries;
    expect(errors).toHaveLength(1);
  });

  it("drops queued inferences for stale models", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    const pixels = new ArrayBuffer(224 * 224 * 4);
    service.infer(pixels, 224, 224);
    service.switchModel(ModelKey.Dima806, { skipStorageCheck: true });

    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.Dima806,
    });

    expect(worker.postMessage).not.toHaveBeenLastCalledWith(
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

    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("skips storage check after it has been checked once", async () => {
    const estimate = vi.fn().mockResolvedValue({ quota: 2e9, usage: 1e9 });
    installStorageEstimate(estimate);

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
    sendWorkerMessage(worker, {
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

    expect(worker.postMessage).not.toHaveBeenLastCalledWith(
      expect.objectContaining({ type: WorkerCommandType.Infer }),
    );
  });

  it("cancels pending retry on terminate", () => {
    const originalRetries = config.maxInferenceRetries;
    (config as { maxInferenceRetries: number }).maxInferenceRetries = 2;

    service.initialize();
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Error,
      message: "recoverable",
    });

    service.terminate();
    expect(service.isReady()).toBe(false);
    expect(worker.terminate).toHaveBeenCalled();

    (config as { maxInferenceRetries: number }).maxInferenceRetries =
      originalRetries;
  });
});
