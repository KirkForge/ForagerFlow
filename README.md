# ForagerFlow

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support%20my%20hardware-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/KirkForge)

Offline-first PWA for mushroom identification using ONNX models running entirely in the browser.

## How the weights are handled

The HuggingFace repos (`BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224` and `dima806/mushrooms_image_detection`) only ship **PyTorch checkpoints** — there is no prebuilt ONNX to download. The ONNX weights are produced locally by exporting from PyTorch, then shipped as part of the PWA bundle.

**This means:**

- The GitHub repo intentionally contains **no ONNX weights** — only the export scripts. (Earlier in-repo `.onnx` files were shape-only stubs that referenced missing `.onnx.data` sidecars and would crash at inference; they are no longer tracked.)
- The CI on every push (`ci.yml`) builds the JS bundle only. No Python, no PyTorch, no 420 MB of weights — runs in ~30 s.
- A separate **`release.yml` workflow** runs only on GitHub release (or manual dispatch) and does the heavy lifting: installs PyTorch, exports both ONNX models, smoke-tests their output shapes, then bundles the JS and uploads the result as a release asset.

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

3. Install JS deps and run the dev server. The static `pwa/` directory is what the app actually serves.
   ```bash
   pnpm install
   pnpm dev
   ```

4. Open `http://localhost:5173` in a browser.

## Cutting a release

Tag a commit and push the tag, or use the GitHub UI:

```bash
git tag v2.1.0
git push origin v2.1.0
```

Then on GitHub, draft a release for that tag and publish it. The `release.yml` workflow will run, export the real ONNX, and attach the full `pwa/` bundle (JS + CSS + manifest + service worker + the two ONNX weights) to the release as a downloadable asset. Upload the contents of that asset to your static host (GitHub Pages, Netlify, Cloudflare Pages, etc.).

To do a dry-run build without publishing a release, use the Actions tab → "Release" → "Run workflow".

## Safety

This app runs client-side inference with no remote API. All predictions are local. **Always verify identifications with a certified mycologist before consuming any wild mushroom.**

## Models

- **BVRA Specialist** (`fungitastic.onnx`): 215-class ResNeXt-50 trained on FungiTastic-Mini. Source: [`BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224`](https://huggingface.co/BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224).
- **dima806 General** (`dima806.onnx`): 100-class ViT. Source: [`dima806/mushrooms_image_detection`](https://huggingface.co/dima806/mushrooms_image_detection).

## Build checks

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint
pnpm test             # vitest run (56 tests, no ONNX needed)
pnpm build            # vite build → dist/
node scripts/verify-labels.cjs
```

The `verify-labels` script asserts that the labels embedded in `pwa/js/app.js` match the canonical lists (`pwa/model/fungitastic-classes.json` for BVRA, `src/data/labels-dima806.json` for dima806) exactly, order-sensitive — so logit index `i` always maps to the same species. It also checks that every label has a knowledge entry in `pwa/js/knowledge.js`.
