import type { InferCommand, WorkerCommand } from "@/core/types";
import {
  InferenceWorkerMessageType,
  ModelKey,
  WorkerCommandType,
} from "@/core/types";

export interface OrtTensor {
  data: Float32Array;
  dispose?: () => void;
  buffer: ArrayBuffer;
}

export interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release?: () => Promise<void>;
  dispose?: () => Promise<void>;
}

export interface OrtStatic {
  InferenceSession: {
    create(
      buffer: Uint8Array | string,
      options: {
        executionProviders: string[];
        graphOptimizationLevel: string;
      },
    ): Promise<OrtSession>;
  };
  Tensor: new (type: string, data: Float32Array, dims: number[]) => OrtTensor;
}

export interface SessionState {
  session: OrtSession;
  modelKey: string;
  mean: [number, number, number];
  std: [number, number, number];
}

export interface WorkerContext {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerCommand | { type: string }>) => void,
  ): void;
  removeEventListener(type: "message", listener: EventListener): void;
}

function isValidModelKey(value: unknown): value is ModelKey {
  return Object.values(ModelKey).includes(value as ModelKey);
}

function isValidRgbTuple(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function validateSwitchCommand(data: unknown):
  | {
      valid: true;
      cmd: {
        modelPath: string;
        modelKey: ModelKey;
        mean: [number, number, number];
        std: [number, number, number];
      };
    }
  | { valid: false; reason: string } {
  const record =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  const modelPath = record["modelPath"];
  const modelKey = record["modelKey"];
  const mean = record["mean"];
  const std = record["std"];

  if (typeof modelPath !== "string" || modelPath.length === 0) {
    return { valid: false, reason: "switch command requires a modelPath" };
  }
  if (!isValidModelKey(modelKey)) {
    return { valid: false, reason: "switch command requires a valid modelKey" };
  }
  if (mean !== undefined && !isValidRgbTuple(mean)) {
    return {
      valid: false,
      reason: "switch command mean must be a [R,G,B] tuple",
    };
  }
  if (std !== undefined && !isValidRgbTuple(std)) {
    return {
      valid: false,
      reason: "switch command std must be a [R,G,B] tuple",
    };
  }

  return {
    valid: true,
    cmd: {
      modelPath,
      modelKey,
      mean: isValidRgbTuple(mean) ? mean : [0.485, 0.456, 0.406],
      std: isValidRgbTuple(std) ? std : [0.229, 0.224, 0.225],
    },
  };
}

function validateInferCommand(data: unknown):
  | {
      valid: true;
      cmd: InferCommand;
    }
  | { valid: false; reason: string } {
  const record =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : {};
  const pixels = record["pixels"];
  const width = record["width"];
  const height = record["height"];
  const modelKey = record["modelKey"];

  if (!(pixels instanceof ArrayBuffer)) {
    return {
      valid: false,
      reason: "infer command requires an ArrayBuffer pixels",
    };
  }
  if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
    return { valid: false, reason: "infer command requires a positive width" };
  }
  if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
    return { valid: false, reason: "infer command requires a positive height" };
  }
  if (!isValidModelKey(modelKey)) {
    return { valid: false, reason: "infer command requires a valid modelKey" };
  }

  return {
    valid: true,
    cmd: {
      type: WorkerCommandType.Infer,
      pixels,
      width,
      height,
      modelKey,
    },
  };
}

export function createWorker(
  self: WorkerContext,
  ort: OrtStatic,
  createTensor: (type: string, data: Float32Array, dims: number[]) => OrtTensor,
): () => void {
  let state: SessionState | null = null;

  function preprocess(
    pixels: ArrayBuffer,
    width: number,
    height: number,
    mean: readonly [number, number, number],
    std: readonly [number, number, number],
  ): OrtTensor {
    const total = width * height;
    const data = new Uint8ClampedArray(pixels);

    // Single [3, H, W] NCHW buffer to reduce transient allocations.
    const tensorData = new Float32Array(total * 3);

    for (let i = 0; i < total; i++) {
      const offset = i * 4;
      const r = data[offset] ?? 0;
      const g = data[offset + 1] ?? 0;
      const b = data[offset + 2] ?? 0;
      tensorData[i] = (r / 255 - mean[0]) / std[0];
      tensorData[i + total] = (g / 255 - mean[1]) / std[1];
      tensorData[i + total * 2] = (b / 255 - mean[2]) / std[2];
    }

    return createTensor("float32", tensorData, [1, 3, height, width]);
  }

  function postProgress(phase: "download" | "compile", percent: number): void {
    self.postMessage({
      type: InferenceWorkerMessageType.Progress,
      phase,
      percent: Math.max(0, Math.min(100, Math.round(percent))),
    });
  }

  async function loadModel(
    modelPath: string,
    modelKey: string,
    mean: [number, number, number],
    std: [number, number, number],
  ): Promise<void> {
    self.postMessage({
      type: InferenceWorkerMessageType.Status,
      text: "Loading model...",
    });
    try {
      const resp = await fetch(modelPath);
      if (!resp.ok) {
        throw new Error(`Failed to fetch model: HTTP ${String(resp.status)}`);
      }

      let buf: Uint8Array;
      const contentLength = Number(resp.headers.get("content-length") ?? "0");
      const reader = resp.body?.getReader();
      if (reader && Number.isFinite(contentLength) && contentLength > 0) {
        let received = 0;
        const chunks: Uint8Array[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          postProgress("download", (received / contentLength) * 100);
        }
        buf = new Uint8Array(received);
        let offset = 0;
        for (const chunk of chunks) {
          buf.set(chunk, offset);
          offset += chunk.length;
        }
      } else {
        postProgress("download", 0);
        buf = new Uint8Array(await resp.arrayBuffer());
        postProgress("download", 100);
      }

      postProgress("compile", 0);
      const newSession = await ort.InferenceSession.create(buf, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      postProgress("compile", 100);

      // Dispose the previous session so its native memory is released promptly
      // instead of waiting for GC.
      if (state?.session) {
        try {
          await (state.session.dispose?.() ?? state.session.release?.());
        } catch (e) {
          // Best-effort disposal; some ort builds don't expose dispose/release.
          console.warn("[FORAGERFLOW] Failed to dispose old session:", e);
        }
      }

      state = { session: newSession, modelKey, mean, std };
      self.postMessage({
        type: InferenceWorkerMessageType.Status,
        text: "Ready",
        modelKey,
      });
    } catch (err) {
      self.postMessage({
        type: InferenceWorkerMessageType.Error,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleWorkerMessage(
    e: MessageEvent<WorkerCommand | { type: string }>,
  ): Promise<void> {
    const { type } = e.data;

    if (type === "switch") {
      const validated = validateSwitchCommand(e.data);
      if (!validated.valid) {
        self.postMessage({
          type: InferenceWorkerMessageType.Error,
          message: validated.reason,
        });
        return;
      }
      const { cmd } = validated;
      await loadModel(cmd.modelPath, cmd.modelKey, cmd.mean, cmd.std);
      return;
    }

    if (type === "infer") {
      const validated = validateInferCommand(e.data);
      if (!validated.valid) {
        self.postMessage({
          type: InferenceWorkerMessageType.Error,
          message: validated.reason,
        });
        return;
      }
      const { pixels, width, height, modelKey } = validated.cmd;
      try {
        if (state?.modelKey !== modelKey) {
          self.postMessage({
            type: InferenceWorkerMessageType.Error,
            message: "No model loaded",
          });
          return;
        }
        self.postMessage({
          type: InferenceWorkerMessageType.Status,
          text: "Running inference...",
        });
        const input = preprocess(pixels, width, height, state.mean, state.std);
        const outputs = await state.session.run({ pixel_values: input });
        const logitsData = outputs["logits"];
        if (!logitsData?.data || logitsData.data.length === 0) {
          self.postMessage({
            type: InferenceWorkerMessageType.Error,
            message: "Model output missing logits",
          });
          return;
        }
        const logits = logitsData.data;

        // Dispose output tensors if the runtime supports it.
        for (const tensor of Object.values(outputs)) {
          try {
            tensor.dispose?.();
          } catch {
            // ignore
          }
        }

        self.postMessage({
          type: InferenceWorkerMessageType.Result,
          logits: Array.from(logits),
          modelKey,
        });
      } catch (err) {
        console.error("[FORAGERFLOW] Inference worker error:", err);
        self.postMessage({
          type: InferenceWorkerMessageType.Error,
          message:
            err instanceof Error ? err.message : "Unknown inference error",
        });
      }
      return;
    }

    self.postMessage({
      type: InferenceWorkerMessageType.Error,
      message: `Unknown worker command: ${type}`,
    });
  }

  const listener = (
    e: MessageEvent<WorkerCommand | { type: string }>,
  ): void => {
    handleWorkerMessage(e).catch((err: unknown) => {
      console.error("[FORAGERFLOW] Worker handler failed:", err);
      self.postMessage({
        type: InferenceWorkerMessageType.Error,
        message:
          err instanceof Error ? err.message : "Unknown worker handler error",
      });
    });
  };

  self.addEventListener("message", listener);

  return () => {
    self.removeEventListener("message", listener as EventListener);
  };
}
