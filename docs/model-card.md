# Model Card — ForagerFlow

## Models

ForagerFlow bundles two independent image-classification models for mushroom identification.

### BVRA Specialist

- **Identifier**: `fungitastic.onnx`
- **Architecture**: ResNeXt-50 (32x4d)
- **Classes**: 215 FungiTastic-Mini species
- **Input**: 224×224 RGB, mean `[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]`
- **Source**: `BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224` on HuggingFace
- **ONNX size**: ~90 MB
- **Runtime execution provider**: WebAssembly (`wasm`) via ONNX Runtime Web

### dima806 General

- **Identifier**: `dima806.onnx`
- **Architecture**: ViT
- **Classes**: 100 general mushroom classes
- **Input**: 224×224 RGB
- **Source**: `dima806/mushrooms_image_detection` on HuggingFace
- **ONNX size**: ~330 MB
- **Runtime execution provider**: WebAssembly (`wasm`) via ONNX Runtime Web

## Intended use

- Educational field identification aid.
- Offline, client-side inference on a personal device.

## Out-of-scope use

- **Not a safety or edibility certification.** The model predicts a species label; it does not certify that a mushroom is safe to eat.
- **Not a replacement for expert identification.** Always verify with a certified mycologist or poison control center.
- Not suitable for critical decision-making without human review.

## Performance and limitations

- Models were trained on curated datasets and may fail on unusual lighting, angles, habitats, or species not in the training distribution.
- Predictions below 50% confidence are flagged as low-confidence.
- A poisonous or unknown species in the top-3 always triggers an additional warning, regardless of top-1 confidence. (Fail-closed: a toxic lookalike near a confident edible prediction is still surfaced.)
- Class list and knowledge data are verified at build time for label/logit alignment.
- **Calibration:** Temperature scaling is fitted per model via `scripts/calibrate.py`. The BVRA specialist model has T=0.1 with a self-referential ECE (upper bound on calibration quality) of 1.97% (vs 64.69% uncalibrated) on the reference test set — no labeled validation split was available, so this measures model self-consistency, not true calibration against ground truth. The dima806 general model uses T=1.0 (no scaling) pending a calibration set. See `tests/calibration.test.ts` for the fixture-verified assertion that calibrated ECE < uncalibrated ECE.

## Bias and safety notes

- Training data reflects the datasets’ geographic and taxonomic coverage. Underrepresented species, regions, or phenotypes may see degraded accuracy.
- The app does not use demographic or user-specific data; inference is deterministic per input image.
- Fail-closed behavior: missing knowledge for a predicted species is treated as potentially poisonous.
