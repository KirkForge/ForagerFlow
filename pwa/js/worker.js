importScripts("./ort.min.js");

let session = null;
let currentMean = [0.485, 0.456, 0.406];
let currentStd = [0.229, 0.224, 0.225];

async function loadModel(modelPath) {
  session = null;
  self.postMessage({ type: "status", text: "Loading model..." });
  try {
    session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    self.postMessage({ type: "status", text: "Ready" });
  } catch (err) {
    self.postMessage({ type: "error", message: err.message });
  }
}

function preprocess(pixels, width, height, mean, std) {
  const total = width * height;
  const red = new Float32Array(total);
  const green = new Float32Array(total);
  const blue = new Float32Array(total);
  const data = new Uint8ClampedArray(pixels);

  for (let i = 0; i < total; i++) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    red[i] = (r - mean[0]) / std[0];
    green[i] = (g - mean[1]) / std[1];
    blue[i] = (b - mean[2]) / std[2];
  }

  const tensor = new ort.Tensor("float32", new Float32Array(total * 3), [1, 3, height, width]);
  const buf = tensor.data;
  buf.set(red, 0);
  buf.set(green, total);
  buf.set(blue, total * 2);
  return tensor;
}

self.onmessage = async (e) => {
  const { type } = e.data;

  if (type === "switch") {
    if (e.data.mean) currentMean = e.data.mean;
    if (e.data.std) currentStd = e.data.std;
    await loadModel(e.data.modelPath);
    self.postMessage({ type: "status", text: "Ready", modelKey: e.data.modelKey });
    return;
  }

  if (type === "infer") {
    const { pixels, width, height } = e.data;
    try {
      if (!session) {
        self.postMessage({ type: "error", message: "No model loaded" });
        return;
      }
      self.postMessage({ type: "status", text: "Running inference..." });
      const input = preprocess(pixels, width, height, currentMean, currentStd);
      const outputs = await session.run({ pixel_values: input });
      const logits = outputs.logits.data;
      self.postMessage({ type: "result", logits: Array.from(logits), modelKey: e.data.modelKey });
    } catch (err) {
      self.postMessage({ type: "error", message: err.message });
    }
  }
};
