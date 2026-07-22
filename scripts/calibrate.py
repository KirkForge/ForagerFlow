#!/usr/bin/env python3
"""
Temperature scaling calibration for ForagerFlow ONNX models.

Fits a single temperature parameter T on logits via NLL minimization,
computes Expected Calibration Error (ECE), and writes the result to
pwa/model/<model>-T.json.

Usage:
  python3 scripts/calibrate.py pwa/model/fungitastic.onnx pwa/model/fungitastic-classes.json test-images --runs 5
  python3 scripts/calibrate.py pwa/model/fungitastic.onnx pwa/model/fungitastic-classes.json test-images --runs 5 --labels-csv labels.csv

Honesty note (ponytail:): When --labels-csv is NOT provided, ECE is computed
against argmax-of-logits pseudo-labels (self-referential). Self-referential ECE
is an UPPER BOUND on calibration quality, NOT a measurement of true calibration.
The script prints a warning to this effect. When --labels-csv IS provided with
ground-truth labels, true ECE is computed.
"""
import csv
import json
import sys
import time
import argparse
import numpy as np
import onnxruntime as ort
from pathlib import Path
from PIL import Image
from scipy.optimize import minimize_scalar


def preprocess(img_path: str, mean, std, size: int = 224):
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    sx, sy = (w - 224) // 2, (h - 224) // 2
    img = img.crop((sx, sy, sx + 224, sy + 224))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    for c in range(3):
        arr[..., c] = (arr[..., c] - mean[c]) / std[c]
    arr = arr.transpose(2, 0, 1)
    return np.expand_dims(arr, 0).astype(np.float32)


def softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - np.max(x, axis=-1, keepdims=True))
    return e / np.sum(e, axis=-1, keepdims=True)


def nll(T: float, logits: np.ndarray, labels: np.ndarray) -> float:
    scaled = logits / T
    probs = softmax(scaled)
    n = len(logits)
    return -np.sum(np.log(probs[np.arange(n), labels] + 1e-12)) / n


def compute_ece(probs: np.ndarray, labels: np.ndarray, n_bins: int = 10) -> float:
    confs = np.max(probs, axis=-1)
    preds = np.argmax(probs, axis=-1)
    correct = (preds == labels).astype(np.float64)
    bin_boundaries = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for i in range(n_bins):
        lo, hi = bin_boundaries[i], bin_boundaries[i + 1]
        in_bin = (confs > lo) & (confs <= hi)
        if np.sum(in_bin) == 0:
            continue
        bin_acc = np.mean(correct[in_bin])
        bin_conf = np.mean(confs[in_bin])
        ece += np.sum(in_bin) * abs(bin_acc - bin_conf)
    return ece / len(confs)


def main() -> int:
    parser = argparse.ArgumentParser(description="Calibrate ONNX model temperature")
    parser.add_argument("model_path", type=str)
    parser.add_argument("labels_path", type=str)
    parser.add_argument("image_dir", type=str)
    parser.add_argument("--runs", type=int, default=5, help="inference runs per image")
    parser.add_argument(
        "--labels-csv",
        type=str,
        default=None,
        help="CSV with columns image_path,true_label_index for ground-truth calibration",
    )
    args = parser.parse_args()

    model_path = args.model_path
    labels_path = args.labels_path
    image_dir = args.image_dir

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

    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    inp_name = sess.get_inputs()[0].name
    out_name = sess.get_outputs()[0].name

    # Collect logits from multiple runs
    all_logits = []
    for img in images:
        x = preprocess(str(img), mean, std)
        for _ in range(args.runs):
            logits = sess.run([out_name], {inp_name: x})[0]
            all_logits.append(logits[0])

    logits = np.array(all_logits)
    n = len(logits)

    self_referential = True
    if args.labels_csv:
        labels_map = {}
        with open(args.labels_csv, newline="") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 2:
                    labels_map[row[0]] = int(row[1])
        labels = np.array(
            [labels_map.get(str(img), np.argmax(logits[i], axis=-1)) for i, img in enumerate(images)]
        )
        self_referential = False
    else:
        # ponytail: self-referential ECE — argmax pseudo-labels
        labels = np.argmax(logits, axis=-1)
        print(
            "WARNING: No --labels-csv provided. "
            "Using argmax-of-logits as pseudo-labels (self-referential). "
            "The ECE computed this way is an UPPER BOUND on calibration quality, "
            "NOT a measurement of true calibration. "
            "Provide --labels-csv with ground-truth labels for true ECE.",
            file=sys.stderr,
        )

    # Fit temperature via NLL minimization
    result = minimize_scalar(
        nll, args=(logits, labels), bounds=(0.1, 10.0), method="bounded"
    )
    T = result.x

    # Compute ECE at optimal T
    scaled = logits / T
    probs = softmax(scaled)
    ece = float(compute_ece(probs, labels))

    # Compute uncalibrated ECE for comparison
    raw_probs = softmax(logits)
    raw_ece = float(compute_ece(raw_probs, labels))

    print(f"Model: {model_path}")
    print(f"Images: {len(images)}, Runs per image: {args.runs}, Total samples: {n}")
    print(f"Optimal T: {T:.4f}")
    print(f"Uncalibrated ECE: {raw_ece:.4f} ({raw_ece * 100:.2f}%)")
    print(f"Calibrated ECE:   {ece:.4f} ({ece * 100:.2f}%)")
    print(f"ECE improvement:  {(raw_ece - ece) * 100:.2f}pp")
    if self_referential:
        print(
            "NOTE: ECE is self-referential (upper bound on calibration quality), "
            "not true calibration against ground truth.",
            file=sys.stderr,
        )

    # Write temperature file
    model_stem = Path(model_path).stem
    out_path = Path("pwa/model") / f"{model_stem}-T.json"
    artifact = {
        "model": model_stem,
        "temperature": float(T),
        "ece": ece,
        "ece_uncalibrated": raw_ece,
        "n_samples": n,
        "n_images": len(images),
        "self_referential": self_referential,
    }
    with open(out_path, "w") as f:
        json.dump(artifact, f, indent=2)
    print(f"\nWritten: {out_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
