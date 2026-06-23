# ForagerFlow

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support%20my%20hardware-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/KirkForge)

Offline-first PWA for mushroom identification using ONNX models running entirely in the browser.

## How the weights are handled

The HuggingFace repos ([`BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224`](https://huggingface.co/BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224) and [`dima806/mushrooms_image_detection`](https://huggingface.co/dima806/mushrooms_image_detection)) ship **PyTorch checkpoints only**. The ONNX weights are produced locally by exporting from PyTorch, then shipped as part of the PWA bundle.

- This repo contains **no ONNX weights** — only the export scripts.
- CI runs typecheck, lint, tests, build, dist/label verification, and e2e. It does not export ONNX models.
- A separate **`release.yml`** workflow exports both ONNX models and attaches the full `dist/` bundle as a release asset.

## Setup (local dev)

1. Install Python deps for the ONNX export. CPU-only torch is fine — export is graph tracing, not training.
   ```bash
   python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
   python -m pip install timm transformers onnx
   ```

2. Export the ONNX weights into `pwa/model/`. The first run downloads the PyTorch checkpoints from HuggingFace (~350 MB total) and caches them under `~/.cache/huggingface/`.
   ```bash
   python export_bvra_onnx.py
   python export_dima806_onnx.py
   ```
   After this, `pwa/model/fungitastic.onnx` (~90 MB) and `pwa/model/dima806.onnx` (~330 MB) exist locally. **They are gitignored** — never commit them.

3. Install JS deps and run the Vite app.
   ```bash
   pnpm install
   pnpm dev          # http://localhost:5173
   pnpm build        # → dist/
   pnpm preview      # serve dist/ locally
   ```

## Configuration

Copy `.env.example` to `.env` to set optional runtime values such as `VITE_TELEMETRY_ENDPOINT` and feature flags.

## Documentation

- [Privacy policy](docs/privacy-policy.md)
- [Accessibility statement](docs/accessibility-statement.md)
- [Model card](docs/model-card.md)
- [TWA packaging](docs/twa-packaging.md)

## Trusted Web Activity (Android APK)

The repo includes a minimal TWA shell under `twa/` that wraps the PWA as an installable Android app without any native runtime. See [`docs/twa-packaging.md`](docs/twa-packaging.md) for domain verification, signing, and Play Console steps.

To build the unsigned release APK locally (requires Android SDK):

```bash
pnpm build
TWA_HOST=foragerflow.example.com node scripts/generate-assetlinks.cjs
TWA_HOST=foragerflow.example.com node scripts/build-twa.cjs
# → dist/twa/foragerflow-release-unsigned.apk
```

The release workflow builds and uploads the APK automatically when a GitHub release is published.

## Cutting a release

```bash
git tag v2.1.0
git push origin v2.1.0
```

Then draft a release for that tag on GitHub and publish it. The `release.yml` workflow exports the ONNX models and attaches the full `dist/` bundle as a release asset. Upload that asset to your static host.

For a dry-run without publishing, use the Actions tab → "Release" → "Run workflow".

## Repository name

`KirkForge_Android-Forager` is the original repo path. The implementation is a Vite + TypeScript **PWA**; the deployable artifact is the static `dist/` bundle. It can be wrapped as an Android **Trusted Web Activity (TWA)** or installed directly from the browser. The app brand is **ForagerFlow**.

## Deploy with Docker

After exporting the ONNX weights into `pwa/model/`:

```bash
docker build -t foragerflow:prod .
docker run -d -p 8080:80 foragerflow:prod
```

Open `http://localhost:8080`. The image uses pinned `node:22-alpine` and `nginx:alpine` digests and serves with COOP/COEP/CSP/HSTS headers.

## Safety

**All inference is client-side.** No images or predictions leave the device.

The app identifies species; it **does not certify edibility**. Always confirm with a certified mycologist or poison control center before consuming anything foraged.

Safety UI:

- First-run acknowledgement before camera access.
- Sticky safety footer.
- Capture button busy state to prevent double submits.
- Clear-history confirmation.
- Warnings for low confidence, poisonous top-1, and poisonous lookalikes in the top 3.
- dima806 model gated by a first-use size warning and a storage-estimate confirmation.
- Storage-estimate confirmation before large model downloads when free space is below 500 MB.

## Models

- **BVRA Specialist** (`fungitastic.onnx`): 215-class ResNeXt-50 trained on FungiTastic-Mini. Source: [`BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224`](https://huggingface.co/BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224).
- **dima806 General** (`dima806.onnx`): 100-class ViT. Source: [`dima806/mushrooms_image_detection`](https://huggingface.co/dima806/mushrooms_image_detection).

## Build checks

```bash
pnpm typecheck              # tsc --noEmit
pnpm lint                   # eslint
pnpm format                 # prettier --write
pnpm format:check           # prettier --check
pnpm test                   # vitest run
pnpm test:ci                # vitest run (CI mode)
pnpm build                  # vite build → dist/
node scripts/verify-labels.cjs   # label/logit alignment + knowledge coverage
pnpm verify:dist            # built-asset smoke checks
pnpm e2e                    # playwright smoke tests
pnpm e2e:ci                 # CI=true playwright chromium + firefox
pnpm verify:inference       # real-ONNX sanity (requires export)
pnpm verify                 # typecheck + lint + test:ci + build + verify:dist + verify:labels
```

`verify:dist` checks the built bundle for required assets, `importScripts` worker loading, the `wasm` execution provider, and `wasm-unsafe-eval` in the CSP.

`verify:labels` checks that BVRA labels match the canonical class list order and that every label has a knowledge entry. dima806 labels are checked for 100 unique entries with knowledge coverage.
