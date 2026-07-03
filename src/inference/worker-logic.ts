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

/**
 * Bytes accumulated from a partially completed model download. Retained in
 * worker scope across a retry so `loadModel` can re-request the remainder with
 * `Range: bytes=N-` instead of restarting a large fetch from zero.
 */
interface PartialDownload {
  modelKey: string;
  chunks: Uint8Array[];
  received: number;
  contentLength: number;
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
  let partial: PartialDownload | null = null;

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
      // If a previous attempt for this same model left partial bytes in memory,
      // ask the server for the remainder with a Range request rather than
      // restarting a multi-hundred-MB download from zero.
      const resumeFrom =
        partial !== null && partial.modelKey === modelKey && partial.received > 0
          ? partial.received
          : 0;
      const resp =
        resumeFrom > 0
          ? await fetch(modelPath, {
              headers: { Range: `bytes=${String(resumeFrom)}-` },
            })
          : await fetch(modelPath);

      // 206 = the server honored the range; append the remainder. 200 = the
      // server ignored the range (unsupported / unsatisfiable) and returned the
      // full body — discard the stale partial and restart from zero so the
      // buffer isn't built on mismatched bytes.
      const resumed = resumeFrom > 0 && resp.status === 206;
      if (!resp.ok && resp.status !== 206) {
        throw new Error(`Failed to fetch model: HTTP ${String(resp.status)}`);
      }
      if (resumeFrom > 0 && !resumed) {
        partial = null;
      }

      let chunks: Uint8Array[];
      let received: number;
      let contentLength: number;
      if (resumed && partial !== null) {
        chunks = partial.chunks;
        received = partial.received;
        // For a 206 the content-length header is the remaining bytes, not the
        // total — keep the original total so progress stays accurate.
        contentLength = partial.contentLength;
      } else {
        chunks = [];
        received = 0;
        contentLength = Number(resp.headers.get("content-length") ?? "0");
        partial = { modelKey, chunks, received, contentLength };
      }
      const active = partial;

      const reader = resp.body?.getReader();
      if (reader && Number.isFinite(contentLength) && contentLength > 0) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          active.received = received;
          postProgress("download", (received / contentLength) * 100);
        }
      } else {
        postProgress("download", 0);
        const ab = await resp.arrayBuffer();
        chunks.push(new Uint8Array(ab));
        received += ab.byteLength;
        active.received = received;
        postProgress("download", 100);
      }

      if (
        Number.isFinite(contentLength) &&
        contentLength > 0 &&
        received < contentLength
      ) {
        // The stream ended short of the declared length (e.g. a connection
        // drop that the reader surfaced as `done`). Treat it as interrupted so
        // the next retry resumes via Range instead of compiling a truncated model.
        throw new Error("Model download interrupted before completion");
      }

      const buf = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        buf.set(chunk, offset);
        offset += chunk.length;
      }
      // Full body assembled — drop the partial before the compile step.
      partial = null;

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
      // Keep `partial` so a retry resumes via Range from the bytes already
      // received rather than restarting the download from zero.
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
