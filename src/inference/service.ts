import type {
  ModelConfig,
  SpeciesKnowledge,
  WorkerMessage,
  WorkerCommand,
} from "@/core/types";
import {
  ModelKey,
  InferenceWorkerMessageType,
  WorkerCommandType,
} from "@/core/types";
import { InferenceError, LabelMismatchError, ModelLoadError } from "@/core/errors";
import { logger } from "@/core/logger";
import { modelRegistry } from "@/data/model-registry";
import { TypedEmitter } from "@/core/emitter";

interface InferenceWorker extends Worker {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

interface InferenceEvents {
  [key: string]: unknown;
  status: string;
  result: { logits: Float32Array; modelKey: ModelKey };
  error: InferenceError | LabelMismatchError;
  /**
   * Emitted from switchModel() before a large (≥100 MB) model is
   * loaded when navigator.storage.estimate() reports less than
   * `MIN_FREE_BYTES` of free space. The UI listens for this and
   * shows a confirm modal; the user accepting resumes the switch by
   * calling switchModel() a second time with a bypass flag.
   *
   * The payload reports the requested model, the estimated free
   * bytes, and a token. The handler must call
   * `resumeStorageConfirm(token)` with the same token to actually
   * load the model.
   */
  storageConfirm: { modelKey: ModelKey; freeBytes: number; token: string };
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
// We don't know the model size precisely without the .onnx loaded,
// so we always run the storage check on first switch. 500 MB is
// the dima806 ONNX (330 MB) plus the BVRA ONNX (90 MB) plus a
// small margin. If you only intend to ship one model, lower this.
const MIN_FREE_BYTES = 500 * 1024 * 1024;
const STORAGE_ESTIMATE_TIMEOUT_MS = 1500;

export type { WorkerMessage, WorkerCommand };

export class InferenceService extends TypedEmitter<InferenceEvents> {
  private worker: InferenceWorker | null = null;
  private ready = false;
  private currentModelKey: ModelKey = ModelKey.BVRA;
  private retryCount = 0;
  private inferQueue: { pixels: ArrayBuffer; width: number; height: number }[] = [];
  private pendingStorageToken: string | null = null;
  private pendingModelKey: ModelKey | null = null;

  initialize(): void {
    try {
      // Classic worker (not module) so it can importScripts("/js/ort.min.js").
      // The vendored ort.min.js is a UMD bundle that attaches `ort` to the
      // worker global; module workers cannot use importScripts and ort.min.js
      // is not an ES module.
      this.worker = new Worker(
        new URL("@/inference/worker.ts", import.meta.url),
        { type: "classic" },
      );

      this.worker.onmessage = (
        e: MessageEvent<WorkerMessage>,
      ): void => {
        const { type } = e.data;
        logger.debug("Worker message:", type);

        switch (type) {
          case InferenceWorkerMessageType.Status: {
            if (e.data.text === "Ready" && e.data.modelKey === this.currentModelKey) {
              this.ready = true;
              this.retryCount = 0;
              this.flushInferQueue();
            }
            this.emit("status", e.data.text);
            break;
          }
          case InferenceWorkerMessageType.Result: {
            if (e.data.logits.length !== this.getActiveModel().expectedLabelCount) {
              this.emit(
                "error",
                new LabelMismatchError(
                  this.getActiveModel().labels.length,
                  e.data.logits.length,
                ),
              );
              return;
            }
            this.emit("result", { logits: new Float32Array(e.data.logits), modelKey: e.data.modelKey });
            this.emit("status", "Done");
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
        logger.error("Worker runtime error:", e.message);
        this.handleWorkerError(new InferenceError(e.message || "Worker runtime error"));
      };
    } catch (err) {
      throw new ModelLoadError(
        err instanceof Error ? err.message : "Failed to initialize worker",
        this.currentModelKey,
      );
    }
  }

  private handleWorkerError(error: InferenceError): void {
    if (error.recoverable && this.retryCount < MAX_RETRIES) {
      this.retryCount++;
      logger.warn(
        `Retrying model load (attempt ${String(this.retryCount)}/${String(MAX_RETRIES)})`,
      );
      this.emit(
        "status",
        `Retrying (${String(this.retryCount)}/${String(MAX_RETRIES)})...`,
      );
      setTimeout(() => {
        this.switchModel(this.currentModelKey);
      }, RETRY_DELAY_MS * this.retryCount);
    } else {
      this.emit("error", error);
    }
  }

  private flushInferQueue(): void {
    while (this.inferQueue.length > 0) {
      const item = this.inferQueue.shift();
      if (item) {
        this.infer(item.pixels, item.width, item.height);
      }
    }
  }

  switchModel(key: ModelKey, opts: { skipStorageCheck?: boolean } = {}): void {
    const model = modelRegistry[key];

    // Only enforce the storage check on the "first big load" — once
    // the user has confirmed once, repeated switches between the two
    // models should not re-prompt. The ONNX file is cached by the
    // service worker after first download; subsequent loads come from
    // the cache. We still prompt for the very first load of each
    // large model.
    if (!opts.skipStorageCheck && this.shouldCheckStorageFor(key)) {
      void this.checkStorageAndMaybeEmit(key);
      return;
    }

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
    this.emit("status", `Loading ${model.name}...`);
  }

  /**
   * Called by the UI after the user accepts the storage-confirm
   * modal. Continues the pending switchModel() call.
   */
  resumeStorageConfirm(token: string): void {
    if (this.pendingStorageToken !== token || this.pendingModelKey === null) {
      logger.warn("resumeStorageConfirm: token mismatch or expired");
      return;
    }
    const key = this.pendingModelKey;
    this.pendingStorageToken = null;
    this.pendingModelKey = null;
    this.emit("status", "Continuing model load...");
    this.switchModel(key, { skipStorageCheck: true });
  }

  private storageCheckedFor = new Set<ModelKey>();

  private shouldCheckStorageFor(key: ModelKey): boolean {
    // Don't re-prompt for the same model in the same session.
    return !this.storageCheckedFor.has(key);
  }

  private async checkStorageAndMaybeEmit(key: ModelKey): Promise<void> {
    // If StorageManager isn't available (older browsers, or a
    // restrictive private mode), fall through to the normal load.
    if (typeof navigator === "undefined" || typeof navigator.storage.estimate !== "function") {
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
          setTimeout(
            () => {
              reject(new Error("storage estimate timeout"));
            },
            STORAGE_ESTIMATE_TIMEOUT_MS,
          );
        }),
      ]);
      if (typeof result.quota === "number" && typeof result.usage === "number") {
        freeBytes = Math.max(0, result.quota - result.usage);
      }
    } catch (err) {
      logger.warn("Storage estimate failed; skipping storage check:", err);
      this.storageCheckedFor.add(key);
      this.switchModel(key, { skipStorageCheck: true });
      return;
    }

    this.storageCheckedFor.add(key);

    if (freeBytes < MIN_FREE_BYTES) {
      const token = crypto.randomUUID();
      this.pendingStorageToken = token;
      this.pendingModelKey = key;
      const freeMB = Math.round(freeBytes / 1024 / 1024);
      this.emit("storageConfirm", { modelKey: key, freeBytes, token });
      this.emit(
        "status",
        `Low storage (${String(freeMB)} MB free). Awaiting confirmation.`,
      );
      return;
    }

    this.switchModel(key, { skipStorageCheck: true });
  }

  infer(pixels: ArrayBuffer, width: number, height: number): void {
    if (!this.ready) {
      this.inferQueue.push({ pixels, width, height });
      this.emit("status", "Model still loading — request queued");
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
    this.emit("status", "Processing...");
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

  getActiveKnowledge(): Record<string, SpeciesKnowledge> {
    return modelRegistry[this.currentModelKey].knowledge;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
    this.inferQueue = [];
    this.removeAllListeners();
  }
}

export const inferenceService = new InferenceService();
