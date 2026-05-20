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
import { AppError, InferenceError, ModelLoadError } from "@/core/errors";
import { logger } from "@/core/logger";
import { modelRegistry } from "@/data/model-registry";

interface InferenceWorker extends Worker {
  onmessage: ((e: MessageEvent<WorkerMessage>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
}

export type { WorkerMessage, WorkerCommand };

export class InferenceService {
  private worker: InferenceWorker | null = null;
  private ready = false;
  private currentModelKey: ModelKey = ModelKey.BVRA;
  private onStatusChange: ((text: string) => void) | null = null;
  private onResult:
    | ((logits: Float32Array, modelKey: ModelKey) => void)
    | null = null;
  private onError: ((error: AppError) => void) | null = null;

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
            }
            this.onStatusChange?.(e.data.text);
            break;
          }
          case InferenceWorkerMessageType.Result: {
            if (e.data.logits.length !== this.getActiveModel().expectedLabelCount) {
              this.onError?.(
                new AppError(
                  `Label/logit mismatch: ${String(this.getActiveModel().labels.length)} labels vs ${String(e.data.logits.length)} logits`,
                  "LABEL_MISMATCH",
                  false,
                ),
              );
              return;
            }
            this.onResult?.(new Float32Array(e.data.logits), e.data.modelKey);
            this.onStatusChange?.("Done");
            break;
          }
          case InferenceWorkerMessageType.Error: {
            logger.error("Worker error:", e.data.message);
            this.onError?.(new InferenceError(e.data.message));
            break;
          }
        }
      };

      this.worker.onerror = (e: ErrorEvent): void => {
        logger.error("Worker runtime error:", e.message);
        this.onError?.(
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
    this.onStatusChange?.(`Loading ${model.name}...`);
  }

  infer(pixels: ArrayBuffer, width: number, height: number): void {
    if (!this.ready) {
      this.onStatusChange?.("Model still loading...");
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
    this.onStatusChange?.("Processing...");
  }

  on(
    event: "status",
    handler: (text: string) => void,
  ): void;
  on(
    event: "result",
    handler: (logits: Float32Array, modelKey: ModelKey) => void,
  ): void;
  on(
    event: "error",
    handler: (error: AppError) => void,
  ): void;
  on(
    event: string,
    handler: (...args: never[]) => void,
  ): void {
    if (event === "status") {
      this.onStatusChange = handler as (text: string) => void;
    } else if (event === "result") {
      this.onResult = handler as (logits: Float32Array, modelKey: ModelKey) => void;
    } else if (event === "error") {
      this.onError = handler as (error: AppError) => void;
    }
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
  }
}

export const inferenceService = new InferenceService();
