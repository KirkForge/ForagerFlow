import type { ModelConfig, WorkerMessage, WorkerCommand } from "@/core/types";
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

interface InferenceWorker extends Worker {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type { WorkerMessage, WorkerCommand };

export type StatusHandler = (text: string) => void;
export type ResultHandler = (result: {
  logits: Float32Array;
  modelKey: ModelKey;
}) => void;
export type ErrorHandler = (
  error: InferenceError | LabelMismatchError,
) => void;
export type StorageConfirmHandler = (payload: {
  modelKey: ModelKey;
  freeBytes: number;
  token: string;
}) => void;

function generateToken(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(16);
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
  }
  let hex = "";
  for (const b of arr) {
    hex += b.toString(16).padStart(2, "0");
  }
  return `${Date.now().toString(36)}-${hex}`;
}

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
  private pendingStorageToken: string | null = null;
  private pendingModelKey: ModelKey | null = null;
  private terminated = false;

  private onStatusHandler: StatusHandler | null = null;
  private onResultHandler: ResultHandler | null = null;
  private onErrorHandler: ErrorHandler | null = null;
  private onStorageConfirmHandler: StorageConfirmHandler | null = null;

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
              this.flushInferQueue();
            }
            this.onStatusHandler?.(e.data.text);
            break;
          }
          case InferenceWorkerMessageType.Result: {
            if (
              e.data.logits.length !== this.getActiveModel().expectedLabelCount
            ) {
              this.onErrorHandler?.(
                new LabelMismatchError(
                  this.getActiveModel().labels.length,
                  e.data.logits.length,
                ),
              );
              return;
            }
            this.onResultHandler?.({
              logits: new Float32Array(e.data.logits),
              modelKey: e.data.modelKey,
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

  switchModel(key: ModelKey, opts: { skipStorageCheck?: boolean } = {}): void {
    const model = modelRegistry[key];

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
  }

  resumeStorageConfirm(token: string): void {
    if (this.pendingStorageToken !== token || this.pendingModelKey === null) {
      logger.warn("resumeStorageConfirm: token mismatch or expired");
      return;
    }
    const key = this.pendingModelKey;
    this.pendingStorageToken = null;
    this.pendingModelKey = null;
    this.onStatusHandler?.("Continuing model load...");
    this.switchModel(key, { skipStorageCheck: true });
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
      const token = generateToken();
      this.pendingStorageToken = token;
      this.pendingModelKey = key;
      const freeMB = Math.round(freeBytes / 1024 / 1024);
      this.onStorageConfirmHandler?.({ modelKey: key, freeBytes, token });
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
    this.pendingStorageToken = null;
    this.pendingModelKey = null;
    this.inferQueue = [];
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.onStatusHandler = null;
    this.onResultHandler = null;
    this.onErrorHandler = null;
    this.onStorageConfirmHandler = null;
  }
}

export const inferenceService = new InferenceService();
