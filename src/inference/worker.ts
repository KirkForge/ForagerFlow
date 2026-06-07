// Classic (dedicated) worker: use importScripts to load the UMD ort.min.js
// which attaches `ort` to the worker global. Module workers cannot use
// importScripts, and ort.min.js (vendored UMD) is not an ES module.

declare const self: DedicatedWorkerGlobalScope;
declare const ort: OrtStatic;

importScripts("/js/ort.min.js");

// The worker is loaded from /assets/inference-worker-*.js, so when ort
// internally dynamic-imports `ort-wasm-simd-threaded.jsep.mjs` (and the
// .wasm sidecar), it resolves relative to the worker's location, producing
// the wrong URL /assets/ort-wasm-simd-threaded.jsep.mjs. Force the base
// path to /js/ where we actually serve the artifacts.
(ort as unknown as { env: { wasm: { wasmPaths: string } } }).env.wasm.wasmPaths =
  "/js/";

import type { WorkerCommand } from "../core/types";
import { WorkerCommandType, InferenceWorkerMessageType } from "../core/types";

interface OrtTensor {
  data: Float32Array;
  buffer: ArrayBuffer;
}

interface OrtSession {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}

interface OrtStatic {
  InferenceSession: {
    create(
      buffer: Uint8Array | string,
      options: {
        executionProviders: string[];
        graphOptimizationLevel: string;
      },
    ): Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array,
    dims: number[],
  ) => OrtTensor;
}

let session: OrtSession | null = null;
let currentMean: [number, number, number] = [0.485, 0.456, 0.406];
let currentStd: [number, number, number] = [0.229, 0.224, 0.225];

function preprocess(
  pixels: ArrayBuffer,
  width: number,
  height: number,
  mean: readonly [number, number, number],
  std: readonly [number, number, number],
): OrtTensor {
  const total = width * height;
  const red = new Float32Array(total);
  const green = new Float32Array(total);
  const blue = new Float32Array(total);
  const data = new Uint8ClampedArray(pixels);

  for (let i = 0; i < total; i++) {
    const offset = i * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    red[i] = (r / 255 - mean[0]) / std[0];
    green[i] = (g / 255 - mean[1]) / std[1];
    blue[i] = (b / 255 - mean[2]) / std[2];
  }

  const tensorData = new Float32Array(total * 3);
  tensorData.set(red, 0);
  tensorData.set(green, total);
  tensorData.set(blue, total * 2);

  return new ort.Tensor("float32", tensorData, [1, 3, height, width]);
}

async function loadModel(
  modelPath: string,
  modelKey: string,
): Promise<void> {
  session = null;
  self.postMessage({
    type: InferenceWorkerMessageType.Status,
    text: "Loading model...",
  });
  try {
    // Fetch the ONNX as ArrayBuffer and pass to ort. This sidesteps ort's
    // internal external-data sidecar resolution, which is broken when the
    // model is loaded from inside a worker (ort computes the .data URL
    // relative to the worker's location, not the model URL, and the empty
    // path then errors with "Module.MountedFiles is not available").
    const resp = await fetch(modelPath);
    if (!resp.ok) {
      throw new Error(`Failed to fetch model: HTTP ${String(resp.status)}`);
    }
    const buf = new Uint8Array(await resp.arrayBuffer());
    session = await ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
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

  self.onmessage = async (e: MessageEvent<WorkerCommand>) => {
  const { type } = e.data;

  if (type === WorkerCommandType.Switch) {
    const cmd = e.data as { mean?: [number, number, number]; std?: [number, number, number]; modelPath: string; modelKey: string };
    if (cmd.mean) currentMean = cmd.mean;
    if (cmd.std) currentStd = cmd.std;
    // loadModel() posts Status/Error itself. Don't double-post "Ready" here —
    // if we do, the main thread flips to ready=true even on load failure,
    // and the next infer call hits a stale "No model loaded" error instead
    // of the real failure message.
    await loadModel(cmd.modelPath, cmd.modelKey);
    return;
  }

  {
    // type === WorkerCommandType.Infer
    const { pixels, width, height } = e.data;
    try {
      if (!session) {
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
      const input = preprocess(pixels, width, height, currentMean, currentStd);
      const outputs = await session.run({ pixel_values: input });
      const logitsData = outputs["logits"];
      const logits = logitsData?.data ?? new Float32Array();
      self.postMessage({
        type: InferenceWorkerMessageType.Result,
        logits: Array.from(logits),
        modelKey: e.data.modelKey,
      });
    } catch (err) {
      console.error("[FORAGERFLOW] Inference worker error:", err);
      self.postMessage({
        type: InferenceWorkerMessageType.Error,
        message: err instanceof Error ? err.message : "Unknown inference error",
      });
    }
  }
};
