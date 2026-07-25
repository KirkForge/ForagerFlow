#!/usr/bin/env python3
"""Generate labels.csv from model predictions (pseudo-labels) for calibration.

This script runs inference on test images and records the top-1 prediction
index for each image, creating a labels.csv that can be fed to calibrate.py
with --labels-csv.

NOTE: These are MODEL-DERIVED pseudo-labels, NOT ground-truth labels. The ECE
computed with these labels is identical to the self-referential ECE. This
script exists to demonstrate the --labels-csv workflow and produce the
calibration artifacts. For true ECE measurement, replace labels.csv with
ground-truth labels from an expert-validated dataset.
"""
import csv
import json
import sys
import numpy as np
import onnxruntime as ort
from pathlib import Path
from PIL import Image


def preprocess(img_path, mean, std, size=224):
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    sx, sy = (w - size) // 2, (h - size) // 2
    img = img.crop((sx, sy, sx + size, sy + size))
    arr = np.asarray(img, dtype=np.float32) / 255.0
    for c in range(3):
        arr[..., c] = (arr[..., c] - mean[c]) / std[c]
    arr = arr.transpose(2, 0, 1)
    return np.expand_dims(arr, 0).astype(np.float32)


def main():
    model_path = sys.argv[1]
    classes_path = sys.argv[2]
    image_dir = sys.argv[3]
    output_csv = sys.argv[4] if len(sys.argv) > 4 else "labels.csv"

    with open(classes_path) as f:
        classes = json.load(f)

    if "dima806" in model_path:
        mean, std = [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]
    else:
        mean, std = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

    session = ort.InferenceSession(model_path)
    input_name = session.get_inputs()[0].name

    images = sorted(Path(image_dir).glob("*.jpg"))
    rows = []
    for img_path in images:
        tensor = preprocess(str(img_path), mean, std)
        logits = session.run(None, {input_name: tensor})[0][0]
        pred_idx = int(np.argmax(logits))
        e = np.exp(logits - np.max(logits))
        probs = e / e.sum()
        pred_conf = float(probs[pred_idx])
        rows.append({
            "filename": img_path.name,
            "ground_truth_label_index": pred_idx,
            "predicted_species": classes[pred_idx],
            "confidence": f"{pred_conf:.4f}",
        })
        print(f"  {img_path.name}: {classes[pred_idx]} ({pred_conf:.2%})")

    with open(output_csv, "w", newline="") as f:
        writer = csv.writer(f)
        for row in rows:
            writer.writerow([row["filename"], row["ground_truth_label_index"]])

    print(f"\nWrote {output_csv} ({len(rows)} entries)")
    print("WARNING: Labels are model-derived pseudo-labels, NOT ground truth.")


if __name__ == "__main__":
    main()
