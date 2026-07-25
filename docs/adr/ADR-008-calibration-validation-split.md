# ADR-008: Calibration validation split and temperature fitting

**Status:** Accepted  
**Date:** 2026-07-25

## Context

ForagerFlow uses temperature scaling to calibrate ONNX model confidence scores. `scripts/calibrate.py` fits a single temperature parameter `T` via NLL minimization on logits, then computes Expected Calibration Error (ECE). Without `--labels-csv`, the script falls back to argmax-of-logits pseudo-labels (self-referential, upper-bound only).

This ADR documents the validation split used for calibration, the fitted temperatures, and the methodology limitations.

## Decision

Use the 5-image `test-images/` directory as the calibration validation split with model-derived pseudo-labels, and document that true ECE requires an expert-labeled external dataset.

## Validation split

- **Source:** `test-images/` — 5 mushroom photographs (`test-mushroom-0.jpg` through `test-mushroom-4.jpg`)
- **Label provenance:** Model-derived pseudo-labels (argmax of raw logits). NOT ground-truth expert labels.
- **Label-map version:** BVRA uses `pwa/model/fungitastic-classes.json` (215 classes); Dima806 uses `src/data/labels-dima806.json` (100 classes)
- **Split size:** 5 images, 1 run each = 5 samples per model (small split; statistically limited)

## Fitted temperatures

### BVRA (fungitastic, 215 classes)

| Metric | Value |
|--------|-------|
| Temperature (T) | 0.1000 |
| ECE (uncalibrated) | 0.6469 (64.69%) |
| ECE (calibrated) | 0.0197 (1.97%) |
| ECE improvement | 62.72 pp |
| Source fixture | `tests/fixtures/bvra-T.json` |

### Dima806 (general, 100 classes)

| Metric | Value |
|--------|-------|
| Temperature (T) | 0.1000 |
| ECE (uncalibrated) | 0.9329 (93.29%) |
| ECE (calibrated) | 0.1296 (12.96%) |
| ECE improvement | 80.33 pp |
| Source fixture | `tests/fixtures/dima806-T.json` |

## Methodology limitations

1. **Pseudo-labels are self-referential.** The labels are the model's own argmax predictions. ECE computed this way measures how well temperature scaling reduces overconfidence relative to the model's own decisions — it does NOT measure calibration against ground truth. The reported ECE is an upper bound on calibration quality.

2. **Small split (5 images).** Statistical power is limited. ECE variance is high with so few samples.

3. **True ECE requires expert labels.** To measure real calibration error, `labels.csv` must contain ground-truth species labels from a qualified mycologist. The `scripts/calibrate.py --labels-csv` workflow supports this; replace `labels-bvra.csv` / `labels-dima806.csv` with expert-labeled data and re-run.

## Remediation path

1. Assemble 50-100 labeled mushroom images from a mycological dataset (e.g., MNHN Fungarium, Mushroom Observer)
2. Write `labels.csv` with `filename,ground_truth_label_index` columns
3. Re-run: `python3 scripts/calibrate.py pwa/model/fungitastic.onnx pwa/model/fungitastic-classes.json test-images --runs 5 --labels-csv labels.csv`
4. Update `tests/fixtures/bvra-T.json` and `pwa/model/fungitastic-T.json` with new fitted T
5. Repeat for dima806

## Consequences

- Temperature scaling is applied at runtime via `ModelConfig.temperature` in `src/data/model-registry.ts`
- The fitted T values (0.1 for both models) are traceable to this ADR and the fixture files
- Calibration can be re-run when better labeled data becomes available
- The honesty warning in `scripts/calibrate.py` remains accurate: self-referential ECE is NOT true calibration
