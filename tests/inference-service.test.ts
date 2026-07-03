import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InferenceService } from "@/inference/service";
import {
  ModelKey,
  InferenceWorkerMessageType,
  WorkerCommandType,
} from "@/core/types";
import { modelRegistry } from "@/data/model-registry";
import { config } from "@/core/config";
import { logger } from "@/core/logger";
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
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
    Object.defineProperty(globalThis.navigator, "connection", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
    vi.useRealTimers();
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

  function installConnection(type: string | undefined): void {
    Object.defineProperty(globalThis.navigator, "connection", {
      value: type === undefined ? undefined : { type },
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

  it("emits progress messages while loading", () => {
    const progressEvents: unknown[] = [];
    service.onProgress((p) => progressEvents.push(p));

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });

    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Progress,
      phase: "download",
      percent: 50,
    });

    expect(progressEvents).toHaveLength(1);
    expect(progressEvents[0]).toMatchObject({
      modelKey: ModelKey.BVRA,
      phase: "download",
      percent: 50,
    });
    expect(service.getActiveProgress()).toMatchObject({
      modelKey: ModelKey.BVRA,
      percent: 50,
    });
  });

  it("clears active progress when model is ready", () => {
    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });

    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Progress,
      phase: "compile",
      percent: 90,
    });
    expect(service.getActiveProgress()).not.toBeNull();

    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    expect(service.getActiveProgress()).toBeNull();
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

  it("unloads the worker after idle timeout", () => {
    const originalIdleMs = config.modelIdleUnloadMs;
    (config as { modelIdleUnloadMs: number }).modelIdleUnloadMs = 100;

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });
    expect(service.isReady()).toBe(true);

    vi.advanceTimersByTime(100);
    expect(worker.terminate).toHaveBeenCalled();
    expect(service.isReady()).toBe(false);

    (config as { modelIdleUnloadMs: number }).modelIdleUnloadMs =
      originalIdleMs;
  });

  it("resets the idle timer on inference", () => {
    const originalIdleMs = config.modelIdleUnloadMs;
    (config as { modelIdleUnloadMs: number }).modelIdleUnloadMs = 100;

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    vi.advanceTimersByTime(80);
    service.infer(new ArrayBuffer(224 * 224 * 4), 224, 224);
    vi.advanceTimersByTime(80);

    expect(worker.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(worker.terminate).toHaveBeenCalled();

    (config as { modelIdleUnloadMs: number }).modelIdleUnloadMs =
      originalIdleMs;
  });

  it("does not unload the worker when idle timeout is disabled", () => {
    const originalIdleMs = config.modelIdleUnloadMs;
    (config as { modelIdleUnloadMs: number }).modelIdleUnloadMs = 0;

    service.initialize();
    service.switchModel(ModelKey.BVRA, { skipStorageCheck: true });
    sendWorkerMessage(worker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    vi.advanceTimersByTime(1000);
    expect(worker.terminate).not.toHaveBeenCalled();

    (config as { modelIdleUnloadMs: number }).modelIdleUnloadMs =
      originalIdleMs;
  });

  it("preloads a model by spawning the worker and switching", () => {
    const secondService = new InferenceService();
    const preloadedStatuses: string[] = [];
    secondService.onStatus((s) => preloadedStatuses.push(s));

    secondService.preloadModel(ModelKey.BVRA);
    const newWorker = workerEnv.instances[workerEnv.instances.length - 1];

    expect(newWorker).toBeDefined();
    if (!newWorker) {
      throw new Error("Expected a worker instance to be created");
    }
    expect(newWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.BVRA,
      }),
    );

    sendWorkerMessage(newWorker, {
      type: InferenceWorkerMessageType.Status,
      text: "Ready",
      modelKey: ModelKey.BVRA,
    });

    expect(secondService.isReady()).toBe(true);
    expect(preloadedStatuses).toContain("Ready");
    secondService.terminate();
  });

  it("throws ModelLoadError when the worker cannot be created", () => {
    const originalWorker = globalThis.Worker;
    globalThis.Worker = vi.fn(() => {
      throw new Error("worker blocked");
    }) as unknown as typeof Worker;

    const service = new InferenceService();
    expect(() => {
      service.initialize();
    }).toThrow("worker blocked");

    globalThis.Worker = originalWorker;
  });

  it("continues model switch when storage estimate throws", async () => {
    const estimate = vi.fn().mockRejectedValue(new Error("storage broken"));
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

  it("warns when resuming storage confirmation with none pending", () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);
    service.initialize();
    service.resumeStorageConfirm();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no pending storage confirmation"),
    );
    warnSpy.mockRestore();
  });

  it("emits networkConfirm and blocks the download on a cellular connection", () => {
    installConnection("cellular");
    const confirmations: { modelKey: ModelKey }[] = [];
    service.onNetworkConfirm((c) => confirmations.push(c));

    service.initialize();
    service.switchModel(ModelKey.Dima806);

    expect(confirmations).toEqual([{ modelKey: ModelKey.Dima806 }]);
    // The worker must not have been told to switch while awaiting confirmation.
    expect(worker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("resumes the model download after network confirmation", () => {
    installConnection("cellular");
    service.initialize();
    service.switchModel(ModelKey.Dima806);

    service.resumeNetworkConfirm();
    expect(worker.postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("reverts to the previously active model when the network confirm is cancelled", () => {
    installConnection("cellular");
    service.initialize();
    service.switchModel(ModelKey.BVRA, {
      skipStorageCheck: true,
      skipNetworkCheck: true,
    });
    // Sanity: BVRA is the active model before the cellular switch attempt.
    expect(service.getActiveModelKey()).toBe(ModelKey.BVRA);

    service.switchModel(ModelKey.Dima806);
    const revertTo = service.cancelNetworkConfirm();
    expect(revertTo).toBe(ModelKey.BVRA);
    expect(service.getActiveModelKey()).toBe(ModelKey.BVRA);
  });

  it("does not re-prompt for a model once it has been confirmed this session", () => {
    installConnection("cellular");
    const confirmations: { modelKey: ModelKey }[] = [];
    service.onNetworkConfirm((c) => confirmations.push(c));
    service.initialize();

    service.switchModel(ModelKey.Dima806);
    service.resumeNetworkConfirm();
    confirmations.length = 0;

    // Second switch to the same model: already confirmed, no new prompt.
    service.switchModel(ModelKey.Dima806);
    expect(confirmations).toHaveLength(0);
    expect(worker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WorkerCommandType.Switch,
        modelKey: ModelKey.Dima806,
      }),
    );
  });

  it("does not prompt when the connection is not cellular", () => {
    installConnection("wifi");
    const confirmations: { modelKey: ModelKey }[] = [];
    service.onNetworkConfirm((c) => confirmations.push(c));
    service.initialize();

    service.switchModel(ModelKey.Dima806, { skipStorageCheck: true });
    expect(confirmations).toHaveLength(0);
  });

  it("warns when resuming network confirmation with none pending", () => {
    const warnSpy = vi
      .spyOn(logger, "warn")
      .mockImplementation(() => undefined);
    service.initialize();
    service.resumeNetworkConfirm();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("no pending network confirmation"),
    );
    warnSpy.mockRestore();
  });
});
