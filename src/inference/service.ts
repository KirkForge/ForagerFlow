import type {
  ModelConfig,
  WorkerMessage,
  WorkerCommand,
  ProvenanceInfo,
} from "@/core/types";
import {
  ModelKey,
  InferenceWorkerMessageType,
  WorkerCommandType,
} from "@/core/types";
import {
  InferenceError,
  LabelMismatchError,
  ModelLoadError,
} from "@/core/errors";
import { logger } from "@/core/logger";
import { modelRegistry } from "@/data/model-registry";
import { config } from "@/core/config";
import { isCellularConnection } from "@/services/connectivity";

interface InferenceWorker extends Worker {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type { WorkerMessage, WorkerCommand };

export interface LoadProgress {
  modelKey: ModelKey;
  phase: "download" | "compile";
  percent: number;
}

export type StatusHandler = (text: string) => void;
export type ResultHandler = (result: {
  logits: Float32Array;
  modelKey: ModelKey;
  provenance: ProvenanceInfo;
}) => void;
export type ErrorHandler = (error: InferenceError | LabelMismatchError) => void;
export type StorageConfirmHandler = (payload: {
  modelKey: ModelKey;
  freeBytes: number;
}) => void;
export type NetworkConfirmHandler = (payload: { modelKey: ModelKey }) => void;
export type ProgressHandler = (progress: LoadProgress) => void;

export class InferenceService {
  private worker: InferenceWorker | null = null;
  private ready = false;
  private currentModelKey: ModelKey = ModelKey.BVRA;
  private retryCount = 0;
  private retryTimeout: ReturnType<typeof setTimeout> | null = null;
  private inferQueue: {
    pixels: ArrayBuffer;
    width: number;
    height: number;
    modelKey: ModelKey;
  }[] = [];
  private awaitingStorageConfirm = false;
  private pendingStorageModelKey: ModelKey | null = null;
  private awaitingNetworkConfirm = false;
  private pendingNetworkModelKey: ModelKey | null = null;
  private previousModelKey: ModelKey = ModelKey.BVRA;
  private terminated = false;

  private onStatusHandler: StatusHandler | null = null;
  private onResultHandler: ResultHandler | null = null;
  private onErrorHandler: ErrorHandler | null = null;
  private onStorageConfirmHandler: StorageConfirmHandler | null = null;
  private onNetworkConfirmHandler: NetworkConfirmHandler | null = null;
  private onProgressHandler: ProgressHandler | null = null;
  private activeProgress: LoadProgress | null = null;
  private idleTimeout: ReturnType<typeof setTimeout> | null = null;
  private networkCheckedFor = new Set<ModelKey>();

  onStatus(handler: StatusHandler): void {
    this.onStatusHandler = handler;
  }

  onResult(handler: ResultHandler): void {
    this.onResultHandler = handler;
  }

  onError(handler: ErrorHandler): void {
    this.onErrorHandler = handler;
  }

  onStorageConfirm(handler: StorageConfirmHandler): void {
    this.onStorageConfirmHandler = handler;
  }

  onNetworkConfirm(handler: NetworkConfirmHandler): void {
    this.onNetworkConfirmHandler = handler;
  }

  onProgress(handler: ProgressHandler): void {
    this.onProgressHandler = handler;
  }

  initialize(): void {
    this.terminated = false;
    this.retryCount = 0;
    try {
      this.worker = new Worker(
        new URL("@/inference/worker.ts", import.meta.url),
        { type: "classic" },
      );

      this.worker.onmessage = (e: MessageEvent<WorkerMessage>): void => {
        if (this.terminated) return;
        const { type } = e.data;
        logger.debug("Worker message:", type);

        switch (type) {
          case InferenceWorkerMessageType.Status: {
            if (
              e.data.text === "Ready" &&
              e.data.modelKey === this.currentModelKey
            ) {
              this.ready = true;
              this.retryCount = 0;
              this.activeProgress = null;
              this.resetIdleTimer();
              this.flushInferQueue();
            }
            this.onStatusHandler?.(e.data.text);
            break;
          }
          case InferenceWorkerMessageType.Progress: {
            const progressWithKey = {
              modelKey: this.currentModelKey,
              phase: e.data.phase,
              percent: e.data.percent,
            };
            this.activeProgress = progressWithKey;
            this.onProgressHandler?.(progressWithKey);
            break;
          }
          case InferenceWorkerMessageType.Result: {
            const activeModel = this.getActiveModel();
            if (e.data.logits.length !== activeModel.expectedLabelCount) {
              this.onErrorHandler?.(
                new LabelMismatchError(
                  activeModel.expectedLabelCount,
                  e.data.logits.length,
                ),
              );
              return;
            }
            this.onResultHandler?.({
              logits: new Float32Array(e.data.logits),
              modelKey: e.data.modelKey,
              provenance: e.data.provenance,
            });
            this.onStatusHandler?.("Done");
            break;
          }
          case InferenceWorkerMessageType.Error: {
            logger.error("Worker error:", e.data.message);
            this.handleWorkerError(new InferenceError(e.data.message));
            break;
          }
        }
      };

      this.worker.onerror = (e: ErrorEvent): void => {
        if (this.terminated) return;
        logger.error("Worker runtime error:", e.message);
        this.handleWorkerError(
          new InferenceError(e.message || "Worker runtime error"),
        );
      };
    } catch (err) {
      throw new ModelLoadError(
        err instanceof Error ? err.message : "Failed to initialize worker",
        this.currentModelKey,
      );
    }
  }

  private handleWorkerError(error: InferenceError): void {
    if (error.recoverable && this.retryCount < config.maxInferenceRetries) {
      this.retryCount++;
      logger.warn(
        `Retrying model load (attempt ${String(this.retryCount)}/${String(config.maxInferenceRetries)})`,
      );
      this.onStatusHandler?.(
        `Retrying (${String(this.retryCount)}/${String(config.maxInferenceRetries)})...`,
      );
      if (this.retryTimeout) {
        clearTimeout(this.retryTimeout);
      }
      this.retryTimeout = setTimeout(() => {
        this.retryTimeout = null;
        this.switchModel(this.currentModelKey);
      }, config.retryDelayMs * this.retryCount);
    } else {
      this.onErrorHandler?.(error);
    }
  }

  private flushInferQueue(): void {
    while (this.inferQueue.length > 0) {
      const item = this.inferQueue.shift();
      if (item) {
        if (item.modelKey !== this.currentModelKey) {
          logger.debug(
            "Dropping queued inference for stale model",
            item.modelKey,
          );
          continue;
        }
        this.infer(item.pixels, item.width, item.height);
      }
    }
  }

  switchModel(
    key: ModelKey,
    opts: { skipStorageCheck?: boolean; skipNetworkCheck?: boolean } = {},
  ): void {
    const model = modelRegistry[key];

    // Cellular guard: large model downloads are metered. Prompt once per model
    // per session before letting the request through (the SW cache serves
    // repeat loads, so a confirmed model won't re-prompt).
    if (
      !opts.skipNetworkCheck &&
      !this.networkCheckedFor.has(key) &&
      isCellularConnection()
    ) {
      this.networkCheckedFor.add(key);
      this.awaitingNetworkConfirm = true;
      this.pendingNetworkModelKey = key;
      this.previousModelKey = this.currentModelKey;
      this.onNetworkConfirmHandler?.({ modelKey: key });
      this.onStatusHandler?.(
        `Mobile data connection — confirm to download ${model.name}.`,
      );
      return;
    }
    this.networkCheckedFor.add(key);

    if (!opts.skipStorageCheck && this.shouldCheckStorageFor(key)) {
      void this.checkStorageAndMaybeEmit(key);
      return;
    }

    this.retryCount = 0;
    this.currentModelKey = key;
    this.ready = false;

    const cmd: WorkerCommand = {
      type: WorkerCommandType.Switch,
      modelPath: model.path,
      modelKey: key,
      mean: model.mean,
      std: model.std,
    };
    this.worker?.postMessage(cmd);
    this.onStatusHandler?.(`Loading ${model.name}...`);
    this.activeProgress = {
      modelKey: key,
      phase: "download",
      percent: 0,
    };
  }

  getActiveProgress(): LoadProgress | null {
    return this.activeProgress;
  }

  resetIdleTimer(): void {
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    const idleMs = config.modelIdleUnloadMs;
    if (idleMs <= 0 || this.terminated) return;
    this.idleTimeout = setTimeout(() => {
      this.idleTimeout = null;
      this.unloadWorker();
    }, idleMs);
  }

  private unloadWorker(): void {
    if (this.terminated || this.inferQueue.length > 0) return;
    logger.debug("Idle unload: releasing model worker");
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.activeProgress = null;
    this.onStatusHandler?.("Model unloaded after idle timeout");
  }

  preloadModel(key: ModelKey): void {
    if (!this.worker) {
      this.initialize();
    }
    this.switchModel(key);
  }

  resumeStorageConfirm(): void {
    if (!this.awaitingStorageConfirm || this.pendingStorageModelKey === null) {
      logger.warn("resumeStorageConfirm: no pending storage confirmation");
      return;
    }
    const key = this.pendingStorageModelKey;
    this.awaitingStorageConfirm = false;
    this.pendingStorageModelKey = null;
    this.onStatusHandler?.("Continuing model load...");
    this.switchModel(key, { skipStorageCheck: true });
  }

  /**
   * User accepted the mobile-data download. Continue the model switch, still
   * subject to the storage check (skipNetworkCheck is set so we don't re-prompt).
   */
  resumeNetworkConfirm(): void {
    if (!this.awaitingNetworkConfirm || this.pendingNetworkModelKey === null) {
      logger.warn("resumeNetworkConfirm: no pending network confirmation");
      return;
    }
    const key = this.pendingNetworkModelKey;
    this.awaitingNetworkConfirm = false;
    this.pendingNetworkModelKey = null;
    this.onStatusHandler?.("Downloading model over mobile data...");
    this.switchModel(key, { skipNetworkCheck: true });
  }

  /**
   * User declined the mobile-data download. Revert to the model that was active
   * before the switch so the UI can sync the selector back.
   */
  cancelNetworkConfirm(): ModelKey {
    this.awaitingNetworkConfirm = false;
    const revertTo = this.previousModelKey;
    this.pendingNetworkModelKey = null;
    this.onStatusHandler?.("Model download cancelled.");
    return revertTo;
  }

  private storageCheckedFor = new Set<ModelKey>();

  private shouldCheckStorageFor(key: ModelKey): boolean {
    return !this.storageCheckedFor.has(key);
  }

  private async checkStorageAndMaybeEmit(key: ModelKey): Promise<void> {
    const storage = (navigator as { storage?: StorageManager }).storage;
    if (
      typeof navigator === "undefined" ||
      typeof storage?.estimate !== "function"
    ) {
      logger.debug("StorageManager not available; skipping storage check");
      this.storageCheckedFor.add(key);
      this.switchModel(key, { skipStorageCheck: true });
      return;
    }

    let freeBytes = Infinity;
    try {
      const estimatePromise = navigator.storage.estimate();
      const result = await Promise.race([
        estimatePromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error("storage estimate timeout"));
          }, config.storageEstimateTimeoutMs);
        }),
      ]);
      if (
        typeof result.quota === "number" &&
        typeof result.usage === "number"
      ) {
        freeBytes = Math.max(0, result.quota - result.usage);
      }
    } catch (err) {
      logger.warn("Storage estimate failed; skipping storage check:", err);
      this.storageCheckedFor.add(key);
      this.switchModel(key, { skipStorageCheck: true });
      return;
    }

    this.storageCheckedFor.add(key);

    const minFree = config.minFreeBytesPerModel[key];
    if (freeBytes < minFree) {
      this.awaitingStorageConfirm = true;
      this.pendingStorageModelKey = key;
      const freeMB = Math.round(freeBytes / 1024 / 1024);
      this.onStorageConfirmHandler?.({ modelKey: key, freeBytes });
      this.onStatusHandler?.(
        `Low storage (${String(freeMB)} MB free). Awaiting confirmation.`,
      );
      return;
    }

    this.switchModel(key, { skipStorageCheck: true });
  }

  infer(pixels: ArrayBuffer, width: number, height: number): void {
    if (!this.ready) {
      this.inferQueue.push({
        pixels,
        width,
        height,
        modelKey: this.currentModelKey,
      });
      this.onStatusHandler?.("Model still loading — request queued");
      return;
    }
    this.resetIdleTimer();
    const cmd: WorkerCommand = {
      type: WorkerCommandType.Infer,
      modelKey: this.currentModelKey,
      pixels,
      width,
      height,
    };
    this.worker?.postMessage(cmd, [pixels]);
    this.onStatusHandler?.("Processing...");
  }

  isReady(): boolean {
    return this.ready;
  }

  getActiveModel(): ModelConfig {
    return modelRegistry[this.currentModelKey];
  }

  getActiveModelKey(): ModelKey {
    return this.currentModelKey;
  }

  terminate(): void {
    this.terminated = true;
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
    if (this.idleTimeout) {
      clearTimeout(this.idleTimeout);
      this.idleTimeout = null;
    }
    this.awaitingStorageConfirm = false;
    this.pendingStorageModelKey = null;
    this.awaitingNetworkConfirm = false;
    this.pendingNetworkModelKey = null;
    this.inferQueue = [];
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.activeProgress = null;
    this.onStatusHandler = null;
    this.onResultHandler = null;
    this.onErrorHandler = null;
    this.onStorageConfirmHandler = null;
    this.onNetworkConfirmHandler = null;
    this.onProgressHandler = null;
  }
}

export const inferenceService = new InferenceService();
