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

3. Install JS deps. The TypeScript app under `src/` is the only maintained implementation. `pnpm build` produces the static `dist/` directory, which is what should be hosted.
   ```bash
   pnpm install
   pnpm dev          # vite dev server on http://localhost:5173
   pnpm build        # → dist/
   pnpm preview      # serve the built dist/ locally
   ```

4. Open `http://localhost:5173` in a browser.

## Cutting a release

Tag a commit and push the tag, or use the GitHub UI:

```bash
git tag v2.1.0
git push origin v2.1.0
```

Then on GitHub, draft a release for that tag and publish it. The `release.yml` workflow will run, export the real ONNX, and attach the full `dist/` bundle (JS + CSS + manifest + service worker + the two ONNX weights) to the release as a downloadable asset. Upload the contents of that asset to your static host (GitHub Pages, Netlify, Cloudflare Pages, etc.). The `pwa/model/` directory is the export target and the source of truth for the BVRA class list; the deployable bundle is `dist/`.

To do a dry-run build without publishing a release, use the Actions tab → "Release" → "Run workflow".

## Safety

**This app runs client-side inference with no remote API.** All predictions are local.

The app will:

- Show a full-screen first-run acknowledgement that must be checked before
  the camera opens. You are agreeing that you understand the app is not a
  substitute for expert identification.
- Display a sticky footer at the bottom of the screen at all times:
  *"Never eat a wild mushroom based on this app."*
- Surface a "Verify this species online" link under each top-1 prediction
  that opens a Google search for the species name in a new tab. Use it.
- Show per-prediction warnings on low confidence, poisonous lookalikes in
  the top 3, poisonous top-1, and unknown edibility.

The app will **not**:

- Tell you a mushroom is safe to eat. It identifies species; it does not
  certify edibility. Even a 99.9% match on a deadly species is a 0.1%
  chance of misidentification.
- Phone home, log your images, or contact any safety service.

**Always verify identifications with a certified mycologist or your local poison control center before consuming any wild mushroom.**

### Phone-first safety behaviour

Because this app is designed to be used in the field on a phone:

- The first-run safety modal is `showModal()` with a `<dialog>` top layer.
  It cannot be dismissed by tapping outside it. The "Continue" button
  stays disabled until the acknowledgement checkbox is checked.
- The sticky footer is always visible at the bottom of the viewport, in
  the same 32–36 px band the OS uses for navigation chrome. It cannot
  be scrolled past.
- The capture button has a busy state (`data-busy="true"`) with a
  spinner overlay and is disabled while inference is running, so a
  wet thumb cannot double-fire and submit two inferences.
- On app start, the most recent identification is shown as a callout
  above the camera viewfinder, so a returning user can verify a species
  they identified earlier without scrolling.
- The "Clear history" button opens a confirm dialog before destroying
  IndexedDB data. A one-tap data loss is not possible.
- The 330 MB dima806 model is hidden from the dropdown on devices that
  report `navigator.deviceMemory < 4`, `hardwareConcurrency < 4`, or
  `connection.effectiveType` in `{slow-2g, 2g, 3g}`. On capable
  devices, the first time the user picks it, a confirm modal explains
  the size and the offline cache implication.
- Before any large model download, the app calls
  `navigator.storage.estimate()` and shows a confirm modal if there is
  less than 500 MB of free storage. Users on 32 GB phones get a
  chance to cancel before the OS starts evicting their camera roll.
- Camera-permission denial no longer relies on a `<label for=...>`
  that needs the input to be visible next to it. The fallback is a
  full-width "Choose a photo" button that taps a hidden file input.

## Models

- **BVRA Specialist** (`fungitastic.onnx`): 215-class ResNeXt-50 trained on FungiTastic-Mini. Source: [`BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224`](https://huggingface.co/BVRA/resnext50_32x4d.in1k_ft_fungitastic-mini_224).
- **dima806 General** (`dima806.onnx`): 100-class ViT. Source: [`dima806/mushrooms_image_detection`](https://huggingface.co/dima806/mushrooms_image_detection).

## Build checks

```bash
pnpm typecheck              # tsc --noEmit
pnpm lint                   # eslint
pnpm test                   # vitest run (see package.json "test")
pnpm build                  # vite build → dist/
node scripts/verify-labels.cjs   # label/logit alignment + knowledge coverage
pnpm verify:dist            # python3 scripts/test-dist.py — built-asset smoke checks
pnpm verify:inference       # python3 scripts/test-inference.py — real-ONNX sanity (requires export)
pnpm verify                 # the whole battery: typecheck + lint + test + build + verify:dist + verify:labels
```

`verify:dist` asserts that `sw.js` exists, `ort.min.js` is present at
`/js/ort.min.js`, the worker uses `importScripts` and the `wasm`
execution provider, the CSP includes `wasm-unsafe-eval`, and the
built HTML points at the worker correctly. Catches the regressions
that have hit the bundle in past builds (ort free var, sw.ts missing
from vite inputs, CSP missing `wasm-unsafe-eval`).

`verify-labels` asserts that the BVRA labels in
`src/data/labels-bvra.json` match the canonical class list shipped
with the ONNX model (`pwa/model/fungitastic-classes.json`) exactly,
order-sensitive, and that every unique label has an entry in
`src/data/knowledge-bvra.json`. The dima806 side asserts the label
array has 100 unique entries and that each has a knowledge entry.
