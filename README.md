# ForagerFlow

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support%20my%20hardware-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/KirkForge)

Offline-first PWA for mushroom identification using ONNX models running entirely in the browser.

## How the weights are handled

The HuggingFace repos (`BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224` and `dima806/mushrooms_image_detection`) only ship **PyTorch checkpoints** — there is no prebuilt ONNX to download. The ONNX weights are produced locally by exporting from PyTorch, then shipped as part of the PWA bundle.

**This means:**

- The GitHub repo contains **no ONNX weights** — only the export scripts.
- The CI on every push (`ci.yml`) runs typecheck, lint, format check, tests, build, dist/label verification, e2e, and audit. It does not export ONNX models or download PyTorch weights.
- A separate **`release.yml` workflow** runs only on release (or manual dispatch): installs PyTorch, exports both ONNX models, smoke-tests their shapes, and attaches the full `dist/` bundle as a release asset.

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

3. Install JS deps. The TypeScript app under `src/` is the only maintained implementation. `pnpm build` produces the static `dist/` directory, which is what should be hosted.
   ```bash
   pnpm install
   pnpm dev          # vite dev server on http://localhost:5173
   pnpm build        # → dist/
   pnpm preview      # serve the built dist/ locally
   ```

4. Open `http://localhost:5173` in a browser.

## Configuration

Copy `.env.example` to `.env` to set optional runtime values such as `VITE_TELEMETRY_ENDPOINT`, `VITE_TELEMETRY_BUFFER_SIZE`, and feature flags.

## Documentation

- [Privacy policy](docs/privacy-policy.md)
- [Accessibility statement](docs/accessibility-statement.md)
- [Model card](docs/model-card.md)

## Cutting a release

Tag a commit and push the tag, or use the GitHub UI:

```bash
git tag v2.1.0
git push origin v2.1.0
```

Then on GitHub, draft a release for that tag and publish it. The `release.yml` workflow will run, export the real ONNX, and attach the full `dist/` bundle (JS + CSS + manifest + service worker + the two ONNX weights) to the release as a downloadable asset. Upload the contents of that asset to your static host (GitHub Pages, Netlify, Cloudflare Pages, etc.). The `pwa/model/` directory is the export target and the source of truth for the BVRA class list; the deployable bundle is `dist/`.

To do a dry-run build without publishing a release, use the Actions tab → "Release" → "Run workflow".

## Repository name

`KirkForge_Android-Forager` is the original repo path. The implementation is a Vite + TypeScript **PWA**; the deployable artifact is the static `dist/` bundle. It can be wrapped as an Android **Trusted Web Activity (TWA)** or installed directly from the browser. The app brand is **ForagerFlow**.

## Deploy with Docker

After exporting the ONNX weights into `pwa/model/`, build and run the production container locally:

```bash
docker build -t foragerflow:prod .
docker run -d -p 8080:80 foragerflow:prod
```

Then open `http://localhost:8080`. The image uses pinned `node:22-alpine` and `nginx:alpine` digests, serves with COOP/COEP/CSP/HSTS headers, and runs the nginx worker as an unprivileged user.

## Safety

**All inference is client-side.** No images or predictions leave the device.

The app identifies species; it **does not certify edibility**. It will not tell you a mushroom is safe to eat. Always confirm with a certified mycologist or poison control center before consuming anything foraged.

Safety UI:

- Full-screen first-run acknowledgement before camera access.
- Sticky footer: *"Never eat a wild mushroom based on this app."*
- Capture button busy state prevents double submits.
- Clear-history requires confirmation.
- Warnings for low confidence, poisonous top-1, and poisonous lookalikes in the top 3.
- dima806 model hidden on low-memory or slow-connection devices and gated by a size warning on first use.
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
pnpm test                   # vitest run (interactive, see package.json "test")
pnpm test:ci                # vitest run (CI mode)
pnpm build                  # vite build → dist/
node scripts/verify-labels.cjs   # label/logit alignment + knowledge coverage
pnpm verify:dist            # python3 scripts/test-dist.py — built-asset smoke checks
pnpm e2e                    # playwright test — browser smoke tests
pnpm e2e:ci                 # CI=true playwright test --project=chromium --project=firefox
pnpm verify:inference       # python3 scripts/test-inference.py — real-ONNX sanity (requires export)
pnpm verify                 # the whole battery: typecheck + lint + test:ci + build + verify:dist + verify:labels
```

`verify:dist` checks the built bundle for required assets, `importScripts` worker loading, the `wasm` execution provider, and `wasm-unsafe-eval` in the CSP.

`verify:labels` checks that BVRA labels match the canonical class list order and that every label has a knowledge entry. dima806 labels are checked for 100 unique entries with knowledge coverage.
