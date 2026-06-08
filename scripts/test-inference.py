"""
Real-ONNX smoke test + end-to-end top-5 inference helper for ForagerFlow.

Two modes:

  smoke  <model.onnx> <labels.json> [<model.onnx> <labels.json> ...]
      Loads each model, runs a zero input through it, and asserts the
      output shape matches len(labels) and all logits are finite.
      No image needed. This is the gate `pnpm verify:inference` runs.

      Example:
        python3 scripts/test-inference.py smoke \
            pwa/model/fungitastic.onnx pwa/model/fungitastic-classes.json \
            pwa/model/dima806.onnx       src/data/labels-dima806.json

  top5  <image.jpg> [model.onnx] [labels.json] [mean,std]
      Replicates the browser worker's preprocessing exactly (square
      center-crop → resize to 224x224 → NCHW float32 with mean/std
      normalization) and prints the top-5 predictions. Useful when
      you've exported new weights and want to confirm they identify
      the right mushroom. Not part of CI.

      Example:
        python3 scripts/test-inference.py top5 photos/boletus.jpg

The smoke mode mirrors the in-workflow check in
`.github/workflows/release.yml` — same shape/finiteness assertions —
so passing locally means the release job's identical check will pass.
"""
import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


def _load_labels(path: str) -> list[str]:
    """labels.json is always a JSON array of strings."""
    return json.loads(Path(path).read_text())


def smoke(model_path: str, labels_path: str) -> tuple[bool, str]:
    """Run zeros through `model_path` and assert shape + finiteness.

    Returns (ok, message). The labels file is loaded only to assert
    len(logits) == len(labels) — the same invariant the worker enforces
    at runtime.
    """
    labels = _load_labels(labels_path)
    expected = len(labels)

    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inp_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    out_shape = sess.get_outputs()[0].shape
    # batch dim may be symbolic (None/str); assume 1.
    out_class = out_shape[1] if isinstance(out_shape[1], int) else None

    x = np.zeros((1, 3, 224, 224), dtype=np.float32)
    logits = sess.run([out_name], {inp_name: x})[0]

    shape_ok = logits.shape == (1, expected)
    finite_ok = bool(np.isfinite(logits).all())
    size_ok = out_class is None or out_class == expected

    msg = (
        f"  shape={logits.shape}  expected=(1,{expected})  "
        f"finite={finite_ok}  declared_out_class={out_class}  "
        f"labels={expected}"
    )
    return (shape_ok and finite_ok and size_ok), msg


def preprocess(img_path: str, mean, std, size: int = 224) -> np.ndarray:
    """Square center-crop then resize to size×size, return float32 NCHW."""
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    s = min(w, h)
    sx, sy = (w - s) // 2, (h - s) // 2
    img = img.crop((sx, sy, sx + s, sy + s)).resize((size, size), Image.BILINEAR)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    for c in range(3):
        arr[..., c] = (arr[..., c] - mean[c]) / std[c]
    arr = arr.transpose(2, 0, 1)  # HWC -> CHW
    return np.expand_dims(arr, 0).astype(np.float32)


def softmax(x):
    x = x - x.max()
    e = np.exp(x)
    return e / e.sum()


def top5(argv: list[str]) -> int:
    """End-to-end top-5 inference on a real image."""
    img_path = argv[0]
    model_path = argv[1] if len(argv) > 1 else "pwa/model/fungitastic.onnx"
    labels_path = argv[2] if len(argv) > 2 else "pwa/model/fungitastic-classes.json"
    if len(argv) > 3:
        mean = [float(x) for x in argv[3].split(",")]
        std = [float(x) for x in argv[4].split(",")]
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
    print(f"in:       {inp_name}  out: {out_name}  shape: {sess.get_outputs()[0].shape}")

    x = preprocess(img_path, mean, std)
    print(f"input:    shape={x.shape} dtype={x.dtype} range=[{x.min():.3f}, {x.max():.3f}]")

    logits = sess.run([out_name], {inp_name: x})[0][0]
    probs = softmax(logits)
    top = probs.argsort()[::-1][:5]
    labels = _load_labels(labels_path)

    print()
    print("Top-5:")
    for rank, idx in enumerate(top, 1):
        label = labels[idx] if idx < len(labels) else f"<idx {idx} out of range>"
        print(f"  {rank}. [{idx:3d}] {probs[idx] * 100:5.1f}%  {label}")
    return 0


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    mode = sys.argv[1]
    if mode == "smoke":
        args = sys.argv[2:]
        if not args or len(args) % 2 != 0:
            print("usage: test-inference.py smoke <model.onnx> <labels.json> [...]")
            return 1
        pairs = list(zip(args[0::2], args[1::2]))
        failed = 0
        for model_path, labels_path in pairs:
            name = Path(model_path).name
            try:
                ok, msg = smoke(model_path, labels_path)
            except Exception as e:
                print(f"FAIL  {name}: {e}")
                failed += 1
                continue
            tag = "PASS" if ok else "FAIL"
            print(f"{tag}  {name}{msg}")
            if not ok:
                failed += 1
        if failed:
            print(f"\n{failed} model(s) failed smoke test.")
            return 1
        print("\nAll real-ONNX smoke checks passed.")
        return 0

    if mode == "top5":
        return top5(sys.argv[2:])

    # Back-compat: if the first arg is an image path, fall through to top5.
    return top5(sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())
