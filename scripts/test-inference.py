"""
End-to-end inference test for ForagerFlow.

Replicates pwa/js/worker.js preprocessing exactly:
  - take photo
  - square center-crop to min(w, h)
  - resize to 224x224
  - convert to float32 NCHW with mean/std normalization
  - feed to ONNX Runtime, softmax, print top-5

This is the ground truth for "does the model identify the right mushroom".
The browser worker.js does the same arithmetic, but in JS; if both
preprocess identically, the top-1 will match.

Usage:
  python scripts/test-inference.py <image.jpg> [model.onnx] [labels.json] [mean,std]
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


def preprocess(img_path: str, mean, std, size: int = 224) -> np.ndarray:
    """Square center-crop then resize to size×size, return float32 NCHW."""
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    s = min(w, h)
    sx, sy = (w - s) // 2, (h - s) // 2
    img = img.crop((sx, sy, sx + s, sy + s)).resize((size, size), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0  # HWC, [0,1]
    # Match worker.js: (x/255 - mean) / std
    for c in range(3):
        arr[..., c] = (arr[..., c] - mean[c]) / std[c]
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    return np.expand_dims(arr, 0).astype(np.float32)  # NCHW


def softmax(x):
    x = x - x.max()
    e = np.exp(x)
    return e / e.sum()


def load_labels(path: str):
    if path.endswith(".json"):
        return json.loads(Path(path).read_text())
    # fungitastic-classes.json is a single array
    return json.loads(Path(path).read_text())


def main():
    if len(sys.argv) < 2:
        print("usage: test-inference.py <image> [model.onnx] [labels.json] [mean,std]")
        sys.exit(1)
    img_path = sys.argv[1]
    model_path = sys.argv[2] if len(sys.argv) > 2 else "pwa/model/fungitastic.onnx"
    labels_path = sys.argv[3] if len(sys.argv) > 3 else "pwa/model/fungitastic-classes.json"
    if len(sys.argv) > 4:
        mean = [float(x) for x in sys.argv[4].split(",")]
        std = [float(x) for x in sys.argv[5].split(",")]
    elif "dima806" in model_path:
        mean, std = [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    else:
        mean, std = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

    print(f"image:    {img_path}")
    print(f"model:    {model_path}")
    print(f"labels:   {labels_path}")
    print(f"mean:     {mean}")
    print(f"std:      {std}")

    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inp_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    print(f"in:       {inp_name}  out: {out_name}  expected shape: {sess.get_outputs()[0].shape}")

    x = preprocess(img_path, mean, std)
    print(f"input:    shape={x.shape} dtype={x.dtype} range=[{x.min():.3f}, {x.max():.3f}]")

    logits = sess.run([out_name], {inp_name: x})[0][0]
    probs = softmax(logits)
    top5 = probs.argsort()[::-1][:5]

    labels = load_labels(labels_path)
    print()
    print("Top-5:")
    for rank, idx in enumerate(top5, 1):
        label = labels[idx] if idx < len(labels) else f"<idx {idx} out of range>"
        print(f"  {rank}. [{idx:3d}] {probs[idx]*100:5.1f}%  {label}")


if __name__ == "__main__":
    main()
