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
(
  ort as unknown as { env: { wasm: { wasmPaths: string } } }
).env.wasm.wasmPaths = "/js/";

import { createWorker } from "./worker-logic";
import type { OrtStatic } from "./worker-logic";

createWorker(self, ort, (type, data, dims) => new ort.Tensor(type, data, dims));
