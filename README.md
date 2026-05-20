# Foragerflow

Offline-first PWA for mushroom identification using ONNX models running entirely in the browser.

## Setup

1. Export ONNX models:
   ```bash
   python export_bvra_onnx.py
   python export_dima806_onnx.py
   ```

2. Serve the PWA:
   ```bash
   cd pwa
   python -m http.server 8000
   ```

3. Open `http://localhost:8000` in a browser.

## Deployment

Deploy the contents of `pwa/` to any static host. The app is a single-page PWA with a service worker for offline use. Model files (`.onnx` and `.onnx.data`) are large; the service worker caches them lazily on first use.

## Safety

This app runs client-side inference with no remote API. All predictions are local. **Always verify identifications with a certified mycologist before consuming any wild mushroom.**

## Models

- **BVRA Specialist** (`fungitastic.onnx`): 215-class ResNeXt-50 trained on FungiTastic-Mini.
- **dima806 General** (`dima806.onnx`): 100-class ViT trained on a general mushroom dataset.

## Build Check

```bash
node scripts/verify-labels.js
```

Asserts that every model's label list length matches its expected class count and that every label has a knowledge entry.
