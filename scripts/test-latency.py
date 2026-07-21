#!/usr/bin/env python3
"""
Inference latency CI gate for ForagerFlow.

Runs ONNX inference directly against a fixed image set and asserts p95 < N ms
to back ADR-001's "<2s on mid-range mobile" claim with an artifact.

Usage:
  python3 scripts/test-latency.py <model.onnx> <labels.json> <image_dir> <p95_threshold_ms> [--warmup N] [--runs N]

Example:
  python3 scripts/test-latency.py pwa/model/fungitastic.onnx pwa/model/fungitastic-classes.json test-images 2000 --runs 100
"""
import json
import sys
import time
import statistics
import numpy as np
import onnxruntime as ort
from pathlib import Path
from PIL import Image


def preprocess(img_path: str, mean, std, size: int = 224):
    """Square center-crop then resize to size×size, return float32 NCHW."""
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    sx, sy = (w - 224) // 2, (h - 224) // 2
    img = img.crop((sx, sy, sx + 224, sy + 224))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    for c in range(3):
        arr[..., c] = (arr[..., c] - mean[c]) / std[c]
    arr = arr.transpose(2, 0, 1)
    return np.expand_dims(arr, 0).astype(np.float32)


def main() -> int:
    if len(sys.argv) < 5:
        print(__doc__)
        return 1

    model_path = sys.argv[1]
    labels_path = sys.argv[2]
    image_dir = sys.argv[3]
    p95_threshold_ms = float(sys.argv[4])

    warmup = 3
    runs = 10
    i = 5
    while i < len(sys.argv):
        if sys.argv[i] == "--warmup" and i + 1 < len(sys.argv):
            warmup = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--runs" and i + 1 < len(sys.argv):
            runs = int(sys.argv[i + 1])
            i += 2
        else:
            i += 1

    if "dima806" in model_path:
        mean = [0.5, 0.5, 0.5]
        std = [0.5, 0.5, 0.5]
    else:
        mean = [0.485, 0.456, 0.406]
        std = [0.229, 0.224, 0.225]

    images = sorted(Path(image_dir).glob("*.jpg"))
    if not images:
        print(f"ERROR: No images found in {image_dir}")
        return 1

    print(f"Model: {model_path}")
    print(f"Labels: {labels_path}")
    print(f"Images: {len(images)}")
    print(f"Warmup: {warmup} runs per image")
    print(f"Measured: {runs} runs per image")
    print(f"P95 threshold: {p95_threshold_ms} ms")
    print()

    import onnxruntime as ort
    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inp_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name
    print(f"Input: {inp_name}, Output: {out_name}")
    print()

    print("Warming up...")
    for img in images:
        x = preprocess(str(img), mean, std)
        for _ in range(warmup):
            sess.run([out_name], {inp_name: x})
    print("Warmup complete.")
    print()

    all_latencies = []
    for img in images:
        print(f"Testing {img.name}...")
        x = preprocess(str(img), mean, std)
        img_latencies = []
        for run in range(runs):
            start = time.perf_counter()
            sess.run([out_name], {inp_name: x})
            latency = (time.perf_counter() - start) * 1000
            img_latencies.append(latency)
        all_latencies.extend(img_latencies)
        avg = statistics.mean(img_latencies)
        p95_img = statistics.quantiles(img_latencies, n=100)[94] if len(img_latencies) >= 20 else max(img_latencies)
        print(f"  Avg: {avg:.1f} ms, P95: {p95_img:.1f} ms")

    all_latencies.sort()
    n = len(all_latencies)
    p50 = statistics.median(all_latencies)
    p95 = statistics.quantiles(all_latencies, n=100)[94] if n >= 20 else max(all_latencies)
    p99 = statistics.quantiles(all_latencies, n=100)[98] if n >= 100 else max(all_latencies)
    avg = statistics.mean(all_latencies)
    stdev = statistics.stdev(all_latencies) if n > 1 else 0

    print()
    print("=" * 50)
    print("LATENCY RESULTS")
    print("=" * 50)
    print(f"Total runs: {n}")
    print(f"Average:    {avg:.1f} ms")
    print(f"Std Dev:    {stdev:.1f} ms")
    print(f"P50 (med):  {p50:.1f} ms")
    print(f"P95:        {p95:.1f} ms")
    print(f"P99:        {p99:.1f} ms")
    print(f"Min:        {min(all_latencies):.1f} ms")
    print(f"Max:        {max(all_latencies):.1f} ms")
    print(f"Threshold:  {p95_threshold_ms:.1f} ms")
    print()

    artifact = {
        "model": model_path,
        "labels": labels_path,
        "images_tested": [str(img) for img in images],
        "warmup_runs": warmup,
        "measured_runs_per_image": runs,
        "total_runs": n,
        "latencies_ms": all_latencies,
        "summary": {
            "avg_ms": avg,
            "stdev_ms": stdev,
            "p50_ms": p50,
            "p95_ms": p95,
            "p99_ms": p99,
            "min_ms": min(all_latencies),
            "max_ms": max(all_latencies),
            "threshold_ms": p95_threshold_ms,
            "passed": p95 < p95_threshold_ms,
        },
    }

    artifact_path = "latency-results.json"
    with open(artifact_path, "w") as f:
        json.dump(artifact, f, indent=2)
    print(f"Artifact written to {artifact_path}")

    if p95 < p95_threshold_ms:
        print(f"PASS: P95 ({p95:.1f} ms) < threshold ({p95_threshold_ms:.1f} ms)")
        return 0
    else:
        print(f"FAIL: P95 ({p95:.1f} ms) >= threshold ({p95_threshold_ms:.1f} ms)")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())