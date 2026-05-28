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
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export type { WorkerMessage, WorkerCommand };

export class InferenceService extends TypedEmitter<InferenceEvents> {
  private worker: InferenceWorker | null = null;
  private ready = false;
  private currentModelKey: ModelKey = ModelKey.BVRA;
  private retryCount = 0;
  private inferQueue: { pixels: ArrayBuffer; width: number; height: number }[] = [];

  initialize(): void {
    try {
      this.worker = new Worker(
        new URL("@/inference/worker.ts", import.meta.url),
        { type: "module" },
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

  switchModel(key: ModelKey): void {
    const model = modelRegistry[key];

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
