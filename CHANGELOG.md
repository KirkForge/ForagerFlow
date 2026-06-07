# Changelog

All notable changes to ForagerFlow are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com).

## [Unreleased]

### Added
- **First-run safety modal.** Full-screen `<dialog>` with a `showModal()`
  top layer. The "Continue" button is disabled until the
  acknowledgement checkbox is checked. Acceptance is persisted in
  `localStorage["ff:safety-ack-v1"]`; bump the version constant in
  `src/ui/safety.ts` to re-prompt after a copy change.
- **Sticky safety footer.** Always-visible 32 px band at the bottom of
  the viewport. Lives at the end of the `#app` flex column so it
  cannot be scrolled past and the camera shrinks to make room. Text:
  *"Never eat a wild mushroom based on this app."* with a
  "Find a mycologist" deep link.
- **Phone-first capture button busy state.** `data-busy="true"` on
  `#capture-btn` renders a spinner overlay, disables the button, and
  sets `aria-busy="true"` so a wet thumb cannot double-fire and
  submit two inferences.
- **Camera-permission fallback button.** Replaces the broken
  `<label for=...>` that needed the file input to be visible next to
  it (off-screen on landscape phones). Now a full-width "Choose a
  photo" button programmatically clicks the hidden input.
- **Last-identification callout.** On app start, the most recent
  history entry is rendered as a compact band above the camera
  viewfinder, so a returning field user can verify a species they
  identified earlier without scrolling. Hidden if there is no
  history.
- **Clear-history confirm modal.** Replaces the immediate
  `clearHistory()` call that previously allowed a one-fat-finger
  data loss.
- **dima806 capability gate.** The 330 MB dima806 option is hidden
  on devices that report `navigator.deviceMemory < 4`,
  `hardwareConcurrency < 4`, or `connection.effectiveType` in
  `{slow-2g, 2g, 3g}`. On capable devices, the first time the user
  picks it, a confirm modal explains the size and the offline cache
  implication; acceptance is persisted in
  `localStorage["ff:dima-confirm-v1"]` so we never ask again.
- **Pre-model-load storage confirm.** `inferenceService.switchModel()`
  calls `navigator.storage.estimate()` and emits a new
  `storageConfirm` event when there is less than 500 MB of free
  space. The UI listens and shows a confirm modal; the user accepting
  resumes the load via `inferenceService.resumeStorageConfirm(token)`.
- **Verify-this-species link.** Each top-1 prediction in
  `src/ui/results.ts` now appends an anchor that opens a Google
  search for `"<species> mushroom identification"` in a new tab.
  The URL is built with the `URL` constructor and `searchParams`
  so the host cannot be tampered with by an attacker controlling
  the species name.
- **`pnpm verify:dist` and `pnpm verify:inference` scripts.** Wire
  the existing `scripts/test-dist.py` and `scripts/test-inference.py`
  into `package.json` so CI can gate on them. `verify:dist` is
  included in the every-push `pnpm ci` aggregator.

### Changed
- **`src/services/history.ts` split into a barrel + dynamic sub-module.**
  `src/services/history/index.ts` re-exports `saveIdentification`,
  `getHistory`, `clearHistory` for static import. `deleteEntry` lives
  in `src/services/history/delete-entry.ts` and is dynamically
  imported by `src/main.ts` only when a history row's delete button
  is tapped. Vite now produces a separate `assets/delete-entry-*.js`
  chunk and the "mixed import" build warning is gone.
- **`scripts/verify-labels.cjs` repointed at `src/data/`.** Previously
  parsed labels out of the now-deleted `pwa/js/app.js`. Now compares
  `src/data/labels-bvra.json` against the canonical
  `pwa/model/fungitastic-classes.json` order-sensitively, and checks
  `src/data/knowledge-{bvra,dima806}.json` for coverage. The
  `pwa/model/` directory remains the export target and the source
  of truth for the BVRA class list.
- **README rewrite.** Drops the "pwa/ is what the app actually serves"
  line, points Setup at `dist/`, drops the wrong test-count claim,
  adds a "Phone-first safety behaviour" section that documents the
  modal, sticky footer, capture busy state, capability gate, storage
  confirm, and verify-this-species link.
- **`InferenceService` event map extended** with
  `storageConfirm: { modelKey, freeBytes, token }`. The map is still
  type-safe — adding the event required only the interface entry.

### Removed
- **Legacy `pwa/` app directory.** `pwa/index.html`, `pwa/sw.js`,
  `pwa/css/style.css`, `pwa/manifest.json`, and `pwa/js/{app,knowledge,worker,ort.*}.{js,wasm,mjs}`
  are gone. `pwa/model/` is retained as the export target and
  canonical BVRA class list. The TypeScript app under `src/` is the
  single maintained implementation; `dist/` is the deployable.

### Fixed
- **Vite "mixed dynamic+static import" build warning** for
  `src/services/history.ts` — see Changed.
- **README inconsistency** that claimed `pwa/` was served and that
  there were 56 tests.
- **In-app safety message could be missed** by a returning user who
  jumps straight to the camera. Now there is no path to the camera
  without acknowledging the first-run modal, and the sticky footer
  is always visible.

## [2.1.0] — 2025-05-28

### Added
- **TypedEmitter**: Type-safe event emitter replacing loose `.on()` pattern in InferenceService
- **Inference retry**: Auto-retry with exponential backoff (up to 3 retries) for recoverable worker errors
- **Inference queue**: Requests made while model is loading are now queued and flushed when ready
- **AppState machine**: `ApplicationState` enum tracks Loading → CameraActive → Processing → Done
- **HTML sanitization**: `escapeHtml()` and `sanitizeText()` prevent XSS in dynamic content
- **Telemetry system**: `recordTelemetry()`, `measureAsync()`, `measureSync()` for structured metrics
- **Web Vitals**: LCP, CLS, TTFB collection via PerformanceObserver → telemetry pipeline
- **Runtime config**: `config` module with feature flags and env-var overrides (`VITE_*`)
- **Barrel exports**: `core/index.ts`, `inference/index.ts`, `services/index.ts`, `ui/index.ts`, `data/index.ts`
- **CI security**: `pnpm audit` and license-check step added to GitHub Actions
- **CONTRIBUTING.md**: Full contribution guide with architecture overview
- **CHANGELOG.md**: This file
- Tests: `emitter.test.ts`, `sanitize.test.ts`, `telemetry.test.ts`, `connectivity.test.ts`, `image-input.test.ts`

### Changed
- **InferenceService** now extends `TypedEmitter<InferenceEvents>` — event handlers are type-safe
- **`on("result")` callback** receives `{ logits, modelKey }` object instead of positional args
- **`InferenceService.terminate()`** now clears inference queue and removes all listeners
- **`ci.sh`** now uses `pnpm` instead of `npm`, adds `typecheck` and `verify:labels` steps
- **History rendering** in `AppController` now sanitizes all dynamic content via `sanitizeText()`
- **CSS**: Added missing custom properties (`--border`, `--surface-1`, `--text-muted`, `--space-*`, `--radius-sm`)

### Fixed
- **Duplicate `<script>` tag** in `index.html` removed
- **Undefined CSS variables** in history panel styles now resolve correctly
- **`LabelMismatchError`** now used instead of generic `AppError` for logit/label mismatches
- **`ci.sh`** was using `npm` — now uses `pnpm` per project rules

## [2.0.0] — 2025-05-20

### Added
- Offline-first PWA for mushroom identification
- Two ONNX models: BVRA Specialist (215 classes) and Dima806 General (100 classes)
- Camera capture and file upload input
- IndexedDB-backed identification history
- Service Worker with versioned caching
- Docker deployment via nginx with security headers
- GitHub Actions CI pipeline
- Vitest test suite with coverage thresholds
